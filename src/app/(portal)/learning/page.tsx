import Link from "next/link";
import { Award, BookMarked, BookOpen, CalendarClock, CalendarDays, CheckCircle2, Clock, Eye, GraduationCap, PlayCircle, Route, Sparkles, ThumbsUp } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, EmptyState, PageHeader, StatCard, WidgetCard, buttonClass } from "@/components/ui";
import { cn, formatDate, orgToday } from "@/lib/utils";
import { CourseCard } from "./_components/course-card";
import { CourseProgress } from "./_components/progress";
import { categoryStyle, daysUntil, dueLabel, formatHours, learningTheme } from "./_lib/course";
import { PATH_SELECT, pathProgress, type MyEnrollment, type PathCourse } from "./_lib/paths";
import { istDayMonth, istTimeRange } from "./_lib/time";
import { readMinutes } from "./_lib/wiki";

export const metadata = { title: "Learner Home" };

export default async function LearningHomePage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const today = orgToday();

  const nowIso = new Date().toISOString();
  const [{ data: enrollmentData }, { data: courseData }, { data: myPathData }, { data: regData }, { data: wikiData }] = await Promise.all([
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
    supabase.from("learning_path_enrollments").select(`due_date, path:learning_paths!learning_path_enrollments_path_id_fkey(${PATH_SELECT})`).eq("employee_id", me.id),
    supabase
      .from("training_registrations")
      .select("id, session:training_sessions!training_registrations_session_id_fkey(id, title, starts_at, ends_at, mode, status)")
      .eq("employee_id", me.id),
    supabase
      .from("wiki_articles")
      .select("id, title, category, content, view_count, like_count, published_at, author:employees!wiki_articles_author_id_fkey(full_name)")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(4),
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

  const mine = new Map<string, MyEnrollment>(
    enrollments.map((e) => [e.course!.id, { id: e.id, course_id: e.course!.id, status: e.status, progress: e.progress, due_date: e.due_date }]),
  );
  const activePaths = (myPathData ?? [])
    .filter((p) => p.path)
    .map((p) => {
      const path = p.path as unknown as { id: string; title: string; category: string; courses: PathCourse[] };
      return { ...path, due_date: p.due_date, prog: pathProgress(path.courses, mine) };
    })
    .filter((p) => p.prog.total > 0 && p.prog.pct < 100)
    .slice(0, 4);
  const upcomingSessions = (regData ?? [])
    .map((r) => r.session)
    .filter((s): s is NonNullable<typeof s> => !!s && s.status === "scheduled" && s.ends_at >= nowIso)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 4);
  const latestArticles = wikiData ?? [];

  return (
    <div>
      <PageHeader
        title="Learner Home"
        description={`Keep growing, ${me.first_name}. Pick up where you left off or explore something new.`}
        breadcrumbs={[{ label: "Learning" }, { label: "Learner Home" }]}
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

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <WidgetCard
          title="My Learning Paths"
          color={learningTheme.solid}
          bodyClassName="p-0"
          action={
            <Link href="/learning/paths" className="text-xs font-medium text-white/90 hover:text-white">
              View all
            </Link>
          }
        >
          {activePaths.length === 0 ? (
            <EmptyState
              icon={Route}
              title="No active learning paths"
              description="Follow a curated sequence of courses to build a skill."
              action={
                <Link href="/learning/paths" className={buttonClass("secondary", "sm")}>
                  Explore paths
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {activePaths.map((p) => (
                <li key={p.id} className="px-4 py-3">
                  <Link href={`/learning/paths/${p.id}`} className="block truncate text-sm font-medium text-slate-800 hover:text-primary-600">
                    {p.title}
                  </Link>
                  <div className="mt-1.5 flex items-center gap-3">
                    <CourseProgress value={p.prog.pct} size="sm" />
                    <span className="shrink-0 text-xs text-slate-500">
                      {p.prog.completed}/{p.prog.total}
                    </span>
                  </div>
                  {p.prog.next && <p className="mt-1 truncate text-[11px] text-slate-400">Next: {p.prog.next.title}</p>}
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>

        <WidgetCard
          title="Upcoming Sessions"
          color="bg-[#25708a]"
          bodyClassName="p-0"
          action={
            <Link href="/learning/calendar" className="text-xs font-medium text-white/90 hover:text-white">
              Calendar
            </Link>
          }
        >
          {upcomingSessions.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No sessions booked"
              description="Register for an instructor-led session or webinar."
              action={
                <Link href="/learning/calendar" className={buttonClass("secondary", "sm")}>
                  Training calendar
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcomingSessions.map((s) => {
                const dm = istDayMonth(s.starts_at);
                return (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-[#d5e9f0] py-1 text-[#25708a]">
                      <span className="text-[10px] font-semibold uppercase">{dm.month}</span>
                      <span className="text-base font-bold leading-none">{dm.day}</span>
                    </div>
                    <div className="min-w-0">
                      <Link href={`/learning/calendar/${s.id}`} className="block truncate text-sm font-medium text-slate-800 hover:text-primary-600">
                        {s.title}
                      </Link>
                      <p className="truncate text-[11px] text-slate-500">
                        {istTimeRange(s.starts_at, s.ends_at)} · {s.mode === "virtual" ? "Virtual" : "In person"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </WidgetCard>

        <WidgetCard
          title="From the Knowledge Wiki"
          color="bg-[#2f7f9c]"
          bodyClassName="p-0"
          action={
            <Link href="/learning/wiki" className="text-xs font-medium text-white/90 hover:text-white">
              Read more
            </Link>
          }
        >
          {latestArticles.length === 0 ? (
            <EmptyState
              icon={BookMarked}
              title="No articles yet"
              description="Share what you know with your colleagues."
              action={
                <Link href="/learning/wiki/new" className={buttonClass("secondary", "sm")}>
                  Write an article
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {latestArticles.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <Link href={`/learning/wiki/${a.id}`} className="block truncate text-sm font-medium text-slate-800 hover:text-primary-600">
                    {a.title}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                    <span>{a.author?.full_name}</span>·<span>{readMinutes(a.content)} min read</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Eye className="h-3 w-3" /> {a.view_count}
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <ThumbsUp className="h-3 w-3" /> {a.like_count}
                    </span>
                  </p>
                </li>
              ))}
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
