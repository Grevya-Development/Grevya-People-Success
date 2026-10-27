import Link from "next/link";
import { Building2, ChevronRight, Info, Pencil, Plus, Trash2 } from "lucide-react";
import { Avatar, Button, Card, EmptyState, Field, FormGrid, Input, PageHeader, Select, StatusBadge, Textarea } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";
import { deleteObjective, saveObjective } from "../actions";
import { CycleSelect } from "../_components/cycle-select";
import { CategoryBadge, GoalProgress } from "../_components/display";
import { PERF_THEME, PERSON_COLS, pickCycle, type Cycle, type Goal, type Person } from "../_components/shared";

export const metadata = { title: "Objective Tree" };

type Node = Goal & { owner: Person | null };

export default async function ObjectiveTreePage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: cycleData } = await supabase.from("review_cycles").select("*").order("start_date", { ascending: false });
  const allCycles = (cycleData ?? []) as Cycle[];
  const cycles = allCycles.filter((c) => c.status !== "draft" || me.isHR);
  const cycle = pickCycle(cycles, sp.cycle);

  let q = supabase
    .from("goals")
    .select(`*, owner:employees!employee_id(${PERSON_COLS})`)
    .in("status", ["pending_approval", "approved", "completed"])
    .order("title");
  if (cycle) q = q.or(`cycle_id.eq.${cycle.id},cycle_id.is.null`);
  const { data } = await q;
  const nodes = (data ?? []) as unknown as Node[];

  const byParent = new Map<string, Node[]>();
  for (const n of nodes) {
    if (!n.parent_goal_id) continue;
    byParent.set(n.parent_goal_id, [...(byParent.get(n.parent_goal_id) ?? []), n]);
  }
  const objectives = nodes.filter((n) => n.employee_id === null && !n.parent_goal_id);
  const alignedCount = nodes.filter((n) => n.employee_id !== null && n.parent_goal_id).length;
  const myUnaligned = nodes.filter((n) => n.employee_id === me.id && !n.parent_goal_id);

  return (
    <div>
      <PageHeader
        title="Objective Tree"
        description="How individual goals ladder up to Grevya's organisation objectives."
        breadcrumbs={[{ label: "Performance", href: "/performance" }, { label: "Goal" }, { label: "Objective Tree" }]}
        actions={
          <>
            <CycleSelect cycles={cycles} value={cycle?.id ?? null} />
            {me.isHR && (
              <Dialog
                title="New organisation objective"
                size="lg"
                trigger={
                  <Button>
                    <Plus className="h-4 w-4" /> Add objective
                  </Button>
                }
              >
                <ObjectiveForm cycles={allCycles} defaults={{ cycle_id: cycle?.id ?? null }} />
              </Dialog>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Summary label="Organisation objectives" value={objectives.length} />
        <Summary label="Aligned goals you can see" value={alignedCount} />
        <Summary label="Your unaligned goals" value={myUnaligned.length} warn={myUnaligned.length > 0} />
      </div>

      {objectives.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="No organisation objectives yet"
            description={me.isHR ? "Add the first objective so teams can align their goals." : "HR hasn't published organisation objectives for this cycle."}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {objectives.map((o) => (
            <Card key={o.id} className="overflow-hidden">
              <div className={cn("flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5", PERF_THEME.pill)}>
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white", PERF_THEME.solid)}>
                    <Building2 className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <Link href={`/performance/goals/${o.id}`} className="font-semibold text-slate-800 hover:underline">
                      {o.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Organisation objective · Due {formatDate(o.due_date)}
                      {o.target ? ` · ${o.target}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 pl-12 sm:pl-0">
                  <GoalProgress value={o.progress} className="w-40" />
                  <StatusBadge status={o.status} label={o.status === "completed" ? "Achieved" : "Active"} />
                  {me.isHR && (
                    <span className="flex gap-1">
                      <Dialog
                        title="Edit objective"
                        size="lg"
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="Edit objective" className="h-8 w-8">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        }
                      >
                        <ObjectiveForm cycles={allCycles} defaults={o} />
                      </Dialog>
                      <ActionButton
                        action={deleteObjective}
                        fields={{ id: o.id }}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600"
                        title="Delete objective"
                        confirm="Delete this objective? Aligned goals will become unaligned."
                      >
                        <Trash2 className="h-4 w-4" />
                      </ActionButton>
                    </span>
                  )}
                </div>
              </div>
              <details open className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 border-b border-slate-100 px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 sm:px-5 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                  Aligned goals ({countDescendants(o.id, byParent)})
                </summary>
                <div className="px-3 py-3 sm:px-5">
                  <Branch parentId={o.id} byParent={byParent} depth={0} />
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-5 flex items-start gap-2 text-xs text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        You see organisation objectives, your own goals and your reporting line&apos;s goals. Drafts and rejected goals are hidden.
        {myUnaligned.length > 0 && (
          <>
            {" "}
            <Link href="/performance/goals" className={cn("font-medium hover:underline", PERF_THEME.text)}>
              Align your goals →
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function countDescendants(id: string, byParent: Map<string, Node[]>, seen = new Set<string>()): number {
  let n = 0;
  for (const c of byParent.get(id) ?? []) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    n += 1 + countDescendants(c.id, byParent, seen);
  }
  return n;
}

function Branch({ parentId, byParent, depth }: { parentId: string; byParent: Map<string, Node[]>; depth: number }) {
  const children = byParent.get(parentId) ?? [];
  if (children.length === 0) {
    return depth === 0 ? <p className="px-2 py-2 text-sm text-slate-500">No goals aligned yet.</p> : null;
  }
  return (
    <ul className={cn("space-y-1", depth > 0 && "ml-3 border-l border-dashed border-slate-200 pl-3 sm:ml-5 sm:pl-4")}>
      {children.map((c) => {
        const hasKids = (byParent.get(c.id)?.length ?? 0) > 0 && depth < 8;
        const row = (
          <div className="flex flex-col gap-2 rounded-lg px-2 py-2 hover:bg-slate-50 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              {hasKids ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open/n:rotate-90" />
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              {c.owner ? <Avatar name={c.owner.full_name} src={c.owner.avatar_url} size="sm" /> : <Building2 className={cn("h-5 w-5", PERF_THEME.text)} />}
              <div className="min-w-0">
                <Link href={`/performance/goals/${c.id}`} className="block truncate text-sm font-medium text-slate-800 hover:text-primary-600">
                  {c.title}
                </Link>
                <p className="truncate text-xs text-slate-500">
                  {c.owner ? `${c.owner.full_name} · ${c.owner.employee_code}` : "Organisation"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pl-6 sm:pl-0">
              <CategoryBadge category={c.category} />
              <GoalProgress value={c.progress} className="w-32 sm:w-40" />
              <StatusBadge status={c.status} />
            </div>
          </div>
        );
        return (
          <li key={c.id}>
            {hasKids ? (
              <details open className="group/n">
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{row}</summary>
                <Branch parentId={c.id} byParent={byParent} depth={depth + 1} />
              </details>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Summary({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className={cn("text-xl font-semibold", warn ? "text-amber-600" : "text-slate-800")}>{value}</span>
    </div>
  );
}

function ObjectiveForm({ cycles, defaults }: { cycles: Cycle[]; defaults: Partial<Goal> }) {
  return (
    <ActionForm action={saveObjective} resetOnSuccess={!defaults.id} className="space-y-4">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      <Field label="Objective" required>
        <Input name="title" required minLength={3} maxLength={200} defaultValue={defaults.title} placeholder="e.g. Grow ARR by 40% in FY27" />
      </Field>
      <Field label="Description">
        <Textarea name="description" rows={3} maxLength={4000} defaultValue={defaults.description ?? ""} />
      </Field>
      <Field label="Key result / target">
        <Input name="target" maxLength={1000} defaultValue={defaults.target ?? ""} />
      </Field>
      <FormGrid>
        <Field label="Review cycle" hint="Leave empty to show it in every cycle.">
          <Select name="cycle_id" defaultValue={defaults.cycle_id ?? ""}>
            <option value="">All cycles</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date">
          <Input name="due_date" type="date" defaultValue={defaults.due_date ?? ""} />
        </Field>
        <Field label="Progress (%)">
          <Input name="progress" type="number" min={0} max={100} step={1} defaultValue={defaults.progress ?? 0} />
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={defaults.status === "completed" ? "completed" : "approved"}>
            <option value="approved">Active</option>
            <option value="completed">Achieved</option>
          </Select>
        </Field>
      </FormGrid>
      <div className="flex justify-end border-t border-slate-100 pt-4">
        <SubmitButton>{defaults.id ? "Save changes" : "Create objective"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
