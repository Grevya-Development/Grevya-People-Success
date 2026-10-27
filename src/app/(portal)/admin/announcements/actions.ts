"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str, bool } from "@/lib/utils";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function hr() {
  const me = await getCurrentEmployee();
  if (!me) return { error: "Not signed in" };
  if (!me.isHR) return { error: "Only HR can manage announcements" };
  return { me, supabase: await createClient() };
}

function refresh() {
  revalidatePath("/admin/announcements");
  revalidatePath("/home");
}

export async function saveAnnouncement(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hr();
  if ("error" in ctx) return fail(ctx.error!);
  const title = str(fd, "title");
  const body = str(fd, "body");
  if (!title) return fail("Title is required");
  if (title.length > 200) return fail("Title must be under 200 characters");
  if (!body) return fail("Message is required");
  if (body.length > 5000) return fail("Message must be under 5,000 characters");
  const pinned = bool(fd, "pinned");
  const id = str(fd, "id");

  if (id) {
    if (!UUID_RE.test(id)) return fail("Invalid announcement");
    const { error, count } = await ctx.supabase.from("announcements").update({ title, body, pinned }, { count: "exact" }).eq("id", id);
    if (error) return fail(dbError(error));
    if (!count) return fail("Announcement not found");
  } else {
    const { error } = await ctx.supabase.from("announcements").insert({ title, body, pinned, created_by: ctx.me.id });
    if (error) return fail(dbError(error));
  }
  refresh();
  return ok(id ? "Announcement updated" : "Announcement published");
}

export async function toggleAnnouncementPin(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hr();
  if ("error" in ctx) return fail(ctx.error!);
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid announcement");
  const pinned = bool(fd, "pinned");
  const { error } = await ctx.supabase.from("announcements").update({ pinned }).eq("id", id);
  if (error) return fail(dbError(error));
  refresh();
  return ok(pinned ? "Pinned to the top" : "Unpinned");
}

export async function deleteAnnouncement(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hr();
  if ("error" in ctx) return fail(ctx.error!);
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid announcement");
  const { error } = await ctx.supabase.from("announcements").delete().eq("id", id);
  if (error) return fail(dbError(error));
  refresh();
  return ok("Announcement deleted");
}
