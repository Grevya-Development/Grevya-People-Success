import Link from "next/link";
import { Award, Check, ClipboardList, Lock, Target } from "lucide-react";
import { Card, CardBody, CardHeader, EmptyState, Field, PageHeader, StatusBadge, Textarea, WidgetCard } from "@/components/ui";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { saveSelfReview } from "../actions";
import { CategoryBadge, GoalProgress, PersonCell, Stars } from "../_components/display";
import { IntentSubmit } from "../_components/intent-submit";
import { StarRatingInput } from "../_components/star-rating";
import { PERF_THEME, PERSON_COLS, RATING_LABEL, fmtRating, type Goal, type Person } from "../_components/shared";
import { ResultForm } from "../_components/result-form";

export const metadata = { title: "My Reviews" };

type ReviewRow = {
  id: string;
  cycle_id: string;
  status: string;
  self_rating: number | null;
  self_comments: string | null;
  self_strengths: string | null;
  self_improvements: string | null;
  manager_rating: number | null;
  manager_comments: string | null;
  final_rating: number | null;
  self_submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  cycle: { id: string; name: string; status: string; start_date: string; end_date: string } | null;
  reviewer: Person | null;
};

export default async function MyReviewsPage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from("reviews")
    .select(`*, cycle:review_cycles!cycle_id(id, name, status, start_date, end_date), reviewer:employees!reviewer_id(${PERSON_COLS})`)
    .eq("employee_id", me.id);
  const reviews = ((data ?? []) as unknown as ReviewRow[]).sort((a, b) => (b.cycle?.start_date ?? "").localeCompare(a.cycle?.start_date ?? ""));
  const review = reviews.find((r) => r.cycle_id === sp.cycle) ?? reviews.find((r) => r.status !== "completed" && r.cycle?.status !== "closed") ?? reviews[0];

  const { data: goalData } = review
    ? await supabase.from("goals").select("*").eq("employee_id", me.id).eq("cycle_id", review.cycle_id).in("status", ["approved", "completed", "pending_approval"]).order("weightage", { ascending: false })
    : { data: [] };
  const goals = (goalData ?? []) as Goal[];

  return (
    <div>
      <PageHeader
        title="My Reviews"
        description="Your self-assessment and performance review for each cycle."
        breadcrumbs={[{ label: "Performance", href: "/performance" }, { label: "Reviews" }, { label: "My Reviews" }]}
      />

      {!review ? (
        <Card>
          <EmptyState icon={ClipboardList} title="No reviews yet" description="When HR launches a review cycle, your self-assessment will appear here." />
        </Card>
      ) : (
        <>
          {reviews.length > 1 && (
            <div className="mb-5 flex gap-2 overflow-x-auto pb-1 thin-scroll">
              {reviews.map((r) => (
                <Link
                  key={r.id}
                  href={`/performance/reviews?cycle=${r.cycle_id}`}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset",
                    r.id === review.id ? cn(PERF_THEME.pill, PERF_THEME.text, "ring-transparent") : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                  )}
                >
                  {r.cycle?.name}
                  {r.status === "completed" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                </Link>
              ))}
            </div>
          )}
          <ReviewView review={review} goals={goals} />
        </>
      )}
    </div>
  );
}

function ReviewView({ review: r, goals }: { review: ReviewRow; goals: Goal[] }) {
  const closed = r.cycle?.status === "closed";
  const editable = r.status === "pending_self" && !closed;
  const steps = [
    { key: "pending_self", label: "Self-assessment", at: r.self_submitted_at },
    { key: "pending_manager", label: "Manager review", at: r.completed_at },
    { key: "completed", label: "Completed", at: r.completed_at },
  ];
  const current = steps.findIndex((s) => s.key === r.status);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <Card>
          <CardBody>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">{r.cycle?.name}</h2>
                <p className="text-xs text-slate-500">
                  {formatDate(r.cycle?.start_date)} – {formatDate(r.cycle?.end_date)}
                </p>
              </div>
              <StatusBadge status={r.status} label={r.status === "pending_self" ? "Self-assessment due" : r.status === "pending_manager" ? "With manager" : "Completed"} />
            </div>
            <ol className="mt-5 grid grid-cols-3 gap-2">
              {steps.map((s, i) => {
                const done = i < current || r.status === "completed";
                const active = i === current && r.status !== "completed";
                return (
                  <li key={s.key} className="flex flex-col items-center text-center">
                    <div className="flex w-full items-center">
                      <span className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : done || active ? PERF_THEME.solid : "bg-slate-200")} />
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          done ? "bg-emerald-500 text-white" : active ? cn(PERF_THEME.solid, "text-white ring-4 ring-[#d9e7f5]") : "bg-slate-100 text-slate-400",
                        )}
                      >
                        {done ? <Check className="h-4 w-4" /> : i + 1}
                      </span>
                      <span className={cn("h-0.5 flex-1", i === steps.length - 1 ? "bg-transparent" : done ? PERF_THEME.solid : "bg-slate-200")} />
                    </div>
                    <span className={cn("mt-2 text-xs font-medium", active ? PERF_THEME.text : done ? "text-slate-700" : "text-slate-400")}>{s.label}</span>
                    {s.key === "pending_self" && r.self_submitted_at && <span className="text-[11px] text-slate-400">{formatDate(r.self_submitted_at)}</span>}
                    {s.key === "completed" && r.completed_at && <span className="text-[11px] text-slate-400">{formatDate(r.completed_at)}</span>}
                  </li>
                );
              })}
            </ol>
          </CardBody>
        </Card>

        {r.status === "completed" && (
          <WidgetCard title="Final outcome" color={PERF_THEME.solid}>
            <div className="grid gap-4 sm:grid-cols-3">
              <RatingTile label="Final rating" value={r.final_rating} highlight />
              <RatingTile label="Manager rating" value={r.manager_rating} />
              <RatingTile label="Self rating" value={r.self_rating} />
            </div>
            {r.manager_comments && (
              <div className="mt-4 rounded-lg bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Manager comments</p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{r.manager_comments}</p>
              </div>
            )}
          </WidgetCard>
        )}

        <Card>
          <CardHeader
            title="Self-assessment"
            description={
              editable
                ? "Save as often as you like — your manager only sees it after you submit."
                : r.self_submitted_at
                  ? `Submitted ${formatDateTime(r.self_submitted_at)}`
                  : closed
                    ? "The cycle closed before a self-assessment was submitted."
                    : undefined
            }
            action={!editable ? <Lock className="h-4 w-4 text-slate-400" /> : undefined}
          />
          <CardBody>
            {editable ? (
              <ResultForm action={saveSelfReview} className="space-y-5">
                <input type="hidden" name="id" value={r.id} />
                <Field label="Overall self rating" required>
                  <StarRatingInput name="self_rating" defaultValue={r.self_rating} label="Overall self rating" />
                </Field>
                <Field label="Overall comments" required hint="Summarise your contribution this cycle, referring to your goals.">
                  <Textarea name="self_comments" rows={5} maxLength={4000} defaultValue={r.self_comments ?? ""} />
                </Field>
                <Field label="Strengths">
                  <Textarea name="self_strengths" rows={3} maxLength={4000} defaultValue={r.self_strengths ?? ""} placeholder="What went well? Where did you add the most value?" />
                </Field>
                <Field label="Areas to improve">
                  <Textarea name="self_improvements" rows={3} maxLength={4000} defaultValue={r.self_improvements ?? ""} placeholder="What would you like to develop next cycle?" />
                </Field>
                <div className="border-t border-slate-100 pt-4">
                  <IntentSubmit
                    options={[
                      { value: "save", label: "Save draft", variant: "outline" },
                      { value: "submit", label: "Submit to manager" },
                    ]}
                  />
                </div>
              </ResultForm>
            ) : (
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Self rating</dt>
                  <dd className="mt-1 flex items-center gap-2">
                    <Stars value={r.self_rating} size="md" />
                    <span className="text-slate-600">{r.self_rating ? `${fmtRating(r.self_rating)} · ${RATING_LABEL[Math.round(Number(r.self_rating))]}` : "Not rated"}</span>
                  </dd>
                </div>
                <TextBlock label="Overall comments" value={r.self_comments} />
                <TextBlock label="Strengths" value={r.self_strengths} />
                <TextBlock label="Areas to improve" value={r.self_improvements} />
              </dl>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Reviewer" />
          <CardBody>{r.reviewer ? <PersonCell person={r.reviewer} /> : <p className="text-sm text-slate-500">HR will review this cycle.</p>}</CardBody>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader
            title="My goals this cycle"
            description="For reference while you write your assessment."
            action={
              <Link href={`/performance/goals?cycle=${r.cycle_id}`} className={cn("text-xs font-medium hover:underline", PERF_THEME.text)}>
                Open
              </Link>
            }
          />
          {goals.length === 0 ? (
            <EmptyState icon={Target} title="No goals in this cycle" className="py-8" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {goals.map((g) => (
                <li key={g.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/performance/goals/${g.id}`} className="text-sm font-medium text-slate-800 hover:text-primary-600">
                      {g.title}
                    </Link>
                    <span className="shrink-0 text-xs text-slate-500">{+Number(g.weightage).toFixed(2)}%</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <CategoryBadge category={g.category} />
                    <StatusBadge status={g.status} />
                  </div>
                  <GoalProgress value={g.progress} className="mt-2" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function RatingTile({ label, value, highlight }: { label: string; value: number | null; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl p-4", highlight ? cn(PERF_THEME.pill) : "bg-slate-50")}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {highlight && <Award className={cn("h-3.5 w-3.5", PERF_THEME.text)} />}
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-semibold", highlight ? PERF_THEME.text : "text-slate-800")}>{fmtRating(value)}</p>
      <Stars value={value} />
      {value ? <p className="mt-1 text-xs text-slate-500">{RATING_LABEL[Math.round(Number(value))]}</p> : null}
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={cn("mt-1 whitespace-pre-line", value ? "text-slate-700" : "text-slate-400")}>{value || "—"}</dd>
    </div>
  );
}
