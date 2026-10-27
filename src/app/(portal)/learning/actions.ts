"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str, num, bool, orgToday } from "@/lib/utils";
import type { TablesInsert } from "@/lib/database.types";
import { LEVELS, completedModules, parseModules, type CourseModule } from "./_lib/course";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateLearning() {
  revalidatePath("/learning", "layout");
}

function validDue(v: string | null): string | null | false {
  if (!v) return null;
  if (!DATE_RE.test(v)) return false;
  return v;
}

/* ------------------------------------------------------------------ */
/* Employee: enroll / progress                                         */
/* ------------------------------------------------------------------ */

export async function enrollInCourse(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const courseId = str(fd, "course_id");
  if (!courseId || !UUID_RE.test(courseId)) return fail("Invalid course");
  const supabase = await createClient();

  const { data: course } = await supabase.from("courses").select("id, title, published").eq("id", courseId).maybeSingle();
  if (!course || !course.published) return fail("This course is not available");

  const { data: existing } = await supabase
    .from("course_enrollments")
    .select("id")
    .eq("course_id", courseId)
    .eq("employee_id", me.id)
    .maybeSingle();
  if (existing) return fail("You are already enrolled in this course");

  const { error } = await supabase.from("course_enrollments").insert({ course_id: courseId, employee_id: me.id });
  if (error) return fail(dbError(error));
  revalidateLearning();
  return ok(`Enrolled in ${course.title}`);
}

/** Loads one of MY enrollments together with its course modules. */
async function myEnrollment(enrollmentId: string | null) {
  const me = await getCurrentEmployee();
  if (!me) return { error: "Not signed in" as const };
  if (!enrollmentId || !UUID_RE.test(enrollmentId)) return { error: "Invalid enrollment" as const };
  const supabase = await createClient();
  const { data } = await supabase
    .from("course_enrollments")
    .select("id, employee_id, assigned_by, status, progress, course:courses!course_enrollments_course_id_fkey(id, title, modules)")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!data || data.employee_id !== me.id) return { error: "Enrollment not found" as const };
  return { me, supabase, enrollment: data };
}

export async function completeNextModule(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await myEnrollment(str(fd, "enrollment_id"));
  if ("error" in r) return fail(r.error!);
  const { supabase, enrollment } = r;
  if (enrollment.status === "completed") return fail("This course is already completed");
  const modules = parseModules(enrollment.course?.modules);
  if (modules.length === 0) return fail("This course has no modules — mark the course complete instead");

  const done = Math.min(modules.length, completedModules(enrollment.progress, modules.length) + 1);
  const finished = done >= modules.length;
  const { error } = await supabase
    .from("course_enrollments")
    .update(
      finished
        ? { progress: 100, status: "completed", completed_at: new Date().toISOString() }
        : { progress: Math.round((done / modules.length) * 100), status: "in_progress" },
    )
    .eq("id", enrollment.id);
  if (error) return fail(dbError(error));
  revalidateLearning();
  return ok(finished ? "Course completed — your certificate is ready" : `Module ${done} of ${modules.length} completed`);
}

export async function completeCourse(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await myEnrollment(str(fd, "enrollment_id"));
  if ("error" in r) return fail(r.error!);
  const { supabase, enrollment } = r;
  if (enrollment.status === "completed") return fail("This course is already completed");
  const { error } = await supabase
    .from("course_enrollments")
    .update({ progress: 100, status: "completed", completed_at: new Date().toISOString() })
    .eq("id", enrollment.id);
  if (error) return fail(dbError(error));
  revalidateLearning();
  return ok("Course completed — your certificate is ready");
}

export async function startCourse(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await myEnrollment(str(fd, "enrollment_id"));
  if ("error" in r) return fail(r.error!);
  const { supabase, enrollment } = r;
  if (enrollment.status !== "enrolled") return ok();
  const { error } = await supabase.from("course_enrollments").update({ status: "in_progress" }).eq("id", enrollment.id);
  if (error) return fail(dbError(error));
  revalidateLearning();
  return ok("Course started");
}

export async function unenroll(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await myEnrollment(str(fd, "enrollment_id"));
  if ("error" in r) return fail(r.error!);
  const { me, supabase, enrollment } = r;
  if (enrollment.status === "completed") return fail("Completed courses can't be dropped");
  if (enrollment.assigned_by && enrollment.assigned_by !== me.id) return fail("Assigned courses can only be removed by whoever assigned them");
  const { error, count } = await supabase.from("course_enrollments").delete({ count: "exact" }).eq("id", enrollment.id);
  if (error) return fail(dbError(error));
  if (!count) return fail("You don't have permission to do that.");
  revalidateLearning();
  return ok("You have been un-enrolled", "/learning/my-courses");
}

/* ------------------------------------------------------------------ */
/* Manager: assign to reports                                          */
/* ------------------------------------------------------------------ */

export async function assignToReports(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isManager) return fail("Only managers can assign courses");
  const courseId = str(fd, "course_id");
  if (!courseId || !UUID_RE.test(courseId)) return fail("Choose a course");
  const due = validDue(str(fd, "due_date"));
  if (due === false) return fail("Invalid due date");
  if (due && due < orgToday()) return fail("Due date can't be in the past");
  const ids = [...new Set(fd.getAll("employee_ids").filter((v): v is string => typeof v === "string" && UUID_RE.test(v)))];
  if (ids.length === 0) return fail("Select at least one team member");
  if (ids.includes(me.id)) return fail("You can't assign a course to yourself");

  const supabase = await createClient();
  const { data: course } = await supabase.from("courses").select("id, title, published").eq("id", courseId).maybeSingle();
  if (!course || !course.published) return fail("This course is not available");

  // Every target must be in my reporting chain (or I'm HR).
  if (!me.isHR) {
    const checks = await Promise.all(ids.map((id) => supabase.rpc("is_manager_of", { emp: id })));
    if (checks.some((c) => c.error || !c.data)) return fail("You can only assign courses to your reporting team");
  }

  const { data: existing } = await supabase.from("course_enrollments").select("employee_id").eq("course_id", courseId).in("employee_id", ids);
  const skip = new Set((existing ?? []).map((e) => e.employee_id));
  const rows: TablesInsert<"course_enrollments">[] = ids
    .filter((id) => !skip.has(id))
    .map((id) => ({ course_id: courseId, employee_id: id, assigned_by: me.id, due_date: due }));

  if (rows.length > 0) {
    const { error } = await supabase.from("course_enrollments").insert(rows);
    if (error) return fail(dbError(error));
  }
  revalidateLearning();
  if (rows.length === 0) return ok("Everyone selected is already enrolled");
  return ok(`Assigned "${course.title}" to ${rows.length} ${rows.length === 1 ? "person" : "people"}${skip.size ? ` (${skip.size} already enrolled)` : ""}`);
}

/** Manager/HR updates the due date of an enrollment they can approve for. */
export async function updateDueDate(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isManager) return fail("Only managers can change due dates");
  const id = str(fd, "enrollment_id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid enrollment");
  const due = validDue(str(fd, "due_date"));
  if (due === false) return fail("Invalid due date");
  const supabase = await createClient();
  const { data: enr } = await supabase.from("course_enrollments").select("id, employee_id").eq("id", id).maybeSingle();
  if (!enr || enr.employee_id === me.id) return fail("Enrollment not found");
  if (!me.isHR) {
    const { data: allowed } = await supabase.rpc("is_manager_of", { emp: enr.employee_id });
    if (!allowed) return fail("You don't have permission to do that.");
  }
  const { error } = await supabase.from("course_enrollments").update({ due_date: due }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidateLearning();
  return ok("Due date updated");
}

/** Manager/HR removes an enrollment from a report. */
export async function removeEnrollment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isManager) return fail("Only managers can remove assignments");
  const id = str(fd, "enrollment_id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid enrollment");
  const supabase = await createClient();
  const { data: enr } = await supabase.from("course_enrollments").select("id, employee_id, status").eq("id", id).maybeSingle();
  if (!enr || enr.employee_id === me.id) return fail("Enrollment not found");
  if (enr.status === "completed") return fail("Completed courses can't be removed");
  if (!me.isHR) {
    const { data: allowed } = await supabase.rpc("is_manager_of", { emp: enr.employee_id });
    if (!allowed) return fail("You don't have permission to do that.");
  }
  const { error, count } = await supabase.from("course_enrollments").delete({ count: "exact" }).eq("id", id);
  if (error) return fail(dbError(error));
  if (!count) return fail("You don't have permission to do that.");
  revalidateLearning();
  return ok("Assignment removed");
}

/* ------------------------------------------------------------------ */
/* HR: courses CRUD + bulk assign                                      */
/* ------------------------------------------------------------------ */

async function hrContext() {
  const me = await getCurrentEmployee();
  if (!me) return { error: "Not signed in" };
  if (!me.isHR) return { error: "Only HR can manage courses" };
  return { me, supabase: await createClient() };
}

function readCourse(fd: FormData): { data: TablesInsert<"courses"> } | { error: string } {
  const title = str(fd, "title");
  if (!title) return { error: "Title is required" };
  if (title.length > 200) return { error: "Title is too long" };
  const category = str(fd, "category") ?? "Technical";
  if (category.length > 60) return { error: "Category is too long" };
  const provider = str(fd, "provider") ?? "Internal";
  const level = str(fd, "level") ?? "beginner";
  if (!(LEVELS as readonly string[]).includes(level)) return { error: "Choose a valid level" };
  const content = str(fd, "content_url");
  if (content) {
    try {
      const u = new URL(content);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    } catch {
      return { error: "Content URL must start with http:// or https://" };
    }
  }

  let modules: CourseModule[] = [];
  const rawModules = str(fd, "modules");
  if (rawModules) {
    try {
      const parsed: unknown = JSON.parse(rawModules);
      if (!Array.isArray(parsed)) throw new Error();
      for (const [i, m] of parsed.entries()) {
        const t = typeof m?.title === "string" ? m.title.trim() : "";
        const mins = Number(m?.duration_minutes);
        if (!t) return { error: `Module ${i + 1} needs a title` };
        if (!Number.isFinite(mins) || mins < 0 || mins > 10_000) return { error: `Module ${i + 1} has an invalid duration` };
        modules.push({ title: t.slice(0, 200), duration_minutes: Math.round(mins) });
      }
    } catch {
      return { error: "Modules could not be read" };
    }
  }
  if (modules.length > 100) modules = modules.slice(0, 100);

  let hours = num(fd, "duration_hours");
  const moduleMinutes = modules.reduce((s, m) => s + m.duration_minutes, 0);
  if (hours === null || hours <= 0) hours = moduleMinutes > 0 ? Math.round((moduleMinutes / 60) * 10) / 10 : null;
  if (hours === null || hours <= 0) return { error: "Duration (hours) is required" };
  if (hours > 9999) return { error: "Duration is too long" };

  return {
    data: {
      title,
      description: str(fd, "description"),
      category,
      provider,
      level,
      duration_hours: Math.max(0.1, Math.round(hours * 10) / 10),
      content_url: content,
      modules,
      is_mandatory: bool(fd, "is_mandatory"),
      published: bool(fd, "published"),
    },
  };
}

export async function saveCourse(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return fail(ctx.error!);
  const parsed = readCourse(fd);
  if ("error" in parsed) return fail(parsed.error);
  const id = str(fd, "id");
  if (id) {
    if (!UUID_RE.test(id)) return fail("Invalid course");
    const { error, count } = await ctx.supabase.from("courses").update(parsed.data, { count: "exact" }).eq("id", id);
    if (error) return fail(dbError(error));
    if (!count) return fail("Course not found");
  } else {
    const { error } = await ctx.supabase.from("courses").insert(parsed.data);
    if (error) return fail(dbError(error));
  }
  revalidateLearning();
  return id ? ok("Course updated", "/learning/admin") : ok("Course created");
}

export async function setCoursePublished(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return fail(ctx.error!);
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid course");
  const published = bool(fd, "published");
  const { error } = await ctx.supabase.from("courses").update({ published }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidateLearning();
  return ok(published ? "Course published" : "Course unpublished");
}

export async function deleteCourse(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return fail(ctx.error!);
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid course");
  const { error } = await ctx.supabase.from("courses").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidateLearning();
  return ok("Course deleted");
}

export async function bulkAssign(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return fail(ctx.error!);
  const { me, supabase } = ctx;
  const courseId = str(fd, "course_id");
  if (!courseId || !UUID_RE.test(courseId)) return fail("Invalid course");
  const target = str(fd, "target");
  if (!target || (target !== "all" && !UUID_RE.test(target))) return fail("Choose a department or everyone");
  const due = validDue(str(fd, "due_date"));
  if (due === false) return fail("Invalid due date");
  if (due && due < orgToday()) return fail("Due date can't be in the past");

  const { data: course } = await supabase.from("courses").select("id, title, published").eq("id", courseId).maybeSingle();
  if (!course) return fail("Course not found");
  if (!course.published) return fail("Publish the course before assigning it");

  let q = supabase.from("employees").select("id").neq("status", "exited");
  if (target !== "all") q = q.eq("department_id", target);
  const { data: emps, error: empErr } = await q;
  if (empErr) return fail(dbError(empErr));
  const ids = (emps ?? []).map((e) => e.id);
  if (ids.length === 0) return fail("No active employees match that selection");

  const { data: existing, error: exErr } = await supabase.from("course_enrollments").select("employee_id").eq("course_id", courseId);
  if (exErr) return fail(dbError(exErr));
  const skip = new Set((existing ?? []).map((e) => e.employee_id));
  const rows: TablesInsert<"course_enrollments">[] = ids
    .filter((id) => !skip.has(id))
    .map((id) => ({ course_id: courseId, employee_id: id, assigned_by: me.id, due_date: due }));

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("course_enrollments").upsert(rows.slice(i, i + 500), { onConflict: "course_id,employee_id", ignoreDuplicates: true });
    if (error) return fail(dbError(error));
  }
  revalidateLearning();
  const skipped = ids.length - rows.length;
  if (rows.length === 0) return ok("Everyone selected is already enrolled");
  return ok(`Assigned to ${rows.length} employee${rows.length === 1 ? "" : "s"}${skipped ? ` · ${skipped} already enrolled` : ""}`);
}
