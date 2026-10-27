import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle, Clock, Layers, PlayCircle, Route } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardHeader, EmptyState, PageHeader, ProgressRing, StatusBadge, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { cn, formatDate, humanize, orgToday } from "@/lib/utils";
import { leaveLearningPath, startLearningPath } from "../../paths-actions";
import { CourseProgress } from "../../_components/progress";
import { categoryStyle, daysUntil, dueLabel, formatHours } from "../../_lib/course";
import { PATH_SELECT, myEnrollmentMap, pathProgress, type PathCourse } from "../../_lib/paths";

export const metadata = { title: "Learning Path" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LearningPathPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireEmployee();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const [{ data }, { data: myPath }, mine] = await Promise.all([
    supabase.from("learning_paths").select(PATH_SELECT).eq("id", id).maybeSingle(),
    supabase.from("learning_path_enrollments").select("id, due_date, started_at, assigned_by").eq("path_id", id).eq("employee_id", me.id).maybeSingle(),
    myEnrollmentMap(supabase, me.id),
  ]);
  if (!data) notFound();
  const path = data as unknown as { id: string; title: string; description: string | null; category: string; published: boolean; courses: PathCourse[] };
  const prog = pathProgress(path.courses, mine);
  const style = categoryStyle(path.category);
  const today = orgToday();
  const assigned = !!myPath?.assigned_by && myPath.assigned_by !== me.id;
  const missing = prog.list.filter((c) => !mine.has(c.id) && c.published).length;
  const due = daysUntil(myPath?.due_date, today);

  return (
    <div>
      <PageHeader
        title={path.title}
        breadcrumbs={[{ label: "Learning", href: "/learning" }, { label: "My Learning Paths", href: "/learning/paths" }, { label: path.title }]}
        actions={
          <>
            {myPath && !assigned && (
              <ActionButton action={leaveLearningPath} fields={{ path_id: path.id }} size="md" confirm="Remove this path from My Learning Paths? Your course enrollments and progress are kept.">
                Remove path
              </ActionButton>
            )}
            {(!myPath || missing > 0) && path.published && (
              <ActionButton action={startLearningPath} fields={{ path_id: path.id }} variant="primary" size="md" disabled={prog.total === 0}>
                <PlayCircle className="h-4 w-4" /> {myPath ? `Enroll in ${missing} remaining course${missing === 1 ? "" : "s"}` : "Start path"}
              </ActionButton>
            )}
          </>
        }
      />

      {!path.published && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">This path is unpublished — only HR can see it.</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="overflow-hidden lg:order-2">
          <div className={cn("bg-gradient-to-br px-5 py-4 text-white", style.band)}>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium">{path.category}</span>
            <div className="mt-3 flex items-center gap-4">
              <ProgressRing value={prog.pct} size={72} stroke={7} color="#ffffff" track="rgba(255,255,255,0.25)">
                <span className="text-sm font-semibold">{prog.pct}%</span>
              </ProgressRing>
              <div className="text-sm">
                <p className="font-semibold">
                  {prog.completed} of {prog.total} courses completed
                </p>
                <p className="text-white/80">{myPath ? `Started ${formatDate(myPath.started_at)}` : "Not started yet"}</p>
              </div>
            </div>
          </div>
          <div className="space-y-3 p-5 text-sm">
            {path.description && <p className="whitespace-pre-line text-slate-600">{path.description}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Layers className="h-3.5 w-3.5" /> {prog.total} courses
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {formatHours(prog.hours)} total
              </span>
            </div>
            {assigned && <Badge tone="teal">Assigned by HR</Badge>}
            {myPath?.due_date && (
              <p className={cn("text-xs", due !== null && due < 0 && prog.pct < 100 ? "font-medium text-red-600" : "text-slate-600")}>
                {prog.pct < 100 ? dueLabel(due) : "Due"} · {formatDate(myPath.due_date)}
              </p>
            )}
          </div>
        </Card>

        <Card className="min-w-0 lg:order-1 lg:col-span-2">
          <CardHeader title="Courses in this path" description="Complete them in order — progress = completed courses ÷ total courses" />
          {prog.list.length === 0 ? (
            <EmptyState icon={Route} title="No courses yet" description="HR hasn't added courses to this path." />
          ) : (
            <ol className="divide-y divide-slate-100">
              {prog.list.map((c, i) => {
                const e = mine.get(c.id);
                const isNext = prog.next?.id === c.id && !!myPath;
                return (
                  <li key={c.id} className={cn("flex gap-3 px-4 py-4 sm:px-5", isNext && "bg-[#d5e9f0]/30")}>
                    <div className="flex flex-col items-center">
                      {e?.status === "completed" ? (
                        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                      ) : (
                        <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold", e ? "bg-[#3a95b3] text-white" : "bg-slate-100 text-slate-500")}>{i + 1}</span>
                      )}
                      {i < prog.list.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/learning/courses/${c.id}`} className="text-sm font-medium text-slate-800 hover:text-primary-600">
                          {c.title}
                        </Link>
                        {isNext && <Badge tone="teal">Up next</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {c.category} · {humanize(c.level)} · {formatHours(Number(c.duration_hours))}
                        {!c.published && " · no longer in catalog"}
                      </p>
                      {e ? (
                        <div className="mt-2 flex max-w-sm items-center gap-3">
                          <CourseProgress value={e.progress} size="sm" />
                          <StatusBadge status={e.status} label={e.status === "enrolled" ? "Not started" : undefined} />
                        </div>
                      ) : (
                        <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-400">
                          <Circle className="h-3 w-3" /> Not enrolled
                        </p>
                      )}
                    </div>
                    <Link href={`/learning/courses/${c.id}`} className={buttonClass(isNext ? "primary" : "outline", "sm", "hidden shrink-0 self-center sm:inline-flex")}>
                      {e?.status === "completed" ? "Review" : e && e.status !== "enrolled" ? "Continue" : e ? "Start" : "View"}
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
