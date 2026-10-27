import Link from "next/link";
import { Award, BookOpen, CalendarClock, CheckCircle2, Clock, GraduationCap, PlayCircle, Sparkles } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, EmptyState, PageHeader, StatCard, WidgetCard, buttonClass } from "@/components/ui";
import { cn, formatDate, orgToday } from "@/lib/utils";
import { CourseCard } from "./_components/course-card";
import { CourseProgress } from "./_components/progress";
import { categoryStyle, daysUntil, dueLabel, formatHours, learningTheme } from "./_lib/course";

export const metadata = { title: "Learning Home" };

export default async function LearningHomePage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const today = orgToday();

  const [{ data: enrollmentData }, { data: courseData }] = await Promise.all([
    supabase
      .from("course_enrollments")
      .select("id, status, progress, due_date, enrolled_at, completed_at, assigned_by, course:courses!course_enrollments_course_id_fkey(id, title, category, duration_hours, is_mandatory)")
      .eq("employee_id", me.id)
      .order("enrolled_at", { ascending: false }),
    supabase
      .from("courses")
      .select("id, title, description, category, provider, level, duration_hours, modules, is_mandatory, published, created_at")
      .eq("published", true)
      .order("created_at", { ascending: false }),
  ]);

  const enrollments = (enrollmentData ?? []).filter((e) => e.course);
  const courses = courseData ?? [];

  const completed = enrollments.filter((e) => e.status === "completed");
  const inProgress = enrollments.filter((e) => e.status === "in_progress");
  const hoursLearned = enrollments.reduce((s, e) => s + (Number(e.course!.duration_hours) * e.progress) / 100, 0);

  const dueSoon = enrollments
    .filter((e) => e.status !== "completed" && (e.due_date || e.course!.is_mandatory || e.assigned_by))
    .map((e) => ({ ...e, days: daysUntil(e.due_date, today) }))
    .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999))
    .slice(0, 6);

  const enrolledIds = new Set(enrollments.map((e) => e.course!.id));
  const myCategories = new Set(enrollments.map((e) => e.course!.category));
  const notEnrolled = courses.filter((c) => !enrolledIds.has(c.id));
  let recommended = notEnrolled.filter((c) => c.is_mandatory || myCategories.has(c.category));
  recommended.sort((a, b) => Number(b.is_mandatory) - Number(a.is_mandatory));
  if (recommended.length < 3) recommended = [...recommended, ...notEnrolled.filter((c) => !recommended.includes(c))];
  recommended = recommended.slice(0, 6);

  return (
    <div>
      <PageHeader
        title="Learning Home"
        description={`Keep growing, ${me.first_name}. Pick up where you left off or explore something new.`}
        breadcrumbs={[{ label: "Learning" }, { label: "Home" }]}
        actions={
          <>
            <Link href="/learning/my-courses" className={buttonClass("outline")}>
              My Courses
            </Link>
            <Link href="/learning/catalog" className={buttonClass("primary")}>
              <BookOpen className="h-4 w-4" /> Browse catalog
            </Link>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Enrolled" value={enrollments.length} icon={GraduationCap} tone={cn(learningTheme.pill, learningTheme.text)} hint={`${inProgress.length} in progress`} />
        <StatCard label="Completed" value={completed.length} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" hint={enrollments.length ? `${Math.round((completed.length / enrollments.length) * 100)}% completion` : "—"} />
        <StatCard label="Hours learned" value={formatHours(hoursLearned)} icon={Clock} tone="bg-amber-50 text-amber-600" hint="Based on your progress" />
        <StatCard label="Certificates" value={completed.length} icon={Award} tone="bg-violet-50 text-violet-600" hint={<Link href="/learning/certificates" className="text-primary-600 hover:underline">View all</Link>} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <WidgetCard
          title="Continue Learning"
          color={learningTheme.solid}
          className="lg:col-span-2"
          bodyClassName="p-0"
          action={
            <Link href="/learning/my-courses?tab=in_progress" className="text-xs font-medium text-white/90 hover:text-white">
              View all
            </Link>
          }
        >
          {inProgress.length === 0 ? (
            <EmptyState
              icon={PlayCircle}
              title="Nothing in progress"
              description="Start one of your enrolled courses or find a new one in the catalog."
              action={
                <Link href="/learning/catalog" className={buttonClass("secondary", "sm")}>
                  Explore courses
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {inProgress.slice(0, 5).map((e) => {
                const style = categoryStyle(e.course!.category);
                return (
                  <li key={e.id} className="flex items-center gap-4 px-4 py-3">
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white", style.band)}>
                      <BookOpen className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/learning/courses/${e.course!.id}`} className="block truncate text-sm font-medium text-slate-800 hover:text-primary-600">
                        {e.course!.title}
                      </Link>
                      <div className="mt-1.5 flex items-center gap-3">
                        <CourseProgress value={e.progress} size="sm" className="max-w-xs" />
                        <span className="text-xs font-medium text-slate-500">{e.progress}%</span>
                      </div>
                    </div>
                    <Link href={`/learning/courses/${e.course!.id}`} className={buttonClass("outline", "sm", "hidden sm:inline-flex")}>
                      Resume
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </WidgetCard>

        <WidgetCard
          title="Due Soon"
          color="bg-[#25708a]"
          bodyClassName="p-0"
          action={
            <Link href="/learning/plan" className="text-xs font-medium text-white/90 hover:text-white">
              Learning plan
            </Link>
          }
        >
          {dueSoon.length === 0 ? (
            <EmptyState icon={CalendarClock} title="You're all caught up" description="No mandatory or assigned courses are pending." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {dueSoon.map((e) => {
                const overdue = e.days !== null && e.days < 0;
                return (
                  <li key={e.id} className={cn("px-4 py-3", overdue && "bg-red-50/60")}>
                    <Link href={`/learning/courses/${e.course!.id}`} className="block truncate text-sm font-medium text-slate-800 hover:text-primary-600">
                      {e.course!.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      {e.course!.is_mandatory && <Badge tone="red">Mandatory</Badge>}
                      {e.due_date ? (
                        <span className={cn(overdue ? "font-medium text-red-600" : e.days! <= 7 ? "text-amber-700" : "text-slate-500")}>
                          {dueLabel(e.days)} · {formatDate(e.due_date)}
                        </span>
                      ) : (
                        <span className="text-slate-500">No due date</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </WidgetCard>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <Sparkles className={cn("h-4 w-4", learningTheme.text)} /> Recommended for you
          </h2>
          <Link href="/learning/catalog" className="text-sm font-medium text-primary-600 hover:underline">
            See full catalog
          </Link>
        </div>
        {recommended.length === 0 ? (
          <div className="rounded-xl border border-slate-200/80 bg-white">
            <EmptyState icon={Sparkles} title="No recommendations right now" description="You're enrolled in every available course. Nice work!" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recommended.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
