import Link from "next/link";
import { Eye, EyeOff, Pencil, Plus, Route, Trash2, UsersRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Table, TBody, TD, TH, THead, TR, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import { cn, orgToday } from "@/lib/utils";
import { assignLearningPath, deleteLearningPath, setLearningPathPublished } from "../paths-actions";
import { PathForm } from "./path-form";
import { categoryStyle } from "../_lib/course";

/** HR: Learning Paths tab of /learning/admin. */
export async function AdminPaths({ edit }: { edit?: string }) {
  const supabase = await createClient();
  const today = orgToday();
  const [{ data: pathData }, { data: courseData }, { data: deptData }, { data: empData }, { data: penr }, { data: cenr }] = await Promise.all([
    supabase.from("learning_paths").select("id, title, description, category, published, created_at, courses:learning_path_courses(course_id, position)").order("created_at", { ascending: false }),
    supabase.from("courses").select("id, title, category, published").order("title"),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("employees").select("department_id").neq("status", "exited"),
    supabase.from("learning_path_enrollments").select("path_id, employee_id"),
    supabase.from("course_enrollments").select("course_id, employee_id, status").eq("status", "completed"),
  ]);
  const paths = pathData ?? [];
  const courses = courseData ?? [];
  const departments = deptData ?? [];
  const headcount = new Map<string, number>();
  (empData ?? []).forEach((e) => e.department_id && headcount.set(e.department_id, (headcount.get(e.department_id) ?? 0) + 1));
  const categories = [...new Set([...paths.map((p) => p.category), ...courses.map((c) => c.category)])].sort();
  const completedSet = new Set((cenr ?? []).map((e) => `${e.employee_id}:${e.course_id}`));

  const learnersByPath = new Map<string, string[]>();
  (penr ?? []).forEach((e) => learnersByPath.set(e.path_id, [...(learnersByPath.get(e.path_id) ?? []), e.employee_id]));
  const statsFor = (p: (typeof paths)[number]) => {
    const learners = learnersByPath.get(p.id) ?? [];
    const ids = p.courses.map((c) => c.course_id);
    const finished = learners.filter((emp) => ids.length > 0 && ids.every((c) => completedSet.has(`${emp}:${c}`))).length;
    return { learners: learners.length, finished };
  };

  const editing = edit ? paths.find((p) => p.id === edit) : undefined;
  const orderedIds = (p: (typeof paths)[number]) => [...p.courses].sort((a, b) => a.position - b.position).map((c) => c.course_id);

  return (
    <>
      {editing && (
        <Card className="mb-5 ring-2 ring-[#3a95b3]/30">
          <CardHeader
            title={`Edit path · ${editing.title}`}
            action={
              <Link href="/learning/admin?tab=paths" className={buttonClass("ghost", "sm")} aria-label="Close editor">
                <X className="h-4 w-4" />
              </Link>
            }
          />
          <CardBody>
            <PathForm key={editing.id} path={editing} courseIds={orderedIds(editing)} courses={courses} categories={categories} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Learning paths"
          description={`${paths.length} path${paths.length === 1 ? "" : "s"} · ${paths.filter((p) => p.published).length} published`}
          action={
            <Dialog
              trigger={
                <Button size="sm">
                  <Plus className="h-4 w-4" /> New path
                </Button>
              }
              title="New learning path"
              size="lg"
            >
              <PathForm courses={courses} categories={categories} />
            </Dialog>
          }
        />
        {paths.length === 0 ? (
          <EmptyState icon={Route} title="No learning paths yet" description="Group courses into an ordered path, e.g. an onboarding track or a role-based curriculum." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Path</TH>
                <TH>Status</TH>
                <TH className="text-center">Courses</TH>
                <TH className="text-center">Learners</TH>
                <TH className="text-center">Completed</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {paths.map((p) => {
                const s = statsFor(p);
                const style = categoryStyle(p.category);
                return (
                  <TR key={p.id} className={cn(editing?.id === p.id && "bg-[#d5e9f0]/40")}>
                    <TD className="min-w-[220px]">
                      <Link href={`/learning/paths/${p.id}`} className="font-medium text-slate-800 hover:text-primary-600">
                        {p.title}
                      </Link>
                      <div className="mt-1">
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", style.chip)}>{p.category}</span>
                      </div>
                    </TD>
                    <TD>
                      <ActionButton action={setLearningPathPublished} fields={{ id: p.id, published: !p.published }} variant="ghost" title={p.published ? "Unpublish" : "Publish"} className="px-1.5">
                        {p.published ? <Eye className="h-3.5 w-3.5 text-emerald-600" /> : <EyeOff className="h-3.5 w-3.5 text-slate-400" />}
                        <span className={p.published ? "text-emerald-700" : "text-slate-500"}>{p.published ? "Published" : "Draft"}</span>
                      </ActionButton>
                    </TD>
                    <TD className="text-center">{p.courses.length}</TD>
                    <TD className="text-center">{s.learners}</TD>
                    <TD className="text-center">{s.finished}</TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Dialog
                          trigger={
                            <Button size="sm" variant="secondary" disabled={!p.published} title={p.published ? "Assign to a department or everyone" : "Publish first"}>
                              <UsersRound className="h-3.5 w-3.5" /> Assign
                            </Button>
                          }
                          title="Assign learning path"
                          description={p.title}
                          size="sm"
                        >
                          <ActionForm action={assignLearningPath} className="space-y-4">
                            <input type="hidden" name="path_id" value={p.id} />
                            <Field label="Assign to" required>
                              <Select name="target" defaultValue="all" required>
                                <option value="all">Everyone ({(empData ?? []).length})</option>
                                {departments.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.name} ({headcount.get(d.id) ?? 0})
                                  </option>
                                ))}
                              </Select>
                            </Field>
                            <Field label="Due date" hint="Optional — applied to the path and its courses">
                              <Input type="date" name="due_date" min={today} />
                            </Field>
                            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                              Everyone selected is enrolled in all {p.courses.length} published course{p.courses.length === 1 ? "" : "s"} of this path. Existing enrollments are kept as they are. Each person gets one notification.
                            </p>
                            <div className="flex justify-end">
                              <SubmitButton>Assign path</SubmitButton>
                            </div>
                          </ActionForm>
                        </Dialog>
                        <Link href={`/learning/admin?tab=paths&edit=${p.id}`} className={buttonClass("ghost", "sm")} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                        <ActionButton
                          action={deleteLearningPath}
                          fields={{ id: p.id }}
                          variant="ghost"
                          title="Delete"
                          confirm={`Delete "${p.title}"? Course enrollments are kept; learners just stop seeing the path.`}
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
    </>
  );
}
