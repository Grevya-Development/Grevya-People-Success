import Link from "next/link";
import { AlertTriangle, BookOpen, CheckCircle2, Eye, EyeOff, GraduationCap, Pencil, Plus, Trash2, UsersRound, X } from "lucide-react";
import { requireHR } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select, StatCard, Table, TBody, TD, TH, THead, TR, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import { LinkTabs } from "@/components/ui/link-tabs";
import { cn, humanize, orgToday } from "@/lib/utils";
import { bulkAssign, deleteCourse, setCoursePublished } from "../actions";
import { CompletionChart } from "../_components/completion-chart";
import { CourseForm } from "../_components/course-form";
import { CourseProgress } from "../_components/progress";
import { AdminPaths } from "../_components/admin-paths";
import { AdminWiki } from "../_components/admin-wiki";
import { categoryStyle, formatHours, parseModules } from "../_lib/course";

export const metadata = { title: "Learning Admin" };

export default async function LearningAdminPage({ searchParams }: { searchParams: Promise<{ edit?: string; q?: string; tab?: string }> }) {
  await requireHR();
  const { edit, q: rawQ, tab } = await searchParams;
  const q = (rawQ ?? "").trim().toLowerCase();
  const supabase = await createClient();

  const { count: pendingWiki } = await supabase.from("wiki_articles").select("id", { count: "exact", head: true }).eq("status", "submitted");
  const tabs = (
    <LinkTabs
      tabs={[
        { label: "Courses", href: "/learning/admin" },
        { label: "Learning Paths", href: "/learning/admin?tab=paths" },
        { label: "Wiki moderation", href: "/learning/admin?tab=wiki", count: pendingWiki ?? 0 },
      ]}
    />
  );
  if (tab === "paths" || tab === "wiki") {
    return (
      <div>
        <PageHeader
          title="Learning Admin"
          description={tab === "paths" ? "Curate ordered learning paths and assign them across the organisation." : "Review articles submitted to the Knowledge Wiki."}
          breadcrumbs={[{ label: "HR Admin" }, { label: "Learning Admin" }]}
        />
        {tabs}
        {tab === "paths" ? <AdminPaths edit={edit} /> : <AdminWiki />}
      </div>
    );
  }
  const today = orgToday();

  const [{ data: courseData }, { data: enrData }, { data: deptData }, { data: empData }] = await Promise.all([
    supabase.from("courses").select("*").order("created_at", { ascending: false }),
    supabase.from("course_enrollments").select("course_id, status, due_date"),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("employees").select("department_id").neq("status", "exited"),
  ]);
  const courses = courseData ?? [];
  const enrollments = enrData ?? [];
  const departments = deptData ?? [];
  const headcount = new Map<string, number>();
  (empData ?? []).forEach((e) => e.department_id && headcount.set(e.department_id, (headcount.get(e.department_id) ?? 0) + 1));
  const totalHeadcount = (empData ?? []).length;
  const categories = [...new Set(courses.map((c) => c.category))].sort();

  const stats = new Map<string, { enrolled: number; active: number; done: number; overdue: number }>();
  enrollments.forEach((e) => {
    const s = stats.get(e.course_id) ?? { enrolled: 0, active: 0, done: 0, overdue: 0 };
    s.enrolled++;
    if (e.status === "in_progress") s.active++;
    if (e.status === "completed") s.done++;
    else if (e.due_date && e.due_date < today) s.overdue++;
    stats.set(e.course_id, s);
  });
  const statFor = (id: string) => stats.get(id) ?? { enrolled: 0, active: 0, done: 0, overdue: 0 };
  const totalDone = enrollments.filter((e) => e.status === "completed").length;
  const totalOverdue = [...stats.values()].reduce((s, v) => s + v.overdue, 0);

  const chartData = courses
    .filter((c) => statFor(c.id).enrolled > 0)
    .map((c) => {
      const s = statFor(c.id);
      return { title: c.title, enrolled: s.enrolled, completed: s.done, completion: Math.round((s.done / s.enrolled) * 100) };
    })
    .sort((a, b) => b.enrolled - a.enrolled)
    .slice(0, 10);

  const shown = q ? courses.filter((c) => c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)) : courses;
  const editing = edit ? courses.find((c) => c.id === edit) : undefined;

  return (
    <div>
      <PageHeader
        title="Learning Admin"
        description="Create courses, publish them to the catalog and assign them across the organisation."
        breadcrumbs={[{ label: "HR Admin" }, { label: "Learning Admin" }]}
        actions={
          <Dialog
            trigger={
              <Button>
                <Plus className="h-4 w-4" /> New course
              </Button>
            }
            title="New course"
            size="lg"
          >
            <CourseForm categories={categories} />
          </Dialog>
        }
      />

      {tabs}

      {editing && (
        <Card className="mb-5 ring-2 ring-[#3a95b3]/30">
          <CardHeader
            title={`Edit · ${editing.title}`}
            action={
              <Link href="/learning/admin" className={buttonClass("ghost", "sm")} aria-label="Close editor">
                <X className="h-4 w-4" />
              </Link>
            }
          />
          <CardBody>
            <CourseForm key={editing.id} course={editing} modules={parseModules(editing.modules)} categories={categories} />
          </CardBody>
        </Card>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Courses" value={courses.length} icon={BookOpen} tone="bg-[#d5e9f0] text-[#25708a]" hint={`${courses.filter((c) => c.published).length} published`} />
        <StatCard label="Enrollments" value={enrollments.length} icon={GraduationCap} tone="bg-sky-50 text-sky-600" />
        <StatCard
          label="Completion rate"
          value={enrollments.length ? `${Math.round((totalDone / enrollments.length) * 100)}%` : "—"}
          icon={CheckCircle2}
          tone="bg-emerald-50 text-emerald-600"
          hint={`${totalDone} completed`}
        />
        <StatCard label="Overdue" value={totalOverdue} icon={AlertTriangle} tone="bg-red-50 text-red-600" hint="Past due, not completed" />
      </div>

      {chartData.length > 0 && (
        <Card className="mb-5">
          <CardHeader title="Completion by course" description="Share of enrolled learners who completed · top 10 courses by enrollment" />
          <CardBody>
            <CompletionChart data={chartData} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Courses"
          description={`${shown.length} of ${courses.length}`}
          action={
            <form action="/learning/admin" className="flex gap-2">
              <Input name="q" defaultValue={rawQ ?? ""} placeholder="Search title or category" className="h-8 w-44 text-xs sm:w-56" aria-label="Search courses" />
            </form>
          }
        />
        {shown.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={courses.length === 0 ? "No courses yet" : "No courses match"}
            description={courses.length === 0 ? "Create your first course to start building the catalog." : "Try a different search."}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Course</TH>
                <TH>Status</TH>
                <TH className="text-center">Enrolled</TH>
                <TH className="text-center">In progress</TH>
                <TH className="text-center">Completed</TH>
                <TH>Completion</TH>
                <TH className="text-center">Overdue</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {shown.map((c) => {
                const s = statFor(c.id);
                const pct = s.enrolled ? Math.round((s.done / s.enrolled) * 100) : 0;
                const style = categoryStyle(c.category);
                const modules = parseModules(c.modules);
                return (
                  <TR key={c.id} className={cn(editing?.id === c.id && "bg-[#d5e9f0]/40")}>
                    <TD className="min-w-[240px]">
                      <Link href={`/learning/courses/${c.id}`} className="font-medium text-slate-800 hover:text-primary-600">
                        {c.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", style.chip)}>{c.category}</span>
                        <span>{humanize(c.level)}</span>·<span>{formatHours(Number(c.duration_hours))}</span>·<span>{modules.length} modules</span>
                        {c.is_mandatory && <Badge tone="red">Mandatory</Badge>}
                      </div>
                    </TD>
                    <TD>
                      <ActionButton
                        action={setCoursePublished}
                        fields={{ id: c.id, published: !c.published }}
                        variant="ghost"
                        title={c.published ? "Unpublish" : "Publish"}
                        className="px-1.5"
                      >
                        {c.published ? <Eye className="h-3.5 w-3.5 text-emerald-600" /> : <EyeOff className="h-3.5 w-3.5 text-slate-400" />}
                        <span className={c.published ? "text-emerald-700" : "text-slate-500"}>{c.published ? "Published" : "Draft"}</span>
                      </ActionButton>
                    </TD>
                    <TD className="text-center">{s.enrolled}</TD>
                    <TD className="text-center">{s.active}</TD>
                    <TD className="text-center">{s.done}</TD>
                    <TD className="min-w-[140px]">
                      {s.enrolled ? (
                        <div className="flex items-center gap-2">
                          <CourseProgress value={pct} size="sm" />
                          <span className="w-9 text-right text-xs font-medium text-slate-600">{pct}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TD>
                    <TD className="text-center">{s.overdue ? <Badge tone="red">{s.overdue}</Badge> : <span className="text-slate-400">0</span>}</TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Dialog
                          trigger={
                            <Button size="sm" variant="secondary" disabled={!c.published} title={c.published ? "Assign to a department or everyone" : "Publish first"}>
                              <UsersRound className="h-3.5 w-3.5" /> Assign
                            </Button>
                          }
                          title="Bulk assign course"
                          description={c.title}
                          size="sm"
                        >
                          <ActionForm action={bulkAssign} className="space-y-4">
                            <input type="hidden" name="course_id" value={c.id} />
                            <Field label="Assign to" required>
                              <Select name="target" defaultValue="all" required>
                                <option value="all">Everyone ({totalHeadcount})</option>
                                {departments.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.name} ({headcount.get(d.id) ?? 0})
                                  </option>
                                ))}
                              </Select>
                            </Field>
                            <Field label="Due date" hint="Optional">
                              <Input type="date" name="due_date" min={today} />
                            </Field>
                            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                              Employees who are already enrolled are skipped. Exited employees are excluded. Everyone assigned gets a notification.
                            </p>
                            <div className="flex justify-end">
                              <SubmitButton>Assign</SubmitButton>
                            </div>
                          </ActionForm>
                        </Dialog>
                        <Link href={`/learning/admin?edit=${c.id}`} className={buttonClass("ghost", "sm")} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                        <ActionButton
                          action={deleteCourse}
                          fields={{ id: c.id }}
                          variant="ghost"
                          title="Delete"
                          confirm={s.enrolled ? `Delete "${c.title}"? ${s.enrolled} enrollment(s) will also be removed.` : `Delete "${c.title}"?`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </ActionButton>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
