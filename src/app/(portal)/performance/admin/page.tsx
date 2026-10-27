import Link from "next/link";
import { BarChart3, CalendarRange, CheckCircle2, ClipboardList, Pencil, Plus, Rocket, Target, Trash2, Users } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  FormGrid,
  Input,
  PageHeader,
  ProgressRing,
  Select,
  StatCard,
  StatusBadge,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import { requireHR } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";
import { deleteCycle, launchReviews, saveCycle, setCyclePhase } from "../actions";
import { SimpleBarChart } from "../_components/charts";
import { CYCLE_PHASES, PERF_THEME, PHASE_LABEL, RATING_LABEL, defaultCycle, type Cycle } from "../_components/shared";

export const metadata = { title: "Review Cycles" };

const NEXT_PHASE: Record<string, string | undefined> = { draft: "goal_setting", goal_setting: "in_review", in_review: "closed" };
const GOAL_STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  pending_approval: "#f59e0b",
  approved: "#4a8ad0",
  rejected: "#ef4444",
  completed: "#10b981",
};

export default async function PerformanceAdminPage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  await requireHR();
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: cycleData }, { data: reviewData }, { data: goalData }, { count: activeCount }] = await Promise.all([
    supabase.from("review_cycles").select("*").order("start_date", { ascending: false }),
    supabase.from("reviews").select("cycle_id, status, final_rating"),
    supabase.from("goals").select("cycle_id, status").not("employee_id", "is", null),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active"),
  ]);
  const cycles = (cycleData ?? []) as Cycle[];
  const reviews = reviewData ?? [];
  const goals = goalData ?? [];
  const selected = cycles.find((c) => c.id === sp.cycle) ?? defaultCycle(cycles);

  const perCycle = new Map<string, { reviews: number; completed: number; goals: number }>();
  for (const c of cycles) perCycle.set(c.id, { reviews: 0, completed: 0, goals: 0 });
  for (const r of reviews) {
    const s = perCycle.get(r.cycle_id);
    if (!s) continue;
    s.reviews++;
    if (r.status === "completed") s.completed++;
  }
  for (const g of goals) {
    const s = g.cycle_id ? perCycle.get(g.cycle_id) : undefined;
    if (s) s.goals++;
  }

  const selReviews = selected ? reviews.filter((r) => r.cycle_id === selected.id) : [];
  const selGoals = selected ? goals.filter((g) => g.cycle_id === selected.id) : [];
  const completed = selReviews.filter((r) => r.status === "completed").length;
  const completion = selReviews.length ? Math.round((completed / selReviews.length) * 100) : 0;
  const ratingData = [1, 2, 3, 4, 5].map((n) => ({
    label: `${n}★`,
    value: selReviews.filter((r) => r.final_rating !== null && Math.round(Number(r.final_rating)) === n).length,
  }));
  const rated = selReviews.filter((r) => r.final_rating !== null);
  const avgRating = rated.length ? (rated.reduce((s, r) => s + Number(r.final_rating), 0) / rated.length).toFixed(2) : "—";
  const goalData2 = ["draft", "pending_approval", "approved", "rejected", "completed"].map((s) => ({
    label: s === "pending_approval" ? "Pending" : s === "approved" ? "In progress" : s[0].toUpperCase() + s.slice(1),
    value: selGoals.filter((g) => g.status === s).length,
    color: GOAL_STATUS_COLORS[s],
  }));

  return (
    <div>
      <PageHeader
        title="Review Cycles"
        description="Run goal setting and performance reviews across Grevya."
        breadcrumbs={[{ label: "HR Admin" }, { label: "Performance" }, { label: "Review Cycles" }]}
        actions={
          <Dialog
            title="New review cycle"
            trigger={
              <Button>
                <Plus className="h-4 w-4" /> New cycle
              </Button>
            }
          >
            <CycleForm />
          </Dialog>
        }
      />

      <Card className="mb-6 overflow-hidden">
        <CardHeader title="Cycles" description="Phases: Draft → Goal setting → In review → Closed" />
        {cycles.length === 0 ? (
          <EmptyState icon={CalendarRange} title="No review cycles" description="Create a cycle to open goal setting for employees." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Cycle</TH>
                <TH>Dates</TH>
                <TH>Phase</TH>
                <TH>Goals</TH>
                <TH>Reviews</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {cycles.map((c) => {
                const s = perCycle.get(c.id)!;
                const next = NEXT_PHASE[c.status];
                const canLaunch = c.status === "goal_setting" || c.status === "in_review";
                return (
                  <TR key={c.id} className={cn(selected?.id === c.id && "bg-[#d9e7f5]/30")}>
                    <TD className="min-w-44">
                      <Link href={`/performance/admin?cycle=${c.id}`} className="font-medium text-slate-800 hover:text-primary-600">
                        {c.name}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-slate-600">
                      {formatDate(c.start_date)} – {formatDate(c.end_date)}
                    </TD>
                    <TD>
                      <StatusBadge status={c.status} label={PHASE_LABEL[c.status]} />
                    </TD>
                    <TD className="tabular-nums">{s.goals}</TD>
                    <TD className="whitespace-nowrap tabular-nums">
                      {s.reviews ? (
                        <>
                          {s.completed}/{s.reviews} <span className="text-xs text-slate-400">done</span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">Not launched</span>
                      )}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {canLaunch && (
                          <ActionButton
                            action={launchReviews}
                            fields={{ id: c.id }}
                            variant="secondary"
                            confirm={`Create reviews for all active employees (${activeCount ?? 0}) in ${c.name}?${c.status === "goal_setting" ? " The cycle moves to In review." : ""} Existing reviews are kept.`}
                          >
                            <Rocket className="h-3.5 w-3.5" /> Launch reviews
                          </ActionButton>
                        )}
                        {next && (
                          <ActionButton
                            action={setCyclePhase}
                            fields={{ id: c.id, status: next }}
                            variant={next === "closed" ? "outline" : "primary"}
                            confirm={next === "closed" ? `Close ${c.name}? Employees will no longer be able to edit goals or self-assessments.` : undefined}
                          >
                            {next === "closed" ? "Close cycle" : `Start ${PHASE_LABEL[next].toLowerCase()}`}
                          </ActionButton>
                        )}
                        {c.status === "closed" && (
                          <ActionButton action={setCyclePhase} fields={{ id: c.id, status: "in_review" }} confirm={`Reopen ${c.name} for review?`}>
                            Reopen
                          </ActionButton>
                        )}
                        <Dialog
                          title="Edit review cycle"
                          trigger={
                            <Button variant="ghost" size="sm" aria-label="Edit cycle">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          }
                        >
                          <CycleForm cycle={c} />
                        </Dialog>
                        {s.goals === 0 && s.reviews === 0 && (
                          <ActionButton action={deleteCycle} fields={{ id: c.id }} variant="ghost" className="text-red-600" confirm={`Delete ${c.name}?`} title="Delete cycle">
                            <Trash2 className="h-3.5 w-3.5" />
                          </ActionButton>
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

      {selected && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <BarChart3 className={cn("h-5 w-5", PERF_THEME.text)} />
            <h2 className="text-lg font-semibold text-slate-800">{selected.name}</h2>
            <StatusBadge status={selected.status} label={PHASE_LABEL[selected.status]} />
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Reviews launched" value={selReviews.length} hint={`${activeCount ?? 0} active employees`} icon={Users} tone={cn(PERF_THEME.pill, PERF_THEME.text)} />
            <StatCard label="Awaiting self-assessment" value={selReviews.filter((r) => r.status === "pending_self").length} icon={ClipboardList} tone="bg-amber-50 text-amber-600" />
            <StatCard label="Awaiting manager" value={selReviews.filter((r) => r.status === "pending_manager").length} icon={ClipboardList} tone="bg-violet-50 text-violet-600" />
            <StatCard label="Average final rating" value={avgRating} hint={`${rated.length} rated`} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card>
              <CardHeader title="Review completion" />
              <CardBody className="flex flex-col items-center gap-3 py-6">
                <ProgressRing value={completion} size={140} stroke={12} color={PERF_THEME.hex}>
                  <div className="text-center">
                    <p className="text-3xl font-semibold text-slate-800">{completion}%</p>
                    <p className="text-xs text-slate-500">completed</p>
                  </div>
                </ProgressRing>
                <p className="text-sm text-slate-600">
                  {completed} of {selReviews.length} reviews completed
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Final rating distribution" description={rated.length ? undefined : "No completed reviews yet"} />
              <CardBody>
                <SimpleBarChart data={ratingData} />
                <ul className="mt-2 grid grid-cols-1 gap-0.5 text-[11px] text-slate-500 sm:grid-cols-2">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <li key={n}>
                      {n}★ {RATING_LABEL[n]}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Goals by status" description={`${selGoals.length} employee goals`} />
              <CardBody>
                {selGoals.length === 0 ? <EmptyState icon={Target} title="No goals in this cycle" className="py-10" /> : <SimpleBarChart data={goalData2} />}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function CycleForm({ cycle }: { cycle?: Cycle }) {
  return (
    <ActionForm action={saveCycle} resetOnSuccess={!cycle} className="space-y-4">
      {cycle && <input type="hidden" name="id" value={cycle.id} />}
      <Field label="Name" required>
        <Input name="name" required minLength={3} maxLength={120} defaultValue={cycle?.name} placeholder="e.g. FY 2026-27 Annual Review" />
      </Field>
      <FormGrid>
        <Field label="Start date" required>
          <Input name="start_date" type="date" required defaultValue={cycle?.start_date} />
        </Field>
        <Field label="End date" required>
          <Input name="end_date" type="date" required defaultValue={cycle?.end_date} />
        </Field>
      </FormGrid>
      <Field label="Phase" hint="Employees can create goals in Goal setting and In review; Draft cycles are hidden from employees.">
        <Select name="status" defaultValue={cycle?.status ?? "draft"}>
          {CYCLE_PHASES.map((p) => (
            <option key={p} value={p}>
              {PHASE_LABEL[p]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end border-t border-slate-100 pt-4">
        <SubmitButton>{cycle ? "Save changes" : "Create cycle"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
