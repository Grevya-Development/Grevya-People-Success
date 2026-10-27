"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { orgToday } from "@/lib/utils";

const BUCKET = "attendance-photos";
const MAX_BYTES = 5 * 1024 * 1024;

function coord(fd: FormData, key: string, min: number, max: number) {
  const v = fd.get(key);
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

async function readContext(fd: FormData) {
  const photo = fd.get("photo");
  if (!photo || typeof photo === "string" || photo.size === 0) return { error: "Please take a photo first" } as const;
  if (photo.size > MAX_BYTES) return { error: "Photo is too large (max 5 MB)" } as const;
  if (!["image/jpeg", "image/png", "image/webp"].includes(photo.type)) return { error: "Photo must be a JPEG, PNG or WebP image" } as const;
  const lat = coord(fd, "lat", -90, 90);
  const lng = coord(fd, "lng", -180, 180);
  const accuracy = coord(fd, "accuracy", 0, 100000);
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || null;
  const device = h.get("user-agent")?.slice(0, 300) ?? null;
  return { photo, lat: lat !== null && lng !== null ? lat : null, lng: lat !== null && lng !== null ? lng : null, accuracy, ip, device } as const;
}

async function upload(supabase: Awaited<ReturnType<typeof createClient>>, photo: File, kind: "in" | "out") {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/${orgToday()}/${Date.now()}-${kind}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, photo, { contentType: photo.type });
  if (error) throw new Error(error.message);
  return path;
}

function revalidate() {
  revalidatePath("/attendance/remote");
  revalidatePath("/attendance");
  revalidatePath("/home");
}

export async function remoteCheckIn(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (me.status === "exited") return fail("Your account is not active");
  const ctx = await readContext(fd);
  if ("error" in ctx) return fail(ctx.error!);
  const supabase = await createClient();

  const { data: open } = await supabase.from("remote_work_sessions").select("id").eq("employee_id", me.id).is("check_out_at", null).maybeSingle();
  if (open) return fail("You're already checked in. Check out first.");

  let path: string;
  try {
    path = await upload(supabase, ctx.photo, "in");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Photo upload failed");
  }
  const notes = typeof fd.get("notes") === "string" ? String(fd.get("notes")).trim().slice(0, 300) || null : null;
  const { error } = await supabase.from("remote_work_sessions").insert({
    employee_id: me.id,
    check_in_photo: path,
    check_in_lat: ctx.lat,
    check_in_lng: ctx.lng,
    check_in_accuracy: ctx.accuracy,
    check_in_ip: ctx.ip,
    check_in_device: ctx.device,
    notes,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return fail(error.code === "23505" ? "You're already checked in." : dbError(error));
  }
  revalidate();
  return ok("Checked in remotely");
}

export async function remoteCheckOut(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const ctx = await readContext(fd);
  if ("error" in ctx) return fail(ctx.error!);
  const supabase = await createClient();

  const { data: open } = await supabase.from("remote_work_sessions").select("id").eq("employee_id", me.id).is("check_out_at", null).maybeSingle();
  if (!open) return fail("You're not checked in.");

  let path: string;
  try {
    path = await upload(supabase, ctx.photo, "out");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Photo upload failed");
  }
  const { error } = await supabase
    .from("remote_work_sessions")
    .update({
      check_out_at: new Date().toISOString(), // replaced by the database clock
      check_out_photo: path,
      check_out_lat: ctx.lat,
      check_out_lng: ctx.lng,
      check_out_accuracy: ctx.accuracy,
      check_out_ip: ctx.ip,
      check_out_device: ctx.device,
    })
    .eq("id", open.id);
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return fail(dbError(error));
  }
  revalidate();
  return ok("Checked out — have a good evening!");
}
