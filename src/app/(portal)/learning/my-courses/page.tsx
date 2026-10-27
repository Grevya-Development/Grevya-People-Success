import Link from "next/link";
import { Award, BookOpen, CalendarClock, GraduationCap } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { LinkTabs } from "@/components/ui/link-tabs";
import { cn, formatDate, orgToday } from "@/lib/utils";
import { CourseProgress } from "../_components/progress";
import { categoryStyle, daysUntil, dueLabel, formatHours } from "../_lib/course";

export const metadata = { title: "My Courses" };

const TABS = {
  in_progress: { label: "In progress", status: "in_progress" },
  not_started: { label: "Not started", status: "enrolled" },
  completed: { label: "Completed", status: "completed" },
} as const;
type TabKey = keyof typeof TABS;

export default async function MyCoursesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireEmployee();
  const { tab: rawTab } = await searchParams;
  const tab: TabKey = rawTab && rawTab in TABS ? (rawTab as TabKey) : "in_progress";
  const supabase = await createClient();
  const today = orgToday();

  const { data } = await supabase
    .from("course_enrollments")
    .select(
      "id, status, progress, due_date, enrolled_at, completed_at, assigned_by, course:courses!course_enrollments_course_id_fkey(id, title, category, provider, duration_hours, is_mandatory), assigner:employees!course_enrollments_assigned_by_fkey(full_name)",
    )
    .eq("employee_id", me.id)
    .order("enrolled_at", { ascending: false });

  const all = (data ?? []).filter((e) => e.course);
  const byTab = (k: TabKey) => all.filter((e) => e.status === TABS[k].status);
  const rows = byTab(tab);

  return (
    <div>
      <PageHeader
        title="My Courses"
        breadcrumbs={[{ label: "Learning", href: "/learning" }, { label: "My Courses" }]}
        actions={
          <Link href="/learning/catalog" className={buttonClass("primary")}>
            <BookOpen className="h-4 w-4" /> Find courses
          </Link>
        }
      />

      <LinkTabs
        tabs={(Object.keys(TABS) as TabKey[]).map((k) => ({
          label: TABS[k].label,
          href: k === "in_progress" ? "/learning/my-courses" : `/learning/my-courses?tab=${k}`,
          count: byTab(k).length,
        }))}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={tab === "completed" ? Award : GraduationCap}
            title={tab === "completed" ? "No completed courses yet" : tab === "not_started" ? "Nothing waiting to start" : "No courses in progress"}
            description={all.length === 0 ? "You haven't enrolled in any courses. Explore the catalog to get started." : "Courses will show up here as your progress changes."}
            action={
              <Link href="/learning/catalog" className={buttonClass("secondary", "sm")}>
                Browse catalog
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((e) => {
            const c = e.course!;
            const style = categoryStyle(c.category);
            const days = e.status !== "completed" ? daysUntil(e.due_date, today) : null;
            const selfEnrolled = !e.assigned_by || e.assigned_by === me.id;
            return (
              <Card key={e.id} className="flex overflow-hidden">
                <div className={cn("w-1.5 shrink-0 bg-gradient-to-b", style.band)} />
                <div className="min-w-0 flex-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/learning/courses/${c.id}`} className="line-clamp-2 text-[15px] font-semibold text-slate-800 hover:text-primary-600">
                        {c.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {c.category} · {c.provider} · {formatHours(Number(c.duration_hours))}
                      </p>
                    </div>
                    {c.is_mandatory && <Badge tone="red">Mandatory</Badge>}
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <CourseProgress value={e.progress} />
                    <span className="w-10 shrink-0 text-right text-xs font-semibold text-slate-600">{e.progress}%</span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>{selfEnrolled ? "Self-enrolled" : `Assigned by ${e.assigner?.full_name ?? "—"}`}</span>
                      {e.status === "completed" ? (
                        <span>Completed {formatDate(e.completed_at)}</span>
                      ) : e.due_date ? (
                        <span className={cn("inline-flex items-center gap-1", days !== null && days < 0 ? "font-medium text-red-600" : days !== null && days <= 7 ? "text-amber-700" : "")}>
                          <CalendarClock className="h-3.5 w-3.5" /> {dueLabel(days)}
                        </span>
                      ) : null}
                    </div>
                    {e.status === "completed" ? (
                      <Link href={`/learning/certificates/${e.id}`} className={buttonClass("outline", "sm")}>
                        <Award className="h-3.5 w-3.5" /> Certificate
                      </Link>
                    ) : (
                      <Link href={`/learning/courses/${c.id}`} className={buttonClass("secondary", "sm")}>
                        {e.status === "enrolled" ? "Start" : "Continue"}
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
