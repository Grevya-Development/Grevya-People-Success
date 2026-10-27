import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, ChevronRight, GitBranch, MessageSquare, Pencil, Scale, Target, Trash2 } from "lucide-react";
import { Avatar, Button, Card, CardBody, CardHeader, EmptyState, Field, PageHeader, ProgressRing, StatusBadge, Textarea } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/utils";
import { addGoalComment, completeGoal, decideGoal, deleteGoal, recallGoal, submitGoal } from "../../actions";
import { CategoryBadge, GoalProgress, PersonCell } from "../../_components/display";
import { GoalForm } from "../../_components/goal-form";
import { loadGoalFormData } from "../../_components/data";
import { ProgressForm } from "../../_components/progress-form";
import { EDITABLE_STATUSES, PERF_THEME, PERSON_COLS, type Goal, type Person } from "../../_components/shared";

export const metadata = { title: "Goal details" };

type Detail = Goal & {
  owner: Person | null;
  approver: { full_name: string | null } | null;
  creator: { id: string; full_name: string | null } | null;
  cycle: { id: string; name: string; status: string } | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const me = await requireEmployee();
  const supabase = await createClient();

  const { data } = await supabase
    .from("goals")
    .select(
      `*, owner:employees!employee_id(${PERSON_COLS}), approver:employees!approver_id(full_name), creator:employees!created_by(id, full_name), cycle:review_cycles!cycle_id(id, name, status)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const goal = data as unknown as Detail;

  // Alignment chain (up to 6 levels), aligned sub-goals and the update timeline
  const chain: { id: string; title: string; employee_id: string | null }[] = [];
  let parentId = goal.parent_goal_id;
  for (let i = 0; parentId && i < 6; i++) {
    const { data: p } = await supabase.from("goals").select("id, title, employee_id, parent_goal_id").eq("id", parentId).maybeSingle();
    if (!p) break;
    chain.unshift(p);
    parentId = p.parent_goal_id;
  }

  const [{ data: childData }, { data: updateData }] = await Promise.all([
    supabase
      .from("goals")
      .select(`id, title, status, progress, owner:employees!employee_id(${PERSON_COLS})`)
      .eq("parent_goal_id", goal.id)
      .order("title"),
    supabase
      .from("goal_updates")
      .select(`id, progress, comment, created_at, author:employees!author_id(${PERSON_COLS})`)
      .eq("goal_id", goal.id)
      .order("created_at", { ascending: false }),
  ]);
  const children = (childData ?? []) as unknown as { id: string; title: string; status: string; progress: number; owner: Person | null }[];
  const updates = (updateData ?? []) as unknown as { id: string; progress: number | null; comment: string; created_at: string; author: Person | null }[];

  const isOrg = goal.employee_id === null;
  const isOwner = goal.employee_id === me.id;
  let isApprover = false;
  if (!isOrg && !isOwner) {
    const { data: allowed } = await supabase.rpc("can_approve_for", { emp: goal.employee_id! });
    isApprover = Boolean(allowed);
  }
  const closed = goal.cycle?.status === "closed";
  const form =
    isOwner && EDITABLE_STATUSES.includes(goal.status) && !closed
      ? await loadGoalFormData(supabase, me, { ownerIds: [me.id], parentOwnerIds: me.manager_id ? [me.manager_id] : [] })
      : null;

  return (
    <div>
      <PageHeader
        title={goal.title}
        breadcrumbs={[
          { label: "Performance", href: "/performance" },
          isOrg ? { label: "Objective Tree", href: "/performance/objective-tree" } : isOwner ? { label: "My Goals", href: "/performance/goals" } : { label: "My Team Goals", href: "/performance/team-goals" },
          { label: "Goal details" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge category={goal.category} />
            <StatusBadge status={goal.status} label={isOrg ? (goal.status === "completed" ? "Achieved" : "Active") : undefined} />
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card>
            <CardBody className="space-y-5">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <ProgressRing value={goal.progress} size={92} stroke={8} color={PERF_THEME.hex}>
                  <span className="text-lg font-semibold text-slate-800">{goal.progress}%</span>
                </ProgressRing>
                <dl className="grid flex-1 grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                  {!isOrg && (
                    <div>
                      <dt className="flex items-center gap-1 text-xs text-slate-500">
                        <Scale className="h-3.5 w-3.5" /> Weightage
                      </dt>
                      <dd className="mt-0.5 font-semibold text-slate-800">{+Number(goal.weightage).toFixed(2)}%</dd>
                    </div>
                  )}
                  <div>
                    <dt className="flex items-center gap-1 text-xs text-slate-500">
                      <CalendarDays className="h-3.5 w-3.5" /> Due date
                    </dt>
                    <dd className="mt-0.5 font-semibold text-slate-800">{formatDate(goal.due_date)}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1 text-xs text-slate-500">
                      <Target className="h-3.5 w-3.5" /> Cycle
                    </dt>
                    <dd className="mt-0.5 font-semibold text-slate-800">{goal.cycle?.name ?? "—"}</dd>
                  </div>
                </dl>
              </div>
              {goal.description && (
                <div>
                  <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</h4>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{goal.description}</p>
                </div>
              )}
              {goal.target && (
                <div>
                  <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500">Target / KPI</h4>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{goal.target}</p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Alignment" description="How this goal connects to the organisation's objectives." />
            <CardBody>
              {chain.length === 0 ? (
                <p className="text-sm text-slate-500">{isOrg ? "This is a top-level organisation objective." : "This goal is not aligned to a parent goal."}</p>
              ) : (
                <ol className="flex flex-wrap items-center gap-1.5 text-sm">
                  {chain.map((p) => (
                    <li key={p.id} className="flex items-center gap-1.5">
                      <Link href={`/performance/goals/${p.id}`} className={`rounded-full px-3 py-1 font-medium ${PERF_THEME.pill} ${PERF_THEME.text} hover:underline`}>
                        {p.employee_id === null && <span className="mr-1 text-[10px] uppercase opacity-70">Org</span>}
                        {p.title}
                      </Link>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    </li>
                  ))}
                  <li className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">{goal.title}</li>
                </ol>
              )}
              {children.length > 0 && (
                <div className="mt-5">
                  <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <GitBranch className="h-3.5 w-3.5" /> Aligned goals ({children.length})
                  </h4>
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                    {children.map((c) => (
                      <li key={c.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <Link href={`/performance/goals/${c.id}`} className="text-sm font-medium text-slate-800 hover:text-primary-600">
                            {c.title}
                          </Link>
                          <p className="text-xs text-slate-500">{c.owner?.full_name ?? "Organisation"}</p>
                        </div>
                        <GoalProgress value={c.progress} className="sm:w-40" />
                        <StatusBadge status={c.status} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Update timeline" description={`${updates.length} update${updates.length === 1 ? "" : "s"}`} />
            <CardBody>
              {(isOwner || isApprover) && !isOrg && (
                <div className="mb-5 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  {isOwner && goal.status === "approved" && !closed ? (
                    <ProgressForm goalId={goal.id} current={goal.progress} />
                  ) : (
                    <ActionForm action={addGoalComment} className="space-y-3">
                      <input type="hidden" name="id" value={goal.id} />
                      <Field label="Add a comment">
                        <Textarea name="comment" rows={2} required minLength={2} maxLength={2000} placeholder={isApprover ? "Feedback for your team member…" : "Add a note…"} />
                      </Field>
                      <div className="flex justify-end">
                        <SubmitButton size="sm">
                          <MessageSquare className="h-3.5 w-3.5" /> Post comment
                        </SubmitButton>
                      </div>
                    </ActionForm>
                  )}
                </div>
              )}
              {updates.length === 0 ? (
                <EmptyState icon={MessageSquare} title="No updates yet" description="Progress updates and comments will appear here." className="py-8" />
              ) : (
                <ol className="relative space-y-5 border-l border-slate-200 pl-6">
                  {updates.map((u) => (
                    <li key={u.id} className="relative">
                      <span className="absolute -left-[37px] top-0">
                        <Avatar name={u.author?.full_name} src={u.author?.avatar_url} size="xs" />
                      </span>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span className="font-medium text-slate-800">{u.author?.full_name ?? "Someone"}</span>
                        <span>{formatDateTime(u.created_at)}</span>
                        {u.progress !== null && <span className={`rounded-full px-2 py-0.5 font-medium ${PERF_THEME.pill} ${PERF_THEME.text}`}>Progress → {u.progress}%</span>}
                      </div>
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{u.comment}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title={isOrg ? "Objective owner" : "Goal owner"} />
            <CardBody className="space-y-4">
              {isOrg ? <p className="text-sm text-slate-600">Organisation objective · managed by HR</p> : <PersonCell person={goal.owner} />}
              {goal.creator && goal.creator.id !== goal.employee_id && !isOrg && <p className="text-xs text-slate-500">Assigned by {goal.creator.full_name}</p>}
              <p className="text-xs text-slate-500">Created {formatDate(goal.created_at)} · Updated {formatDate(goal.updated_at)}</p>
            </CardBody>
          </Card>

          {!isOrg && (
            <Card>
              <CardHeader title="Approval" />
              <CardBody className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Status</span>
                  <StatusBadge status={goal.status} />
                </div>
                {goal.approver && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Actioned by</span>
                    <span className="text-right font-medium text-slate-800">{goal.approver.full_name}</span>
                  </div>
                )}
                {goal.actioned_at && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">On</span>
                    <span className="text-right text-slate-700">{formatDateTime(goal.actioned_at)}</span>
                  </div>
                )}
                {goal.approver_remarks ? (
                  <div className={`rounded-lg px-3 py-2 text-xs ${goal.status === "rejected" ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-700"}`}>
                    <p className="font-medium">Approver remarks</p>
                    <p className="mt-0.5 whitespace-pre-line">{goal.approver_remarks}</p>
                  </div>
                ) : (
                  goal.status !== "draft" && goal.status !== "pending_approval" && <p className="text-xs text-slate-400">No remarks from the approver.</p>
                )}
                {goal.status === "pending_approval" && isApprover && (
                  <div className="flex gap-2 border-t border-slate-100 pt-3">
                    <ActionButton action={decideGoal} fields={{ id: goal.id, decision: "approve" }} variant="success" prompt="Remarks (optional)" confirm="Approve this goal?">
                      Approve
                    </ActionButton>
                    <ActionButton action={decideGoal} fields={{ id: goal.id, decision: "reject" }} variant="danger" prompt="Reason for rejection" promptRequired confirm="Reject this goal?">
                      Reject
                    </ActionButton>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {isOwner && !closed && goal.status !== "completed" && (
            <Card>
              <CardHeader title="Actions" />
              <CardBody className="flex flex-wrap gap-2">
                {form && (
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
                      defaults={{ ...goal, weightage: Number(goal.weightage) }}
                    />
                  </Dialog>
                )}
                {(goal.status === "draft" || goal.status === "rejected") && (
                  <>
                    <ActionButton action={submitGoal} fields={{ id: goal.id }} variant="primary">
                      Submit for approval
                    </ActionButton>
                    <ActionButton action={deleteGoal} fields={{ id: goal.id, redirect: "list" }} variant="danger" confirm="Delete this goal permanently?">
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </ActionButton>
                  </>
                )}
                {goal.status === "pending_approval" && (
                  <ActionButton action={recallGoal} fields={{ id: goal.id }} confirm="Move this goal back to draft?">
                    Recall to draft
                  </ActionButton>
                )}
                {goal.status === "approved" && (
                  <ActionButton action={completeGoal} fields={{ id: goal.id }} variant="success" prompt="Closing comment (optional)" confirm="Mark this goal as completed?">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark completed
                  </ActionButton>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
