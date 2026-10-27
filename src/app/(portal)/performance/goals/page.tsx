import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, GitBranch, Pencil, Plus, Scale, Target, TrendingUp } from "lucide-react";
import { Button, Card, CardHeader, EmptyState, PageHeader, StatCard, StatusBadge, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { Dialog } from "@/components/ui/dialog";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";
import { completeGoal, deleteGoal, recallGoal, submitGoal } from "../actions";
import { CycleSelect } from "../_components/cycle-select";
import { CategoryBadge, GoalProgress } from "../_components/display";
import { GoalForm } from "../_components/goal-form";
import { loadGoalFormData } from "../_components/data";
import { ProgressForm } from "../_components/progress-form";
import {
  EDITABLE_STATUSES,
  GOAL_STATUS_LABEL,
  GOAL_STATUS_ORDER,
  PERF_THEME,
  averageProgress,
  pickCycle,
  weightageTotal,
  type Cycle,
  type Goal,
} from "../_components/shared";

export const metadata = { title: "My Goals" };

type GoalRow = Goal & { parent: { id: string; title: string } | null };

export default async function MyGoalsPage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: cycleData } = await supabase.from("review_cycles").select("*").order("start_date", { ascending: false });
  const cycles = ((cycleData ?? []) as Cycle[]).filter((c) => c.status !== "draft" || me.isHR);
  const cycle = pickCycle(cycles, sp.cycle);

  const [{ data: goalData }, form] = await Promise.all([
    cycle
      ? supabase
          .from("goals")
          .select("*, parent:parent_goal_id(id, title)")
          .eq("employee_id", me.id)
          .eq("cycle_id", cycle.id)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    loadGoalFormData(supabase, me, { ownerIds: [me.id], parentOwnerIds: me.manager_id ? [me.manager_id] : [] }),
  ]);
  const goals = (goalData ?? []) as unknown as GoalRow[];

  const total = weightageTotal(goals);
  const avg = averageProgress(goals);
  const active = goals.filter((g) => g.status !== "rejected").length;
  const completed = goals.filter((g) => g.status === "completed").length;
  const closed = cycle?.status === "closed";
  const editableCycles = form.cycles;

  return (
    <div>
      <PageHeader
        title="My Goals"
        description={cycle ? `${cycle.name} · ${formatDate(cycle.start_date)} – ${formatDate(cycle.end_date)}` : undefined}
        breadcrumbs={[{ label: "Performance", href: "/performance" }, { label: "Goal" }, { label: "My Goals" }]}
        actions={
          <>
            <CycleSelect cycles={cycles} value={cycle?.id ?? null} />
            {!closed && editableCycles.length > 0 && (
              <Link href={`/performance/goals/new${cycle ? `?cycle=${cycle.id}` : ""}`} className={buttonClass("primary")}>
                <Plus className="h-4 w-4" /> Create new Goal
              </Link>
            )}
          </>
        }
      />

      {!cycle ? (
        <Card>
          <EmptyState icon={CalendarClock} title="No review cycles yet" description="Goals are set within a review cycle. HR will open one soon." />
        </Card>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Goals" value={active} hint={`${completed} completed`} icon={Target} tone={cn(PERF_THEME.pill, PERF_THEME.text)} />
            <StatCard label="Average progress" value={`${avg}%`} hint="Weighted, approved goals" icon={TrendingUp} tone="bg-emerald-50 text-emerald-600" />
            <StatCard
              label="Total weightage"
              value={`${+total.toFixed(2)}%`}
              hint={total === 100 ? "Balanced" : total > 100 ? "Over 100%" : `${+(100 - total).toFixed(2)}% unallocated`}
              icon={Scale}
              tone={total === 100 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}
            />
            <StatCard
              label="Pending approval"
              value={goals.filter((g) => g.status === "pending_approval").length}
              hint={me.manager ? `Approver: ${me.manager.full_name}` : "Approver: HR"}
              icon={CheckCircle2}
              tone="bg-amber-50 text-amber-600"
            />
          </div>

          {goals.length > 0 && total !== 100 && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Your goal weightage adds up to <strong>{+total.toFixed(2)}%</strong>. It should total exactly 100% for this cycle
                {total < 100 ? " — add a goal or increase weightage on a draft." : " — reduce weightage on a draft or pending goal."}
              </p>
            </div>
          )}

          {goals.length === 0 ? (
            <Card>
              <EmptyState
                icon={Target}
                title="No goals in this cycle"
                description={closed ? "This cycle is closed." : "Create your first goal and align it to an organisation objective."}
                action={
                  !closed && editableCycles.length > 0 ? (
                    <Link href={`/performance/goals/new?cycle=${cycle.id}`} className={buttonClass("primary")}>
                      <Plus className="h-4 w-4" /> Create new Goal
                    </Link>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <div className="space-y-5">
              {GOAL_STATUS_ORDER.map((status) => {
                const list = goals.filter((g) => g.status === status);
                if (list.length === 0) return null;
                return (
                  <Card key={status} className="overflow-hidden">
                    <CardHeader
                      title={
                        <span className="flex items-center gap-2">
                          {GOAL_STATUS_LABEL[status]}
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{list.length}</span>
                        </span>
                      }
                    />
                    <ul className="divide-y divide-slate-100">
                      {list.map((g) => (
                        <GoalItem key={g.id} goal={g} cycleClosed={closed} form={form} me={{ id: me.id, manager_id: me.manager_id }} />
                      ))}
                    </ul>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GoalItem({
  goal: g,
  cycleClosed,
  form,
  me,
}: {
  goal: GoalRow;
  cycleClosed: boolean;
  form: Awaited<ReturnType<typeof loadGoalFormData>>;
  me: { id: string; manager_id: string | null };
}) {
  const editable = EDITABLE_STATUSES.includes(g.status) && !cycleClosed;
  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/performance/goals/${g.id}`} className="font-medium text-slate-800 hover:text-primary-600">
              {g.title}
            </Link>
            <CategoryBadge category={g.category} />
            <StatusBadge status={g.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>
              Weightage <strong className="text-slate-700">{+Number(g.weightage).toFixed(2)}%</strong>
            </span>
            {g.target && <span className="max-w-md truncate">Target: {g.target}</span>}
            <span>Due {formatDate(g.due_date)}</span>
            {g.parent && (
              <Link href={`/performance/goals/${g.parent.id}`} className="inline-flex items-center gap-1 hover:text-primary-600">
                <GitBranch className="h-3 w-3" /> {g.parent.title}
              </Link>
            )}
          </div>
          {g.status === "rejected" && g.approver_remarks && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              <span className="font-medium">Manager remarks:</span> {g.approver_remarks}
            </p>
          )}
          {(g.status === "approved" || g.status === "completed") && <GoalProgress value={g.progress} className="mt-3 max-w-md" />}
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {editable && (
            <Dialog
              title="Edit goal"
              size="lg"
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              }
            >
              <GoalForm
                mode="update"
                ownerId={me.id}
                ownerManagerId={me.manager_id}
                cycles={form.cycles}
                parents={form.parents}
                weights={form.weights}
                defaults={{ ...g, weightage: Number(g.weightage) }}
              />
            </Dialog>
          )}
          {(g.status === "draft" || g.status === "rejected") && !cycleClosed && (
            <>
              <ActionButton action={submitGoal} fields={{ id: g.id }} variant="primary">
                Submit
              </ActionButton>
              <ActionButton action={deleteGoal} fields={{ id: g.id }} variant="ghost" confirm={`Delete “${g.title}”?`} className="text-red-600">
                Delete
              </ActionButton>
            </>
          )}
          {g.status === "pending_approval" && (
            <ActionButton action={recallGoal} fields={{ id: g.id }} confirm="Move this goal back to draft?">
              Recall
            </ActionButton>
          )}
          {g.status === "approved" && !cycleClosed && (
            <>
              <Dialog title="Update progress" description={g.title} trigger={<Button size="sm">Update progress</Button>}>
                <ProgressForm goalId={g.id} current={g.progress} />
              </Dialog>
              <ActionButton action={completeGoal} fields={{ id: g.id }} variant="success" prompt="Closing comment (optional)" confirm="Mark this goal as completed?">
                Mark completed
              </ActionButton>
            </>
          )}
          <Link href={`/performance/goals/${g.id}`} className={buttonClass("ghost", "sm")}>
            Details
          </Link>
        </div>
      </div>
    </li>
  );
}
