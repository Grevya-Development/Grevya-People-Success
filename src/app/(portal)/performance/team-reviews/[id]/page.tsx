import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Award, Hourglass, Target } from "lucide-react";
import { Avatar, Card, CardBody, CardHeader, EmptyState, Field, PageHeader, StatusBadge, Textarea, WidgetCard } from "@/components/ui";
import { ActionForm } from "@/components/ui/action-form";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { saveManagerReview } from "../../actions";
import { CategoryBadge, GoalProgress, Stars } from "../../_components/display";
import { IntentSubmit } from "../../_components/intent-submit";
import { StarRatingInput } from "../../_components/star-rating";
import { PERF_THEME, PERSON_COLS, RATING_LABEL, averageProgress, fmtRating, type Goal, type Person } from "../../_components/shared";

export const metadata = { title: "Team review" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Review = {
  id: string;
  employee_id: string;
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
  employee: (Person & { designation: { title: string } | null; department: { name: string } | null }) | null;
  reviewer: { id: string; full_name: string | null } | null;
  cycle: { id: string; name: string; status: string; start_date: string; end_date: string } | null;
};

export default async function TeamReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const me = await requireManager();
  const supabase = await createClient();

  const { data } = await supabase
    .from("reviews")
    .select(
      `*, employee:employees!employee_id(${PERSON_COLS}, designation:designations(title), department:departments(name)), reviewer:employees!reviewer_id(id, full_name), cycle:review_cycles!cycle_id(id, name, status, start_date, end_date)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const r = data as unknown as Review;
  if (r.employee_id === me.id) redirect(`/performance/reviews?cycle=${r.cycle_id}`);
  const { data: allowed } = await supabase.rpc("can_approve_for", { emp: r.employee_id });
  if (!allowed) notFound();

  const { data: goalData } = await supabase
    .from("goals")
    .select("*")
    .eq("employee_id", r.employee_id)
    .eq("cycle_id", r.cycle_id)
    .in("status", ["approved", "completed", "pending_approval"])
    .order("weightage", { ascending: false });
  const goals = (goalData ?? []) as Goal[];

  const closed = r.cycle?.status === "closed";
  const canEdit = r.status !== "completed" && (!closed || me.isHR);
  const selfSubmitted = r.status !== "pending_self";

  return (
    <div>
      <PageHeader
        title={`Review · ${r.employee?.full_name ?? "Employee"}`}
        description={r.cycle ? `${r.cycle.name} · ${formatDate(r.cycle.start_date)} – ${formatDate(r.cycle.end_date)}` : undefined}
        breadcrumbs={[
          { label: "Performance", href: "/performance" },
          { label: "My Team Reviews", href: `/performance/team-reviews?cycle=${r.cycle_id}` },
          { label: r.employee?.full_name ?? "Review" },
        ]}
        actions={<StatusBadge status={r.status} />}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Self-assessment" description={r.self_submitted_at ? `Submitted ${formatDateTime(r.self_submitted_at)}` : undefined} />
            <CardBody>
              {!selfSubmitted ? (
                <EmptyState
                  icon={Hourglass}
                  title="Self-assessment not submitted yet"
                  description={`${r.employee?.full_name ?? "The employee"} hasn't submitted their self-assessment. You can draft your feedback now and complete the review once it's in.`}
                  className="py-8"
                />
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
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextBlock label="Strengths" value={r.self_strengths} />
                    <TextBlock label="Areas to improve" value={r.self_improvements} />
                  </div>
                </dl>
              )}
            </CardBody>
          </Card>

          {r.status === "completed" ? (
            <WidgetCard title="Review outcome" color={PERF_THEME.solid}>
              <div className="grid gap-4 sm:grid-cols-3">
                <Tile label="Final rating" value={r.final_rating} highlight />
                <Tile label="Manager rating" value={r.manager_rating} />
                <Tile label="Self rating" value={r.self_rating} />
              </div>
              {r.manager_comments && (
                <div className="mt-4 rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Manager comments</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{r.manager_comments}</p>
                </div>
              )}
              <p className="mt-3 text-xs text-slate-500">
                Completed {formatDateTime(r.completed_at)}
                {r.reviewer?.full_name ? ` by ${r.reviewer.id === me.id ? "you" : r.reviewer.full_name}` : ""}
              </p>
            </WidgetCard>
          ) : canEdit ? (
            <Card className="overflow-hidden">
              <div className={cn("px-5 py-3 text-sm font-semibold text-white", PERF_THEME.solid)}>Manager assessment</div>
              <CardBody>
                <ActionForm action={saveManagerReview} resetOnSuccess={false} className="space-y-5">
                  <input type="hidden" name="id" value={r.id} />
                  <Field label="Manager rating" required>
                    <StarRatingInput name="manager_rating" defaultValue={r.manager_rating} label="Manager rating" />
                  </Field>
                  <Field label="Comments" required hint="Specific, balanced feedback on achievements, behaviours and growth areas.">
                    <Textarea name="manager_comments" rows={6} maxLength={4000} defaultValue={r.manager_comments ?? ""} />
                  </Field>
                  <Field label="Final rating" required hint="The calibrated rating shared with the employee.">
                    <StarRatingInput name="final_rating" defaultValue={r.final_rating} label="Final rating" />
                  </Field>
                  <div className="border-t border-slate-100 pt-4">
                    <IntentSubmit
                      options={[
                        { value: "save", label: "Save draft", variant: "outline" },
                        { value: "complete", label: "Complete review", variant: "success", disabled: !selfSubmitted },
                      ]}
                    />
                    {!selfSubmitted && <p className="mt-2 text-right text-xs text-slate-500">You can complete the review after the self-assessment is submitted.</p>}
                  </div>
                </ActionForm>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <EmptyState title="This review cycle is closed" description="Only HR can update reviews after a cycle closes." className="py-8" />
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardBody className="flex items-center gap-3">
              <Avatar name={r.employee?.full_name} src={r.employee?.avatar_url} size="lg" />
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">{r.employee?.full_name}</p>
                <p className="text-xs text-slate-500">{r.employee?.employee_code}</p>
                <p className="text-xs text-slate-500">{[r.employee?.designation?.title, r.employee?.department?.name].filter(Boolean).join(" · ")}</p>
              </div>
            </CardBody>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Goals this cycle" description={goals.length ? `Average progress ${averageProgress(goals)}%` : undefined} />
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
    </div>
  );
}

function Tile({ label, value, highlight }: { label: string; value: number | null; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl p-4", highlight ? PERF_THEME.pill : "bg-slate-50")}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {highlight && <Award className={cn("h-3.5 w-3.5", PERF_THEME.text)} />}
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-semibold", highlight ? PERF_THEME.text : "text-slate-800")}>{fmtRating(value)}</p>
      <Stars value={value} />
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
