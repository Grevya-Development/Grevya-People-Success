"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { bool, orgToday, str } from "@/lib/utils";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function revalidateLearning() {
  revalidatePath("/learning", "layout");
}

/** Employee: start a path — enrolls me in every published course of it I'm not already in. */
export async function startLearningPath(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const pathId = str(fd, "path_id");
  if (!pathId || !UUID_RE.test(pathId)) return fail("Invalid learning path");
  const supabase = await createClient();

  const { data: path } = await supabase.from("learning_paths").select("id, title, published").eq("id", pathId).maybeSingle();
  if (!path || !path.published) return fail("This learning path is not available");

  const { data: pcs, error: pcErr } = await supabase
    .from("learning_path_courses")
    .select("course_id, course:courses!learning_path_courses_course_id_fkey(id, published)")
    .eq("path_id", pathId);
  if (pcErr) return fail(dbError(pcErr));
  const courseIds = (pcs ?? []).filter((p) => p.course?.published).map((p) => p.course_id);
  if (courseIds.length === 0) return fail("This learning path has no courses yet");

  const { data: existingPath } = await supabase.from("learning_path_enrollments").select("id").eq("path_id", pathId).eq("employee_id", me.id).maybeSingle();
  if (!existingPath) {
    const { error } = await supabase.from("learning_path_enrollments").insert({ path_id: pathId, employee_id: me.id });
    if (error && error.code !== "23505") return fail(dbError(error));
  }

  const { data: existing } = await supabase.from("course_enrollments").select("course_id").eq("employee_id", me.id).in("course_id", courseIds);
  const skip = new Set((existing ?? []).map((e) => e.course_id));
  const rows = courseIds.filter((id) => !skip.has(id)).map((course_id) => ({ course_id, employee_id: me.id }));
  if (rows.length) {
    const { error } = await supabase.from("course_enrollments").upsert(rows, { onConflict: "course_id,employee_id", ignoreDuplicates: true });
    if (error) return fail(dbError(error));
  }
  revalidateLearning();
  if (rows.length === 0) return ok(`Started "${path.title}" — you were already enrolled in all its courses`);
  return ok(`Started "${path.title}" · enrolled in ${rows.length} course${rows.length === 1 ? "" : "s"}${skip.size ? ` (${skip.size} already enrolled)` : ""}`);
}

/** Employee: stop tracking a path I started myself (course enrollments are kept). */
export async function leaveLearningPath(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const pathId = str(fd, "path_id");
  if (!pathId || !UUID_RE.test(pathId)) return fail("Invalid learning path");
  const supabase = await createClient();
  const { data: enr } = await supabase.from("learning_path_enrollments").select("id, assigned_by").eq("path_id", pathId).eq("employee_id", me.id).maybeSingle();
  if (!enr) return fail("You haven't started this path");
  if (enr.assigned_by && enr.assigned_by !== me.id) return fail("Assigned learning paths can only be removed by HR");
  const { error, count } = await supabase.from("learning_path_enrollments").delete({ count: "exact" }).eq("id", enr.id);
  if (error) return fail(dbError(error));
  if (!count) return fail("You don't have permission to do that.");
  revalidateLearning();
  return ok("Removed from My Learning Paths — your course progress is kept", "/learning/paths");
}

/* ------------------------------------------------------------------ */
/* HR                                                                  */
/* ------------------------------------------------------------------ */

async function hr() {
  const me = await getCurrentEmployee();
  if (!me) return { error: "Not signed in" as const };
  if (!me.isHR) return { error: "Only HR can manage learning paths" as const };
  return { me, supabase: await createClient() };
}

export async function saveLearningPath(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hr();
  if ("error" in ctx) return fail(ctx.error!);
  const { me, supabase } = ctx;
  const title = str(fd, "title");
  if (!title) return fail("Title is required");
  if (title.length > 200) return fail("Title is too long");
  const category = str(fd, "category") ?? "General";
  if (category.length > 60) return fail("Category is too long");
  const description = str(fd, "description");
  if (description && description.length > 4000) return fail("Description is too long");

  let courseIds: string[] = [];
  try {
    const parsed: unknown = JSON.parse(str(fd, "course_ids") ?? "[]");
    if (!Array.isArray(parsed)) throw new Error();
    courseIds = [...new Set(parsed.filter((v): v is string => typeof v === "string" && UUID_RE.test(v)))];
  } catch {
    return fail("Courses could not be read");
  }
  if (courseIds.length === 0) return fail("Add at least one course to the path");
  if (courseIds.length > 50) return fail("A path can have at most 50 courses");
  const { data: found } = await supabase.from("courses").select("id").in("id", courseIds);
  if ((found ?? []).length !== courseIds.length) return fail("One of the selected courses no longer exists");

  const values = { title, category, description, published: bool(fd, "published") };
  let pathId = str(fd, "id");
  if (pathId) {
    if (!UUID_RE.test(pathId)) return fail("Invalid learning path");
    const { error, count } = await supabase.from("learning_paths").update(values, { count: "exact" }).eq("id", pathId);
    if (error) return fail(dbError(error));
    if (!count) return fail("Learning path not found");
    const { error: delErr } = await supabase.from("learning_path_courses").delete().eq("path_id", pathId);
    if (delErr) return fail(dbError(delErr));
  } else {
    const { data, error } = await supabase.from("learning_paths").insert({ ...values, created_by: me.id }).select("id").single();
    if (error) return fail(dbError(error));
    pathId = data.id;
  }
  const { error: pcErr } = await supabase
    .from("learning_path_courses")
    .insert(courseIds.map((course_id, position) => ({ path_id: pathId!, course_id, position })));
  if (pcErr) return fail(dbError(pcErr));
  revalidateLearning();
  return str(fd, "id") ? ok("Learning path updated", "/learning/admin?tab=paths") : ok("Learning path created");
}

export async function setLearningPathPublished(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hr();
  if ("error" in ctx) return fail(ctx.error!);
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid learning path");
  const published = bool(fd, "published");
  const { error } = await ctx.supabase.from("learning_paths").update({ published }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidateLearning();
  return ok(published ? "Learning path published" : "Learning path unpublished");
}

export async function deleteLearningPath(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hr();
  if ("error" in ctx) return fail(ctx.error!);
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid learning path");
  const { error } = await ctx.supabase.from("learning_paths").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidateLearning();
  return ok("Learning path deleted");
}

/** HR: assign a path (and its courses) to a department or everyone, with an optional due date. */
export async function assignLearningPath(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hr();
  if ("error" in ctx) return fail(ctx.error!);
  const pathId = str(fd, "path_id");
  if (!pathId || !UUID_RE.test(pathId)) return fail("Invalid learning path");
  const target = str(fd, "target");
  if (!target || (target !== "all" && !UUID_RE.test(target))) return fail("Choose a department or everyone");
  const due = str(fd, "due_date");
  if (due && !DATE_RE.test(due)) return fail("Invalid due date");
  if (due && due < orgToday()) return fail("Due date can't be in the past");

  const { data, error } = await ctx.supabase.rpc("assign_learning_path", {
    p_path: pathId,
    // null = everyone (generated types mark the argument as non-null)
    p_department: (target === "all" ? null : target) as string,
    p_due: due as string,
  });
  if (error) return fail(dbError(error));
  const r = data?.[0] ?? { assigned: 0, skipped: 0 };
  revalidateLearning();
  if (r.assigned === 0) return ok(r.skipped ? "Everyone selected already has this path" : "No active employees match that selection");
  return ok(`Path assigned to ${r.assigned} employee${r.assigned === 1 ? "" : "s"}${r.skipped ? ` · ${r.skipped} already had it` : ""}`);
}
