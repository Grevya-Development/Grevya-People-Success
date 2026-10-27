import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Award, CalendarDays, CheckCircle2, Plus, Trash2, Users } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import { cn, formatDate, orgToday } from "@/lib/utils";
import { removeEnrollment, updateDueDate } from "../actions";
import { AssignForm } from "../_components/assign-form";
import { CourseProgress } from "../_components/progress";
import { daysUntil, dueLabel } from "../_lib/course";

export const metadata = { title: "My Team Courses" };

type Emp = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  manager_id: string | null;
  employee_code: string;
  designation: { title: string } | null;
};

export default async function TeamLearningPage({ searchParams }: { searchParams: Promise<{ emp?: string; status?: string }> }) {
  const me = await requireManager();
  const { emp: empFilter, status: statusFilter } = await searchParams;
  const supabase = await createClient();
  const today = orgToday();

  const [{ data: empData }, { data: courseData }] = await Promise.all([
    supabase.from("employees").select("id, full_name, avatar_url, manager_id, employee_code, designation:designations(title)").neq("status", "exited"),
    supabase.from("courses").select("id, title, category").eq("published", true).order("title"),
  ]);

  // Everyone in my reporting chain (direct + indirect).
  const employees = (empData ?? []) as Emp[];
  const byManager = new Map<string, Emp[]>();
  employees.forEach((e) => {
    if (!e.manager_id) return;
    byManager.set(e.manager_id, [...(byManager.get(e.manager_id) ?? []), e]);
  });
  const team: (Emp & { direct: boolean })[] = [];
  const seen = new Set<string>([me.id]);
  const queue: { id: string; depth: number }[] = [{ id: me.id, depth: 0 }];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const r of byManager.get(cur.id) ?? []) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      team.push({ ...r, direct: cur.depth === 0 });
      queue.push({ id: r.id, depth: cur.depth + 1 });
    }
  }
  team.sort((a, b) => Number(b.direct) - Number(a.direct) || a.full_name.localeCompare(b.full_name));
  const teamIds = team.map((t) => t.id);

  const { data: enrData } = teamIds.length
    ? await supabase
        .from("course_enrollments")
        .select(
          "id, employee_id, status, progress, due_date, completed_at, assigned_by, course:courses!course_enrollments_course_id_fkey(id, title, category), assigner:employees!course_enrollments_assigned_by_fkey(full_name)",
        )
        .in("employee_id", teamIds)
        .order("enrolled_at", { ascending: false })
    : { data: [] };
  const enrollments = (enrData ?? [])
    .filter((e) => e.course)
    .map((e) => ({ ...e, days: e.status === "completed" ? null : daysUntil(e.due_date, today) }));

  const stats = new Map<string, { total: number; done: number; active: number; overdue: number }>();
  enrollments.forEach((e) => {
    const s = stats.get(e.employee_id) ?? { total: 0, done: 0, active: 0, overdue: 0 };
    s.total++;
    if (e.status === "completed") s.done++;
    if (e.status === "in_progress") s.active++;
    if (e.days !== null && e.days < 0) s.overdue++;
    stats.set(e.employee_id, s);
  });
  const totalDone = enrollments.filter((e) => e.status === "completed").length;
  const totalOverdue = enrollments.filter((e) => e.days !== null && e.days < 0).length;

  const nameOf = new Map(team.map((t) => [t.id, t]));
  const selectedEmp = empFilter && nameOf.has(empFilter) ? empFilter : null;
  const filteredEnrollments = enrollments
    .filter((e) => !selectedEmp || e.employee_id === selectedEmp)
    .filter((e) => {
      if (statusFilter === "overdue") return e.days !== null && e.days < 0;
      if (statusFilter === "pending") return e.status !== "completed";
      if (statusFilter === "completed") return e.status === "completed";
      return true;
    });

  const people = team.map((t) => ({ id: t.id, full_name: t.full_name, avatar_url: t.avatar_url, subtitle: t.designation?.title ?? t.employee_code, direct: t.direct }));
  const courses = courseData ?? [];
  const filterHref = (patch: { emp?: string | null; status?: string | null }) => {
    const p = new URLSearchParams();
    const emp = patch.emp === undefined ? selectedEmp : patch.emp;
    const st = patch.status === undefined ? statusFilter : patch.status;
    if (emp) p.set("emp", emp);
    if (st) p.set("status", st);
    const s = p.toString();
    return `/learning/team${s ? `?${s}` : ""}`;
  };

  const assignDialog = (trigger: ReactNode, defaultEmployeeId?: string) => (
    <Dialog trigger={trigger} title="Assign a course" description="Assigned learners get a notification and see it on their learning plan." size="md">
      <AssignForm courses={courses} people={people} today={today} defaultEmployeeId={defaultEmployeeId} />
    </Dialog>
  );

  return (
    <div>
      <PageHeader
        title="My Team Courses"
        description="Track your team's courses and assign learning with due dates."
        breadcrumbs={[{ label: "Learning", href: "/learning" }, { label: "My Team Courses" }]}
        actions={
          team.length > 0
            ? assignDialog(
                <Button>
                  <Plus className="h-4 w-4" /> Assign course
                </Button>,
              )
            : undefined
        }
      />

      {team.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="No one reports to you yet"
            description={me.isHR ? "As HR you can assign courses to departments or the whole company from Learning Admin." : "Team learning appears here once employees report to you."}
            action={
              me.isHR ? (
                <Link href="/learning/admin" className={buttonClass("secondary", "sm")}>
                  Open Learning Admin
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Team members" value={team.length} icon={Users} tone="bg-[#d5e9f0] text-[#25708a]" hint={`${team.filter((t) => t.direct).length} direct`} />
            <StatCard label="Enrollments" value={enrollments.length} icon={CalendarDays} tone="bg-sky-50 text-sky-600" />
            <StatCard
              label="Completion rate"
              value={enrollments.length ? `${Math.round((totalDone / enrollments.length) * 100)}%` : "—"}
              icon={CheckCircle2}
              tone="bg-emerald-50 text-emerald-600"
              hint={`${totalDone} completed`}
            />
            <StatCard label="Overdue" value={totalOverdue} icon={AlertTriangle} tone="bg-red-50 text-red-600" />
          </div>

          <Card className="mb-5">
            <CardHeader title="Team overview" description="Completion = completed ÷ enrolled courses" />
            <Table>
              <THead>
                <tr>
                  <TH>Team member</TH>
                  <TH className="text-center">Enrolled</TH>
                  <TH className="text-center">In progress</TH>
                  <TH className="text-center">Completed</TH>
                  <TH className="text-center">Overdue</TH>
                  <TH>Completion</TH>
                  <TH className="text-right">Actions</TH>
                </tr>
              </THead>
              <TBody>
                {team.map((t) => {
                  const s = stats.get(t.id) ?? { total: 0, done: 0, active: 0, overdue: 0 };
                  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
                  return (
                    <TR key={t.id} className={cn(selectedEmp === t.id && "bg-[#d5e9f0]/40")}>
                      <TD>
                        <div className="flex items-center gap-3">
                          <Avatar name={t.full_name} src={t.avatar_url} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-800">{t.full_name}</p>
                            <p className="truncate text-xs text-slate-500">
                              {t.designation?.title ?? t.employee_code}
                              {!t.direct && " · indirect"}
                            </p>
                          </div>
                        </div>
                      </TD>
                      <TD className="text-center">{s.total}</TD>
                      <TD className="text-center">{s.active}</TD>
                      <TD className="text-center">{s.done}</TD>
                      <TD className="text-center">{s.overdue ? <Badge tone="red">{s.overdue}</Badge> : <span className="text-slate-400">0</span>}</TD>
                      <TD className="min-w-[150px]">
                        {s.total ? (
                          <div className="flex items-center gap-2">
                            <CourseProgress value={pct} size="sm" />
                            <span className="w-9 text-right text-xs font-medium text-slate-600">{pct}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">No courses</span>
                        )}
                      </TD>
                      <TD>
                        <div className="flex justify-end gap-2">
                          <Link href={filterHref({ emp: selectedEmp === t.id ? null : t.id })} className={buttonClass("ghost", "sm")}>
                            {selectedEmp === t.id ? "Show all" : "View"}
                          </Link>
                          {assignDialog(
                            <Button size="sm" variant="secondary">
                              Assign
                            </Button>,
                            t.id,
                          )}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader
              title={selectedEmp ? `Enrollments · ${nameOf.get(selectedEmp)?.full_name}` : "Team enrollments"}
              description={`${filteredEnrollments.length} record${filteredEnrollments.length === 1 ? "" : "s"}`}
              action={
                <div className="flex flex-wrap gap-1">
                  {[
                    { k: null, l: "All" },
                    { k: "pending", l: "Pending" },
                    { k: "overdue", l: "Overdue" },
                    { k: "completed", l: "Completed" },
                  ].map((f) => (
                    <Link
                      key={f.l}
                      href={filterHref({ status: f.k })}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        (statusFilter ?? null) === f.k ? "bg-[#3a95b3] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                      )}
                    >
                      {f.l}
                    </Link>
                  ))}
                </div>
              }
            />
            {filteredEnrollments.length === 0 ? (
              <EmptyState icon={CalendarDays} title="No enrollments to show" description="Assign a course to get your team started." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Employee</TH>
                    <TH>Course</TH>
                    <TH>Assigned by</TH>
                    <TH>Due date</TH>
                    <TH>Progress</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Actions</TH>
                  </tr>
                </THead>
                <TBody>
                  {filteredEnrollments.map((e) => {
                    const person = nameOf.get(e.employee_id);
                    const overdue = e.days !== null && e.days < 0;
                    return (
                      <TR key={e.id} className={cn(overdue && "bg-red-50/70 hover:bg-red-50")}>
                        <TD className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Avatar name={person?.full_name} src={person?.avatar_url} size="xs" />
                            <span className="text-sm">{person?.full_name}</span>
                          </div>
                        </TD>
                        <TD className="min-w-[200px]">
                          <Link href={`/learning/courses/${e.course!.id}`} className="font-medium text-slate-800 hover:text-primary-600">
                            {e.course!.title}
                          </Link>
                          <p className="text-xs text-slate-500">{e.course!.category}</p>
                        </TD>
                        <TD className="whitespace-nowrap text-xs">{!e.assigned_by || e.assigned_by === e.employee_id ? "Self-enrolled" : (e.assigner?.full_name ?? "—")}</TD>
                        <TD className="whitespace-nowrap">
                          {e.due_date ? (
                            <>
                              <span className={cn("text-sm", overdue && "font-semibold text-red-700")}>{formatDate(e.due_date)}</span>
                              {e.status !== "completed" && <span className={cn("block text-xs", overdue ? "text-red-600" : "text-slate-500")}>{dueLabel(e.days)}</span>}
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TD>
                        <TD className="min-w-[130px]">
                          <div className="flex items-center gap-2">
                            <CourseProgress value={e.progress} size="sm" />
                            <span className="w-9 text-right text-xs text-slate-600">{e.progress}%</span>
                          </div>
                        </TD>
                        <TD>
                          {overdue ? <Badge tone="red">Overdue</Badge> : <StatusBadge status={e.status} label={e.status === "enrolled" ? "Not started" : undefined} />}
                        </TD>
                        <TD>
                          <div className="flex justify-end gap-1">
                            {e.status === "completed" ? (
                              <Link href={`/learning/certificates/${e.id}`} className={buttonClass("ghost", "sm")}>
                                <Award className="h-3.5 w-3.5" /> Certificate
                              </Link>
                            ) : (
                              <>
                                <Dialog
                                  trigger={
                                    <Button size="sm" variant="ghost">
                                      Due date
                                    </Button>
                                  }
                                  title="Change due date"
                                  description={`${person?.full_name} · ${e.course!.title}`}
                                  size="sm"
                                >
                                  <ActionForm action={updateDueDate} className="space-y-4">
                                    <input type="hidden" name="enrollment_id" value={e.id} />
                                    <Field label="Due date" hint="Leave empty to remove the due date">
                                      <Input type="date" name="due_date" defaultValue={e.due_date ?? ""} />
                                    </Field>
                                    <div className="flex justify-end">
                                      <SubmitButton>Save</SubmitButton>
                                    </div>
                                  </ActionForm>
                                </Dialog>
                                <ActionButton
                                  action={removeEnrollment}
                                  fields={{ enrollment_id: e.id }}
                                  variant="ghost"
                                  confirm={`Remove "${e.course!.title}" from ${person?.full_name}?`}
                                  title="Remove assignment"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                </ActionButton>
                              </>
                            )}
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
