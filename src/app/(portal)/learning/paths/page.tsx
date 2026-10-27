import Link from "next/link";
import { CheckCircle2, Clock, Compass, Layers, Route } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, StatCard, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { cn, formatDate } from "@/lib/utils";
import { startLearningPath } from "../paths-actions";
import { CourseProgress } from "../_components/progress";
import { categoryStyle, formatHours, learningTheme } from "../_lib/course";
import { PATH_SELECT, myEnrollmentMap, pathProgress, type PathCourse } from "../_lib/paths";

export const metadata = { title: "My Learning Paths" };

type PathRow = { id: string; title: string; description: string | null; category: string; published: boolean; created_at: string; courses: PathCourse[] };

export default async function LearningPathsPage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const [{ data: pathData }, { data: myPathData }, mine] = await Promise.all([
    supabase.from("learning_paths").select(PATH_SELECT).eq("published", true).order("created_at", { ascending: false }),
    supabase.from("learning_path_enrollments").select("path_id, due_date, started_at, assigned_by").eq("employee_id", me.id),
    myEnrollmentMap(supabase, me.id),
  ]);
  const paths = (pathData ?? []) as unknown as PathRow[];
  const myPaths = new Map((myPathData ?? []).map((p) => [p.path_id, p]));

  const rows = paths.map((p) => ({ ...p, prog: pathProgress(p.courses, mine), mine: myPaths.get(p.id) }));
  const started = rows.filter((r) => r.mine);
  const explore = rows.filter((r) => !r.mine);
  const done = started.filter((r) => r.prog.total > 0 && r.prog.pct === 100).length;

  return (
    <div>
      <PageHeader
        title="My Learning Paths"
        description="Curated sequences of courses that build a skill step by step."
        breadcrumbs={[{ label: "Learning", href: "/learning" }, { label: "My Learning Paths" }]}
        actions={
          <Link href="/learning/catalog" className={buttonClass("outline")}>
            Browse catalog
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="My paths" value={started.length} icon={Route} tone={cn(learningTheme.pill, learningTheme.text)} hint={`${started.length - done} in progress`} />
        <StatCard label="Completed paths" value={done} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" />
        <StatCard label="Available paths" value={paths.length} icon={Compass} tone="bg-violet-50 text-violet-600" className="col-span-2 lg:col-span-1" />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold text-slate-800">My paths</h2>
        {started.length === 0 ? (
          <Card>
            <EmptyState icon={Route} title="You haven't started a learning path" description="Pick one below — starting a path enrolls you in all its courses." />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {started.map((r) => (
              <PathCard key={r.id} path={r} prog={r.prog} started dueDate={r.mine?.due_date ?? null} assigned={!!r.mine?.assigned_by && r.mine.assigned_by !== me.id} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-800">Explore paths</h2>
        {explore.length === 0 ? (
          <Card>
            <EmptyState icon={Compass} title={paths.length === 0 ? "No learning paths yet" : "You've started every path"} description={paths.length === 0 ? "HR hasn't published any learning paths yet." : "Nice work — keep going on your paths above."} />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {explore.map((r) => (
              <PathCard key={r.id} path={r} prog={r.prog} started={false} dueDate={null} assigned={false} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PathCard({
  path,
  prog,
  started,
  dueDate,
  assigned,
}: {
  path: PathRow;
  prog: ReturnType<typeof pathProgress>;
  started: boolean;
  dueDate: string | null;
  assigned: boolean;
}) {
  const style = categoryStyle(path.category);
  const complete = prog.total > 0 && prog.pct === 100;
  return (
    <Card className="flex flex-col overflow-hidden">
      <Link href={`/learning/paths/${path.id}`} className={cn("block bg-gradient-to-br px-4 py-3 text-white", style.band)}>
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium">{path.category}</span>
          {assigned && <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-[#25708a]">Assigned</span>}
        </div>
        <h3 className="mt-2 line-clamp-2 text-[15px] font-semibold leading-5">{path.title}</h3>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-2 text-xs text-slate-500">{path.description || "No description provided."}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" /> {prog.total} course{prog.total === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {formatHours(prog.hours)}
          </span>
          {dueDate && <Badge tone={complete ? "gray" : "yellow"}>Due {formatDate(dueDate)}</Badge>}
        </div>
        <ol className="mt-3 space-y-1 text-xs text-slate-600">
          {prog.list.slice(0, 3).map((c, i) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#d5e9f0] text-[10px] font-semibold text-[#25708a]">{i + 1}</span>
              <span className="truncate">{c.title}</span>
            </li>
          ))}
          {prog.list.length > 3 && <li className="pl-6 text-slate-400">+{prog.list.length - 3} more</li>}
        </ol>
        <div className="mt-auto pt-4">
          {started || prog.enrolled > 0 ? (
            <div className="mb-3">
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-slate-500">
                  {prog.completed}/{prog.total} completed
                </span>
                <span className="font-medium text-slate-700">{prog.pct}%</span>
              </div>
              <CourseProgress value={prog.pct} />
            </div>
          ) : null}
          <div className="flex gap-2">
            <Link href={`/learning/paths/${path.id}`} className={buttonClass("outline", "sm", "flex-1")}>
              {started ? (complete ? "Review" : "Continue") : "View path"}
            </Link>
            {!started && (
              <ActionButton action={startLearningPath} fields={{ path_id: path.id }} variant="primary" className="flex-1" disabled={prog.total === 0}>
                Start path
              </ActionButton>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
