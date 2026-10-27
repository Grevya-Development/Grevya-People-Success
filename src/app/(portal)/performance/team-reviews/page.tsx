import Link from "next/link";
import { CalendarClock, ClipboardList } from "lucide-react";
import { Card, EmptyState, PageHeader, StatCard, StatusBadge, TBody, TD, TH, THead, TR, Table, buttonClass } from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";
import { CycleSelect } from "../_components/cycle-select";
import { PersonCell, Stars } from "../_components/display";
import { loadTeam } from "../_components/data";
import { PERF_THEME, PERSON_COLS, fmtRating, pickCycle, type Cycle, type Person } from "../_components/shared";

export const metadata = { title: "My Team Reviews" };

type Row = {
  id: string;
  employee_id: string;
  status: string;
  self_rating: number | null;
  manager_rating: number | null;
  final_rating: number | null;
  self_submitted_at: string | null;
  completed_at: string | null;
  employee: (Person & { designation: { title: string } | null }) | null;
  reviewer: { id: string; full_name: string | null } | null;
};

const ORDER: Record<string, number> = { pending_manager: 0, pending_self: 1, completed: 2 };
const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending_manager", label: "Awaiting my review" },
  { key: "pending_self", label: "Self-assessment due" },
  { key: "completed", label: "Completed" },
];

export default async function TeamReviewsPage({ searchParams }: { searchParams: Promise<{ cycle?: string; scope?: string; status?: string }> }) {
  const me = await requireManager();
  const sp = await searchParams;
  const scope = me.isHR && sp.scope === "all" ? "all" : "team";
  const filter = FILTERS.some((f) => f.key === sp.status) ? sp.status! : "all";
  const supabase = await createClient();

  const [{ data: cycleData }, team] = await Promise.all([
    supabase.from("review_cycles").select("*").neq("status", "draft").order("start_date", { ascending: false }),
    loadTeam(supabase, me, scope),
  ]);
  const cycles = (cycleData ?? []) as Cycle[];
  const cycle = pickCycle(cycles, sp.cycle);
  const ids = team.map((t) => t.id);

  let rows: Row[] = [];
  if (cycle && (scope === "all" || ids.length)) {
    let q = supabase
      .from("reviews")
      .select(
        `id, employee_id, status, self_rating, manager_rating, final_rating, self_submitted_at, completed_at, employee:employees!employee_id(${PERSON_COLS}, designation:designations(title)), reviewer:employees!reviewer_id(id, full_name)`,
      )
      .eq("cycle_id", cycle.id)
      .neq("employee_id", me.id);
    if (scope === "team") q = q.in("employee_id", ids);
    const { data } = await q;
    rows = ((data ?? []) as unknown as Row[]).sort(
      (a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || (a.employee?.full_name ?? "").localeCompare(b.employee?.full_name ?? ""),
    );
  }
  const counts = {
    pending_manager: rows.filter((r) => r.status === "pending_manager").length,
    pending_self: rows.filter((r) => r.status === "pending_self").length,
    completed: rows.filter((r) => r.status === "completed").length,
  };
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(cycle ? { cycle: cycle.id } : {}), ...(scope === "all" ? { scope } : {}), ...extra });
    return `/performance/team-reviews?${p.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="My Team Reviews"
        description={cycle ? `${cycle.name} · ${formatDate(cycle.start_date)} – ${formatDate(cycle.end_date)}` : undefined}
        breadcrumbs={[{ label: "Performance", href: "/performance" }, { label: "Reviews" }, { label: "My Team Reviews" }]}
        actions={<CycleSelect cycles={cycles} value={cycle?.id ?? null} />}
      />

      {me.isHR && (
        <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm">
          {(["team", "all"] as const).map((s) => (
            <Link
              key={s}
              href={`/performance/team-reviews?${new URLSearchParams({ ...(cycle ? { cycle: cycle.id } : {}), scope: s }).toString()}`}
              className={cn("rounded-md px-3 py-1.5 font-medium", scope === s ? cn(PERF_THEME.pill, PERF_THEME.text) : "text-slate-500 hover:text-slate-800")}
            >
              {s === "team" ? "My reporting line" : "All employees"}
            </Link>
          ))}
        </div>
      )}

      {!cycle ? (
        <Card>
          <EmptyState icon={CalendarClock} title="No review cycles yet" description="Reviews appear once HR launches a review cycle." />
        </Card>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Awaiting my review" value={counts.pending_manager} tone="bg-amber-50 text-amber-600" />
            <StatCard label="Self-assessment due" value={counts.pending_self} tone="bg-slate-100 text-slate-600" />
            <StatCard label="Completed" value={counts.completed} hint={rows.length ? `${Math.round((counts.completed / rows.length) * 100)}% of ${rows.length}` : undefined} />
          </div>

          <Card className="overflow-hidden">
            <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-2 thin-scroll">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={qs(f.key === "all" ? {} : { status: f.key })}
                  className={cn(
                    "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
                    filter === f.key ? "border-[#4a8ad0] text-[#2f6aa8]" : "border-transparent text-slate-500 hover:text-slate-800",
                  )}
                >
                  {f.label}
                </Link>
              ))}
            </div>
            {shown.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title={rows.length === 0 ? "No team reviews in this cycle" : "Nothing here"}
                description={rows.length === 0 ? "HR launches reviews for everyone in the cycle. Check back once they're launched." : undefined}
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Employee</TH>
                    <TH>Status</TH>
                    <TH>Self</TH>
                    <TH>Manager</TH>
                    <TH>Final</TH>
                    <TH>Reviewer</TH>
                    <TH className="text-right">Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {shown.map((r) => (
                    <TR key={r.id}>
                      <TD className="min-w-52">
                        <PersonCell person={r.employee} sub={r.employee?.designation?.title} />
                      </TD>
                      <TD>
                        <StatusBadge status={r.status} />
                        {r.self_submitted_at && r.status === "pending_manager" && <p className="mt-1 text-[11px] text-slate-400">Submitted {formatDate(r.self_submitted_at)}</p>}
                      </TD>
                      <TD>
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <Stars value={r.self_rating} /> <span className="text-xs text-slate-500">{fmtRating(r.self_rating)}</span>
                        </span>
                      </TD>
                      <TD className="text-sm">{fmtRating(r.manager_rating)}</TD>
                      <TD className="text-sm font-semibold">{fmtRating(r.final_rating)}</TD>
                      <TD className="whitespace-nowrap text-xs text-slate-500">{r.reviewer?.id === me.id ? "You" : (r.reviewer?.full_name ?? "—")}</TD>
                      <TD className="text-right">
                        <Link
                          href={`/performance/team-reviews/${r.id}`}
                          className={buttonClass(r.status === "pending_manager" ? "primary" : "outline", "sm")}
                        >
                          {r.status === "pending_manager" ? "Review" : "Open"}
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
