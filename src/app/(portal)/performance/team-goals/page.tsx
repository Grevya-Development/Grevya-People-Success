import Link from "next/link";
import { CalendarClock, ClipboardCheck, GitBranch, Plus, Users } from "lucide-react";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, PageHeader, StatusBadge, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { Dialog } from "@/components/ui/dialog";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";
import { addGoalComment, decideGoal } from "../actions";
import { CycleSelect } from "../_components/cycle-select";
import { CategoryBadge, GoalProgress, PersonCell } from "../_components/display";
import { GoalForm } from "../_components/goal-form";
import { loadGoalFormData, loadTeam, toFormMembers } from "../_components/data";
import { PERF_THEME, PERSON_COLS, averageProgress, pickCycle, weightageTotal, type Cycle, type Goal, type Person } from "../_components/shared";

export const metadata = { title: "My Team Goals" };

type TeamGoal = Goal & { owner: Person | null; parent: { id: string; title: string } | null; cycle: { name: string } | null };

export default async function TeamGoalsPage({ searchParams }: { searchParams: Promise<{ cycle?: string; scope?: string }> }) {
  const me = await requireManager();
  const sp = await searchParams;
  const scope = me.isHR && sp.scope === "all" ? "all" : "team";
  const supabase = await createClient();

  const [{ data: cycleData }, team] = await Promise.all([
    supabase.from("review_cycles").select("*").order("start_date", { ascending: false }),
    loadTeam(supabase, me, scope),
  ]);
  const cycles = ((cycleData ?? []) as Cycle[]).filter((c) => c.status !== "draft" || me.isHR);
  const cycle = pickCycle(cycles, sp.cycle);
  const ids = team.map((t) => t.id);
  const select = `*, owner:employees!employee_id(${PERSON_COLS}), parent:parent_goal_id(id, title), cycle:review_cycles!cycle_id(name)`;

  // Team goals (drafts stay private to their owner)
  const teamGoals = () => {
    const q = supabase.from("goals").select(select).neq("employee_id", me.id).neq("status", "draft");
    return scope === "all" ? q.not("employee_id", "is", null) : q.in("employee_id", ids);
  };

  const [pendingRes, cycleRes, form] = await Promise.all([
    ids.length ? teamGoals().eq("status", "pending_approval").order("updated_at") : Promise.resolve({ data: [] }),
    ids.length && cycle ? teamGoals().eq("cycle_id", cycle.id).order("created_at") : Promise.resolve({ data: [] }),
    loadGoalFormData(supabase, me, {
      ownerIds: scope === "all" ? [] : ids,
      parentOwnerIds: [...new Set(team.map((t) => t.manager_id).filter((x): x is string => !!x))],
    }),
  ]);
  const pending = (pendingRes.data ?? []) as unknown as TeamGoal[];
  const cycleGoals = (cycleRes.data ?? []) as unknown as TeamGoal[];
  const byPerson = new Map<string, TeamGoal[]>();
  for (const g of cycleGoals) byPerson.set(g.employee_id!, [...(byPerson.get(g.employee_id!) ?? []), g]);
  const people = scope === "all" ? team.filter((t) => byPerson.has(t.id)) : team;

  return (
    <div>
      <PageHeader
        title="My Team Goals"
        description={scope === "all" ? "Goals across the organisation" : "Review, approve and support your team's goals."}
        breadcrumbs={[{ label: "Performance", href: "/performance" }, { label: "Goal" }, { label: "My Team Goals" }]}
        actions={
          <>
            <CycleSelect cycles={cycles} value={cycle?.id ?? null} />
            {team.length > 0 && form.cycles.length > 0 && scope === "team" && (
              <Dialog
                title="Assign a goal"
                description="Assigned goals are approved immediately and appear in the employee's goals."
                size="lg"
                trigger={
                  <Button>
                    <Plus className="h-4 w-4" /> Assign goal
                  </Button>
                }
              >
                <GoalForm mode="assign" cycles={form.cycles} parents={form.parents} weights={form.weights} members={toFormMembers(team)} defaults={{ cycle_id: cycle?.id }} />
              </Dialog>
            )}
          </>
        }
      />

      {me.isHR && (
        <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm">
          {(["team", "all"] as const).map((s) => (
            <Link
              key={s}
              href={`/performance/team-goals?scope=${s}${cycle ? `&cycle=${cycle.id}` : ""}`}
              className={cn("rounded-md px-3 py-1.5 font-medium", scope === s ? cn(PERF_THEME.pill, PERF_THEME.text) : "text-slate-500 hover:text-slate-800")}
            >
              {s === "team" ? "My reporting line" : "All employees"}
            </Link>
          ))}
        </div>
      )}

      {team.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="No team members" description="People who report to you will appear here." />
        </Card>
      ) : (
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-amber-500" /> Pending approvals
                  <Badge tone={pending.length ? "yellow" : "gray"}>{pending.length}</Badge>
                </span>
              }
              description="Goals submitted by your team, across all cycles."
            />
            {pending.length === 0 ? (
              <EmptyState title="You're all caught up" description="No goals are waiting for your approval." className="py-8" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {pending.map((g) => (
                  <li key={g.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
                    <div className="lg:w-56">
                      <PersonCell person={g.owner} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/performance/goals/${g.id}`} className="font-medium text-slate-800 hover:text-primary-600">
                          {g.title}
                        </Link>
                        <CategoryBadge category={g.category} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {g.cycle?.name ?? "No cycle"} · Weightage {+Number(g.weightage).toFixed(2)}% · Due {formatDate(g.due_date)}
                        {g.target ? ` · Target: ${g.target}` : ""}
                      </p>
                      {g.description && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{g.description}</p>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <ActionButton action={decideGoal} fields={{ id: g.id, decision: "approve" }} variant="success" prompt="Remarks (optional)" confirm={`Approve “${g.title}”?`}>
                        Approve
                      </ActionButton>
                      <ActionButton action={decideGoal} fields={{ id: g.id, decision: "reject" }} variant="danger" prompt="Reason for rejection" promptRequired confirm={`Reject “${g.title}”?`}>
                        Reject
                      </ActionButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {!cycle ? (
            <Card>
              <EmptyState icon={CalendarClock} title="No review cycles yet" description="Team goals are tracked per review cycle." />
            </Card>
          ) : people.length === 0 ? (
            <Card>
              <EmptyState icon={Users} title="No goals in this cycle" />
            </Card>
          ) : (
            people.map((p) => {
              const goals = byPerson.get(p.id) ?? [];
              const total = weightageTotal(goals);
              return (
                <Card key={p.id} className="overflow-hidden">
                  <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar name={p.full_name} src={p.avatar_url} />
                      <div>
                        <p className="font-medium text-slate-800">{p.full_name}</p>
                        <p className="text-xs text-slate-500">
                          {p.employee_code}
                          {p.designation?.title ? ` · ${p.designation.title}` : ""}
                          {p.manager_id !== me.id && scope === "team" ? " · indirect report" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={cn("rounded-full px-2.5 py-1 font-medium", PERF_THEME.pill, PERF_THEME.text)}>{goals.length} goal{goals.length === 1 ? "" : "s"}</span>
                      <span className={cn("rounded-full px-2.5 py-1 font-medium", total === 100 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
                        Weightage {+total.toFixed(2)}%
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">Avg {averageProgress(goals)}%</span>
                    </div>
                  </div>
                  {goals.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-slate-500">No goals set in this cycle yet.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {goals.map((g) => (
                        <li key={g.id} className="flex flex-col gap-2 px-5 py-3 md:flex-row md:items-center">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link href={`/performance/goals/${g.id}`} className="text-sm font-medium text-slate-800 hover:text-primary-600">
                                {g.title}
                              </Link>
                              <CategoryBadge category={g.category} />
                            </div>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                              <span>{+Number(g.weightage).toFixed(2)}%</span>
                              <span>Due {formatDate(g.due_date)}</span>
                              {g.parent && (
                                <span className="inline-flex items-center gap-1">
                                  <GitBranch className="h-3 w-3" /> {g.parent.title}
                                </span>
                              )}
                            </p>
                          </div>
                          <GoalProgress value={g.progress} className="md:w-44" />
                          <div className="flex items-center gap-2 md:w-56 md:justify-end">
                            <StatusBadge status={g.status} />
                            {g.status !== "draft" && (
                              <ActionButton action={addGoalComment} fields={{ id: g.id }} variant="ghost" prompt="Comment" promptRequired confirm="Comment on progress">
                                Comment
                              </ActionButton>
                            )}
                            <Link href={`/performance/goals/${g.id}`} className={buttonClass("ghost", "sm")}>
                              View
                            </Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
