"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str, num } from "@/lib/utils";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type UsageColumn = "department_id" | "designation_id" | "location_id";

async function hrContext() {
  const me = await getCurrentEmployee();
  if (!me?.isHR) return null;
  return createClient();
}

function idFrom(fd: FormData): string | null | false {
  const id = str(fd, "id");
  if (!id) return null;
  return UUID_RE.test(id) ? id : false;
}

async function usage(supabase: Awaited<ReturnType<typeof createClient>>, column: UsageColumn, id: string) {
  const { count, error } = await supabase.from("employees").select("id", { count: "exact", head: true }).eq(column, id);
  if (error) throw new Error(dbError(error));
  return count ?? 0;
}

/** Other records that point at a department/location (deleting would null them out or, for holidays, delete them). */
async function linkedRecords(supabase: Awaited<ReturnType<typeof createClient>>, column: "department_id" | "location_id", id: string) {
  const checks = [
    { label: "job opening", query: supabase.from("job_openings").select("id", { count: "exact", head: true }).eq(column, id) },
    ...(column === "location_id"
      ? [{ label: "holiday", query: supabase.from("holidays").select("id", { count: "exact", head: true }).eq("location_id", id) }]
      : []),
  ];
  const parts: string[] = [];
  for (const { label, query } of checks) {
    const { count, error } = await query;
    if (error) throw new Error(dbError(error));
    if (count) parts.push(`${count} ${label}${count === 1 ? "" : "s"}`);
  }
  return parts.length ? parts.join(" and ") : null;
}

function revalidateOrg() {
  revalidatePath("/admin/org");
  revalidatePath("/hris/employees");
  revalidatePath("/directory");
}

function uniqueError(error: { message: string; code?: string }, what: string) {
  return error.code === "23505" ? `A ${what} with this name already exists` : dbError(error);
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------
export async function saveDepartment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await hrContext();
  if (!supabase) return fail("Only HR can manage departments");
  const id = idFrom(fd);
  if (id === false) return fail("Invalid department");
  const name = str(fd, "name");
  const code = str(fd, "code")?.toUpperCase() ?? null;
  if (!name || name.length > 80) return fail("Department name is required (max 80 characters)");
  if (!code || !/^[A-Z0-9_-]{2,12}$/.test(code)) return fail("Code must be 2–12 letters, digits, '-' or '_'");

  const { error } = id
    ? await supabase.from("departments").update({ name, code }).eq("id", id)
    : await supabase.from("departments").insert({ name, code });
  if (error) return fail(error.code === "23505" ? "A department with this name or code already exists" : dbError(error));
  revalidateOrg();
  return ok(id ? "Department updated" : "Department added");
}

export async function deleteDepartment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await hrContext();
  if (!supabase) return fail("Only HR can manage departments");
  const id = idFrom(fd);
  if (!id) return fail("Invalid department");
  try {
    const n = await usage(supabase, "department_id", id);
    if (n > 0) return fail(`This department has ${n} employee${n === 1 ? "" : "s"}. Move them to another department first.`);
    const linked = await linkedRecords(supabase, "department_id", id);
    if (linked) return fail(`This department is used by ${linked}. Reassign or close them first.`);
  } catch (e) {
    return fail((e as Error).message);
  }
  const { error } = await supabase.from("departments").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidateOrg();
  return ok("Department deleted");
}

// ---------------------------------------------------------------------------
// Designations
// ---------------------------------------------------------------------------
export async function saveDesignation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await hrContext();
  if (!supabase) return fail("Only HR can manage designations");
  const id = idFrom(fd);
  if (id === false) return fail("Invalid designation");
  const title = str(fd, "title");
  const level = num(fd, "level");
  if (!title || title.length > 80) return fail("Designation title is required (max 80 characters)");
  if (level === null || !Number.isInteger(level) || level < 1 || level > 20) return fail("Level must be a whole number from 1 to 20");

  const { error } = id
    ? await supabase.from("designations").update({ title, level }).eq("id", id)
    : await supabase.from("designations").insert({ title, level });
  if (error) return fail(uniqueError(error, "designation"));
  revalidateOrg();
  return ok(id ? "Designation updated" : "Designation added");
}

export async function deleteDesignation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await hrContext();
  if (!supabase) return fail("Only HR can manage designations");
  const id = idFrom(fd);
  if (!id) return fail("Invalid designation");
  try {
    const n = await usage(supabase, "designation_id", id);
    if (n > 0) return fail(`${n} employee${n === 1 ? " holds" : "s hold"} this designation. Reassign them first.`);
  } catch (e) {
    return fail((e as Error).message);
  }
  const { error } = await supabase.from("designations").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidateOrg();
  return ok("Designation deleted");
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------
export async function saveLocation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await hrContext();
  if (!supabase) return fail("Only HR can manage locations");
  const id = idFrom(fd);
  if (id === false) return fail("Invalid location");
  const name = str(fd, "name");
  const city = str(fd, "city");
  const country = str(fd, "country") ?? "India";
  if (!name || name.length > 80) return fail("Location name is required (max 80 characters)");
  if (city && city.length > 80) return fail("City must be 80 characters or fewer");
  if (country.length > 60) return fail("Country must be 60 characters or fewer");

  const { error } = id
    ? await supabase.from("locations").update({ name, city, country }).eq("id", id)
    : await supabase.from("locations").insert({ name, city, country });
  if (error) return fail(uniqueError(error, "location"));
  revalidateOrg();
  return ok(id ? "Location updated" : "Location added");
}

export async function deleteLocation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await hrContext();
  if (!supabase) return fail("Only HR can manage locations");
  const id = idFrom(fd);
  if (!id) return fail("Invalid location");
  try {
    const n = await usage(supabase, "location_id", id);
    if (n > 0) return fail(`${n} employee${n === 1 ? " is" : "s are"} based here. Move them to another location first.`);
    const linked = await linkedRecords(supabase, "location_id", id);
    if (linked) return fail(`This location is used by ${linked}. Reassign or remove them first.`);
  } catch (e) {
    return fail((e as Error).message);
  }
  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidateOrg();
  return ok("Location deleted");
}
