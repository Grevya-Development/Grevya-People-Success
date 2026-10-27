import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type PathCourse = {
  position: number;
  course: { id: string; title: string; category: string; duration_hours: number; level: string; published: boolean } | null;
};
export type MyEnrollment = { id: string; course_id: string; status: string; progress: number; due_date: string | null };

export const PATH_SELECT =
  "id, title, description, category, published, created_at, courses:learning_path_courses(position, course:courses!learning_path_courses_course_id_fkey(id, title, category, duration_hours, level, published))";

/** Courses of a path in order — unpublished ones only count if I'm already enrolled. */
export function pathCourses(courses: PathCourse[], mine: Map<string, MyEnrollment>) {
  return [...courses]
    .sort((a, b) => a.position - b.position)
    .map((c) => c.course)
    .filter((c): c is NonNullable<PathCourse["course"]> => !!c && (c.published || mine.has(c.id)));
}

export function pathProgress(courses: PathCourse[], mine: Map<string, MyEnrollment>) {
  const list = pathCourses(courses, mine);
  const completed = list.filter((c) => mine.get(c.id)?.status === "completed").length;
  const enrolled = list.filter((c) => mine.has(c.id)).length;
  const hours = list.reduce((s, c) => s + Number(c.duration_hours), 0);
  const pct = list.length ? Math.round((completed / list.length) * 100) : 0;
  const next = list.find((c) => mine.get(c.id)?.status !== "completed") ?? null;
  return { list, total: list.length, completed, enrolled, hours, pct, next };
}

/** My course enrollments keyed by course id. */
export async function myEnrollmentMap(supabase: Client, employeeId: string) {
  const { data } = await supabase.from("course_enrollments").select("id, course_id, status, progress, due_date").eq("employee_id", employeeId);
  return new Map((data ?? []).map((e) => [e.course_id, e as MyEnrollment]));
}
