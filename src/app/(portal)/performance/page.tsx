import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Flag,
  GitBranch,
  PlusCircle,
  Settings2,
  Star,
  Target,
  Users,
} from "lucide-react";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, ProgressRing, StatusBadge, WidgetCard, buttonClass } from "@/components/ui";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, orgToday } from "@/lib/utils";
import { CategoryBadge, GoalProgress, Stars } from "./_components/display";
import { loadTeam } from "./_components/data";
import { PERF_THEME, PHASE_LABEL, RATING_LABEL, averageProgress, defaultCycle, fmtRating, weightageTotal, type Cycle, type Goal } from "./_components/shared";

export const metadata = { title: "Performance Home" };

const PHASE_MESSAGE: Record<string, string> = {
  draft: "This cycle is being prepared by HR.",
  goal_setting: "Goal setting is open — define your goals and send them for approval.",
  in_review: "Reviews are in progress — complete your self-assessment and keep goal progress up to date.",
  closed: "This cycle is closed. Ratings are final.",
};

export default async function PerformanceHomePage() {
  const me = await requireEmployee();
  const supabase = await createClient();

  const { data: cycleData } = await supabase.from("review_cycles").select("*").neq("status", "draft").order("start_date", { ascending: false });
  const cycle = defaultCycle((cycleData ?? []) as Cycle[]);

  const [{ data: goalData }, { data: review }, team] = await Promise.all([
    cycle
      ? supabase.from("goals").select("*").eq("employee_id", me.id).eq("cycle_id", cycle.id).order("weightage", { ascending: false })
      : Promise.resolve({ data: [] as Goal[] }),
    cycle
      ? supabase
          .from("reviews")
          .select("id, status, final_rating, self_submitted_at, completed_at")
          .eq("employee_id", me.id)
          .eq("cycle_id", cycle.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    me.isManager ? loadTeam(supabase, me) : Promise.resolve([]),
  ]);
  const goals = (goalData ?? []) as Goal[];
  const live = goals.filter((g) => g.status !== "rejected");
  const total = weightageTotal(goals);
  const avg = averageProgress(goals);

  let teamPendingGoals = 0;
  let teamPendingReviews = 0;
  let teamReviewsTotal = 0;
  const teamIds = team.map((t) => t.id);
  if (teamIds.length) {
    const [g, r, rt] = await Promise.all([
      supabase.from("goals").select("id", { count: "exact", head: true }).in("employee_id", teamIds).neq("employee_id", me.id).eq("status", "pending_approval"),
      cycle
        ? supabase.from("reviews").select("id", { count: "exact", head: true }).in("employee_id", teamIds).neq("employee_id", me.id).eq("cycle_id", cycle.id).eq("status", "pending_manager")
        : Promise.resolve({ count: 0 }),
      cycle
        ? supabase.from("reviews").select("id", { count: "exact", head: true }).in("employee_id", teamIds).neq("employee_id", me.id).eq("cycle_id", cycle.id)
        : Promise.resolve({ count: 0 }),
    ]);
    teamPendingGoals = g.count ?? 0;
    teamPendingReviews = r.count ?? 0;
    teamReviewsTotal = rt.count ?? 0;
  }

  const today = orgToday();
  const daysLeft = cycle ? Math.ceil((Date.parse(cycle.end_date) - Date.parse(today)) / 86_400_000) : 0;

  const quickLinks = [
    { href: "/performance/goals/new", label: "Create new Goal", icon: PlusCircle },
    { href: "/performance/goals", label: "My Goals", icon: Target },
    { href: "/performance/objective-tree", label: "Objective Tree", icon: GitBranch },
    { href: "/performance/reviews", label: "My Reviews", icon: ClipboardList },
    ...(me.isManager
      ? [
          { href: "/performance/team-goals", label: "My Team Goals", icon: Users },
          { href: "/performance/team-reviews", label: "My Team Reviews", icon: ClipboardCheck },
        ]
      : []),
    ...(me.isHR ? [{ href: "/performance/admin", label: "Review Cycles", icon: Settings2 }] : []),
  ];

  return (
    <div>
      <PageHeader title="Performance Home" breadcrumbs={[{ label: "Performance" }, { label: "Performance Home" }]} />

      {/* Active cycle banner */}
      {cycle ? (
        <div className={cn("mb-6 overflow-hidden rounded-xl border border-[#c5dbf0] shadow-[0_1px_3px_rgba(15,23,42,0.05)]", PERF_THEME.pill)}>
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white", PERF_THEME.solid)}>
                <CalendarRange className="h-6 w-6" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-800">{cycle.name}</h2>
                  <StatusBadge status={cycle.status} label={PHASE_LABEL[cycle.status]} />
                </div>
                <p className="mt-0.5 text-sm text-slate-600">
                  {formatDate(cycle.start_date)} – {formatDate(cycle.end_date)}
                  {cycle.status !== "closed" && daysLeft >= 0 && <> · {daysLeft} day{daysLeft === 1 ? "" : "s"} left</>}
                </p>
                <p className={cn("mt-1 text-sm", PERF_THEME.text)}>{PHASE_MESSAGE[cycle.status]}</p>
              </div>
            </div>
            <PhaseTrack status={cycle.status} />
          </div>
        </div>
      ) : (
        <Card className="mb-6">
          <EmptyState icon={CalendarRange} title="No active review cycle" description="HR hasn't opened a review cycle yet. You can still explore organisation objectives." />
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* My goals */}
        <WidgetCard
          title="My Goals"
          color={PERF_THEME.solid}
          className="lg:col-span-2"
          action={
            <Link href="/performance/goals" className="text-xs font-medium text-white/90 hover:text-white">
              View all
            </Link>
          }
        >
          {!cycle ? (
            <EmptyState icon={Target} title="Goals open with the next cycle" className="py-8" />
          ) : live.length === 0 ? (
            <EmptyState
              icon={Target}
              title="You haven't set any goals for this cycle"
              description="Goals keep you and your manager aligned on what matters."
              action={
                cycle.status !== "closed" ? (
                  <Link href={`/performance/goals/new?cycle=${cycle.id}`} className={buttonClass("primary")}>
                    Create new Goal
                  </Link>
                ) : undefined
              }
              className="py-8"
            />
          ) : (
            <div className="flex flex-col gap-5 md:flex-row">
              <div className="flex shrink-0 flex-row items-center gap-5 md:w-48 md:flex-col md:items-start">
                <ProgressRing value={avg} size={104} stroke={9} color={PERF_THEME.hex}>
                  <div className="text-center">
                    <p className="text-xl font-semibold text-slate-800">{avg}%</p>
                    <p className="text-[10px] text-slate-500">avg progress</p>
                  </div>
                </ProgressRing>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex gap-2">
                    <dt className="text-slate-500">Goals</dt>
                    <dd className="font-semibold text-slate-800">{live.length}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-slate-500">Weightage</dt>
                    <dd className={cn("font-semibold", total === 100 ? "text-emerald-600" : "text-amber-600")}>{+total.toFixed(2)}% / 100%</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-slate-500">Pending</dt>
                    <dd className="font-semibold text-slate-800">{goals.filter((g) => g.status === "pending_approval").length}</dd>
                  </div>
                </dl>
              </div>
              <div className="min-w-0 flex-1">
                {total !== 100 && (
                  <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Your goal weightage totals {+total.toFixed(2)}% — it should be exactly 100%.
                  </p>
                )}
                <ul className="divide-y divide-slate-100">
                  {live.slice(0, 5).map((g) => (
                    <li key={g.id} className="py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/performance/goals/${g.id}`} className="min-w-0 truncate text-sm font-medium text-slate-800 hover:text-primary-600">
                          {g.title}
                        </Link>
                        <StatusBadge status={g.status} />
                      </div>
                      <div className="mt-1 flex items-center gap-3">
                        <CategoryBadge category={g.category} />
                        <span className="text-xs text-slate-500">{+Number(g.weightage).toFixed(2)}%</span>
                        <GoalProgress value={g.progress} className="flex-1" />
                      </div>
                    </li>
                  ))}
                </ul>
                {live.length > 5 && <p className="mt-1 text-xs text-slate-500">+{live.length - 5} more</p>}
              </div>
            </div>
          )}
        </WidgetCard>

        {/* My review */}
        <WidgetCard title="My Review" color="bg-[#2f6aa8]">
          {!cycle || !review ? (
            <EmptyState icon={ClipboardList} title="No review launched" description={cycle ? "HR hasn't launched reviews for this cycle yet." : undefined} className="py-8" />
          ) : review.status === "pending_self" ? (
            <div className="space-y-4">
              <StatusBadge status="pending_self" label="Self-assessment due" />
              <p className="text-sm text-slate-600">Reflect on your goals and rate your performance for {cycle.name}.</p>
              <Link href={`/performance/reviews?cycle=${cycle.id}`} className={buttonClass("primary", "md", "w-full")}>
                Start self-assessment <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : review.status === "pending_manager" ? (
            <div className="space-y-4">
              <StatusBadge status="pending_manager" label="With your manager" />
              <p className="text-sm text-slate-600">
                Submitted {formatDate(review.self_submitted_at)}. {me.manager ? `${me.manager.full_name} will complete your review.` : "HR will complete your review."}
              </p>
              <Link href={`/performance/reviews?cycle=${cycle.id}`} className={buttonClass("outline", "md", "w-full")}>
                View my submission
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <StatusBadge status="completed" />
              <div className="flex items-center gap-3">
                <span className={cn("text-4xl font-semibold", PERF_THEME.text)}>{fmtRating(review.final_rating)}</span>
                <div>
                  <Stars value={review.final_rating} size="md" />
                  <p className="text-xs text-slate-500">{review.final_rating ? RATING_LABEL[Math.round(Number(review.final_rating))] : ""}</p>
                </div>
              </div>
              <Link href={`/performance/reviews?cycle=${cycle.id}`} className={buttonClass("outline", "md", "w-full")}>
                <Star className="h-4 w-4" /> See full review
              </Link>
            </div>
          )}
        </WidgetCard>

        {/* Team snapshot */}
        {me.isManager && (
          <Card className="lg:col-span-2">
            <CardHeader title="Team snapshot" description={`${team.length} people in your reporting line`} />
            <CardBody>
              {team.length === 0 ? (
                <p className="text-sm text-slate-500">No one reports to you yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <SnapshotTile
                    href="/performance/team-goals"
                    label="Goals awaiting approval"
                    value={teamPendingGoals}
                    icon={Flag}
                    tone={teamPendingGoals ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"}
                  />
                  <SnapshotTile
                    href="/performance/team-reviews?status=pending_manager"
                    label="Reviews awaiting you"
                    value={teamPendingReviews}
                    icon={ClipboardCheck}
                    tone={teamPendingReviews ? "bg-violet-50 text-violet-700" : "bg-slate-50 text-slate-600"}
                  />
                  <SnapshotTile href="/performance/team-reviews" label="Team reviews this cycle" value={teamReviewsTotal} icon={Users} tone={cn(PERF_THEME.pill, PERF_THEME.text)} />
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {/* Quick links */}
        <Card className={cn(!me.isManager && "lg:col-span-3")}>
          <CardHeader title="Quick links" />
          <CardBody className="flex flex-wrap gap-2">
            {quickLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn("inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors", PERF_THEME.pill, PERF_THEME.text, "hover:bg-[#c5dbf0]")}
              >
                <l.icon className="h-4 w-4" />
                {l.label}
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function PhaseTrack({ status }: { status: string }) {
  const phases = ["goal_setting", "in_review", "closed"];
  const idx = phases.indexOf(status);
  return (
    <ol className="flex items-center gap-1.5 text-[11px] font-medium">
      {phases.map((p, i) => (
        <li key={p} className="flex items-center gap-1.5">
          <span className={cn("rounded-full px-2.5 py-1", i === idx ? cn(PERF_THEME.solid, "text-white") : i < idx ? "bg-white text-[#2f6aa8]" : "bg-white/60 text-slate-400")}>
            {PHASE_LABEL[p]}
          </span>
          {i < phases.length - 1 && <span className="h-px w-3 bg-[#a9c8e8]" />}
        </li>
      ))}
    </ol>
  );
}

function SnapshotTile({ href, label, value, icon: Icon, tone }: { href: string; label: string; value: number; icon: typeof Flag; tone: string }) {
  return (
    <Link href={href} className={cn("group flex items-center justify-between rounded-xl p-4 transition-shadow hover:shadow-md", tone)}>
      <div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs opacity-80">{label}</p>
      </div>
      <Icon className="h-6 w-6 opacity-60 transition-transform group-hover:scale-110" />
    </Link>
  );
}
