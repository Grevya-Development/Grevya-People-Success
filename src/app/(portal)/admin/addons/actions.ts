"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str, num, bool } from "@/lib/utils";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_RE = /^#[0-9a-f]{6}$/i;

async function hr() {
  const me = await getCurrentEmployee();
  if (!me) return { error: "Not signed in" };
  if (!me.isHR) return { error: "Only HR can manage add-ons" };
  return { me, supabase: await createClient() };
}

/** Add-ons appear in the sidebar/header of every page and on /apps. */
function refresh() {
  revalidatePath("/", "layout");
}

export async function saveAddon(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hr();
  if ("error" in ctx) return fail(ctx.error!);
  const name = str(fd, "name");
  if (!name) return fail("Name is required");
  if (name.length > 80) return fail("Name must be under 80 characters");
  const description = str(fd, "description");
  if (description && description.length > 300) return fail("Description must be under 300 characters");
  const url = str(fd, "url");
  if (!url) return fail("URL is required");
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
  } catch {
    return fail("URL must be a valid http(s) link");
  }
  const color = (str(fd, "color") ?? "#2563eb").toLowerCase();
  if (!HEX_RE.test(color)) return fail("Colour must be a hex value like #2563eb");
  const sort = num(fd, "sort_order") ?? 0;
  if (!Number.isInteger(sort) || sort < -9999 || sort > 9999) return fail("Sort order must be a whole number");
  const row = { name, description, url, color, sort_order: sort, active: bool(fd, "active") };
  const id = str(fd, "id");

  if (id) {
    if (!UUID_RE.test(id)) return fail("Invalid add-on");
    const { error, count } = await ctx.supabase.from("addons").update(row, { count: "exact" }).eq("id", id);
    if (error) return fail(dbError(error));
    if (!count) return fail("Add-on not found");
  } else {
    const { error } = await ctx.supabase.from("addons").insert(row);
    if (error) return fail(dbError(error));
  }
  refresh();
  return ok(id ? "Add-on updated" : "Add-on created");
}

export async function setAddonActive(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hr();
  if ("error" in ctx) return fail(ctx.error!);
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid add-on");
  const active = bool(fd, "active");
  const { error } = await ctx.supabase.from("addons").update({ active }).eq("id", id);
  if (error) return fail(dbError(error));
  refresh();
  return ok(active ? "Add-on activated" : "Add-on hidden");
}

export async function moveAddon(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hr();
  if ("error" in ctx) return fail(ctx.error!);
  const id = str(fd, "id");
  const dir = str(fd, "dir");
  if (!id || !UUID_RE.test(id) || (dir !== "up" && dir !== "down")) return fail("Invalid request");
  const { data: all, error: e1 } = await ctx.supabase.from("addons").select("id, sort_order, name").order("sort_order").order("name");
  if (e1) return fail(dbError(e1));
  const list = all ?? [];
  const i = list.findIndex((a) => a.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return ok();
  [list[i], list[j]] = [list[j], list[i]];
  // Renumber so ordering is stable even when sort orders were equal.
  const updates = list.map((a, idx) => ({ id: a.id, sort: (idx + 1) * 10 })).filter((u, idx) => u.sort !== list[idx].sort_order);
  for (const u of updates) {
    const { error } = await ctx.supabase.from("addons").update({ sort_order: u.sort }).eq("id", u.id);
    if (error) return fail(dbError(error));
  }
  refresh();
  return ok("Order updated");
}

export async function deleteAddon(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hr();
  if ("error" in ctx) return fail(ctx.error!);
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid add-on");
  const { error } = await ctx.supabase.from("addons").delete().eq("id", id);
  if (error) return fail(dbError(error));
  refresh();
  return ok("Add-on deleted");
}
