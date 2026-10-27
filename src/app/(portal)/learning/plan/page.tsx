import Link from "next/link";
import { AlertTriangle, CalendarCheck, CalendarClock, ListChecks } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR, buttonClass } from "@/components/ui";
import { cn, formatDate, orgToday } from "@/lib/utils";
import { CourseProgress } from "../_components/progress";
import { daysUntil, dueLabel } from "../_lib/course";

export const metadata = { title: "My Learning Plan" };

export default async function LearningPlanPage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const today = orgToday();

  const { data } = await supabase
    .from("course_enrollments")
    .select(
      "id, status, progress, due_date, enrolled_at, completed_at, assigned_by, course:courses!course_enrollments_course_id_fkey(id, title, category, is_mandatory), assigner:employees!course_enrollments_assigned_by_fkey(full_name, avatar_url)",
    )
    .eq("employee_id", me.id);

  const rows = (data ?? [])
    .filter((e) => e.course)
    .map((e) => ({ ...e, days: e.status === "completed" ? null : daysUntil(e.due_date, today) }));

  const pending = rows
    .filter((e) => e.status !== "completed")
    .sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return Number(b.course!.is_mandatory) - Number(a.course!.is_mandatory) || a.enrolled_at.localeCompare(b.enrolled_at);
    });
  const done = rows.filter((e) => e.status === "completed").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  const overdue = pending.filter((e) => e.days !== null && e.days < 0).length;
  const dueThisMonth = pending.filter((e) => e.days !== null && e.days >= 0 && e.days <= 30).length;
  const onTime = done.filter((e) => !e.due_date || (e.completed_at ?? "").slice(0, 10) <= e.due_date).length;

  const renderRow = (e: (typeof rows)[number]) => {
    const isOverdue = e.days !== null && e.days < 0;
    const selfEnrolled = !e.assigned_by || e.assigned_by === me.id;
    return (
      <TR key={e.id} className={cn(isOverdue && "bg-red-50/70 hover:bg-red-50")}>
        <TD className="min-w-[220px]">
          <div className="flex items-start gap-2">
            {isOverdue && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
            <div className="min-w-0">
              <Link href={`/learning/courses/${e.course!.id}`} className="font-medium text-slate-800 hover:text-primary-600">
                {e.course!.title}
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                {e.course!.category}
                {e.course!.is_mandatory && <Badge tone="red">Mandatory</Badge>}
              </div>
            </div>
          </div>
        </TD>
        <TD>
          {selfEnrolled ? (
            <span className="text-xs text-slate-500">Self-enrolled</span>
          ) : (
            <span className="flex items-center gap-2">
              <Avatar name={e.assigner?.full_name} src={e.assigner?.avatar_url} size="xs" />
              <span className="whitespace-nowrap text-sm">{e.assigner?.full_name ?? "—"}</span>
            </span>
          )}
        </TD>
        <TD className="whitespace-nowrap text-xs">{formatDate(e.enrolled_at)}</TD>
        <TD className="whitespace-nowrap">
          {e.due_date ? (
            <>
              <span className={cn("text-sm", isOverdue && "font-semibold text-red-700")}>{formatDate(e.due_date)}</span>
              {e.status !== "completed" && (
                <span className={cn("block text-xs", isOverdue ? "text-red-600" : e.days! <= 7 ? "text-amber-700" : "text-slate-500")}>{dueLabel(e.days)}</span>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-400">No due date</span>
          )}
        </TD>
        <TD className="min-w-[140px]">
          <div className="flex items-center gap-2">
            <CourseProgress value={e.progress} size="sm" />
            <span className="w-9 text-right text-xs text-slate-600">{e.progress}%</span>
          </div>
        </TD>
        <TD>
          {e.status === "completed" ? (
            <span className="text-xs text-slate-500">
              <StatusBadge status="completed" />
              <span className="mt-1 block">{formatDate(e.completed_at)}</span>
            </span>
          ) : isOverdue ? (
            <Badge tone="red">Overdue</Badge>
          ) : (
            <StatusBadge status={e.status} label={e.status === "enrolled" ? "Not started" : undefined} />
          )}
        </TD>
      </TR>
    );
  };

  const head = (
    <THead>
      <tr>
        <TH>Course</TH>
        <TH>Assigned by</TH>
        <TH>Enrolled</TH>
        <TH>Due date</TH>
        <TH>Progress</TH>
        <TH>Status</TH>
      </tr>
    </THead>
  );

  return (
    <div>
      <PageHeader
        title="My Learning Plan"
        description="Everything you've been assigned or signed up for, ordered by due date."
        breadcrumbs={[{ label: "Learning", href: "/learning" }, { label: "My Learning Plan" }]}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pending" value={pending.length} icon={ListChecks} tone="bg-[#d5e9f0] text-[#25708a]" />
        <StatCard label="Overdue" value={overdue} icon={AlertTriangle} tone="bg-red-50 text-red-600" className={overdue ? "ring-1 ring-red-200" : undefined} />
        <StatCard label="Due in 30 days" value={dueThisMonth} icon={CalendarClock} tone="bg-amber-50 text-amber-600" />
        <StatCard label="Completed on time" value={`${onTime}/${done.length}`} icon={CalendarCheck} tone="bg-emerald-50 text-emerald-600" />
      </div>

      <Card className="mb-5">
        <CardHeader title="Upcoming & pending" description={overdue ? `${overdue} course${overdue === 1 ? " is" : "s are"} past due — please prioritise ${overdue === 1 ? "it" : "them"}.` : undefined} />
        {pending.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="Your plan is clear"
            description="No pending courses. Explore the catalog to keep learning."
            action={
              <Link href="/learning/catalog" className={buttonClass("secondary", "sm")}>
                Browse catalog
              </Link>
            }
          />
        ) : (
          <Table>
            {head}
            <TBody>{pending.map(renderRow)}</TBody>
          </Table>
        )}
      </Card>

      {done.length > 0 && (
        <Card>
          <CardHeader title="Completed" description={`${done.length} course${done.length === 1 ? "" : "s"}`} />
          <Table>
            {head}
            <TBody>{done.map(renderRow)}</TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
