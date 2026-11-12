import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Briefcase,
  CalendarCheck,
  ChevronRight,
  ClipboardCheck,
  Megaphone,
  Palmtree,
  ReceiptIndianRupee,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { requireHR } from "@/lib/auth";
import { cn, formatDate } from "@/lib/utils";
import { Avatar, Card, CardHeader, buttonClass } from "@/components/ui";
import { loadDashboard, type PersonRow } from "./_lib/dashboard";
import { Donut, HBars, HeadcountTrend, PayrollArea, SegmentBar, StackedBars } from "./_components/charts";

export const metadata = { title: "Admin Dashboard" };

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const me = await requireHR();
  const sp = await searchParams;
  const d = await loadDashboard(me.id);
  const k = d.kpi;
  const attendancePct = k.workforce ? Math.round((k.present / k.workforce) * 100) : 0;

  return (
    <div className="space-y-6">
      {sp.denied && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">You don&apos;t have access to that page.</div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">{me.isSuperAdmin ? "Super admin" : "HR admin"} console</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Organisation dashboard</h1>
          <p className="mt-0.5 text-sm text-slate-500">{formatDate(d.today, "EEEE, dd MMMM yyyy")} · live figures for everyone at Grevya</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/hris/employees/new" className={buttonClass("primary", "sm")}>
            <UserPlus className="h-4 w-4" /> Add employee
          </Link>
          <Link href="/payroll/admin" className={buttonClass("outline", "sm")}>
            <ReceiptIndianRupee className="h-4 w-4" /> Payroll
          </Link>
          <Link href="/admin/announcements" className={buttonClass("outline", "sm")}>
            <Megaphone className="h-4 w-4" /> Announce
          </Link>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi href="/hris/employees" icon={Users} tone="bg-indigo-50 text-indigo-600" label="Headcount" value={k.headcount} hint={`${k.onNotice} on notice period`} />
        <Kpi
          href="/hris/onboarding"
          icon={UserPlus}
          tone="bg-emerald-50 text-emerald-600"
          label="Joined this month"
          value={k.joinedThisMonth}
          hint={k.upcomingJoiners ? `${k.upcomingJoiners} joining soon` : "No upcoming joiners"}
        />
        <Kpi href="/exit/approvals" icon={UserMinus} tone="bg-rose-50 text-rose-600" label="Attrition (12 months)" value={`${k.attrition}%`} hint={`${k.exits12} ${k.exits12 === 1 ? "person" : "people"} left`} />
        <Kpi
          href="/attendance/team"
          icon={CalendarCheck}
          tone="bg-sky-50 text-sky-600"
          label="Present today"
          value={`${k.present}/${k.workforce}`}
          hint={d.dayNote ?? `${attendancePct}% · ${k.remote} remote`}
        />
        <Kpi href="/leave/approvals" icon={Palmtree} tone="bg-amber-50 text-amber-600" label="On leave today" value={k.onLeave} hint="Approved leave" />
        <Kpi
          href="#approvals"
          icon={ClipboardCheck}
          tone={k.approvalsTotal ? "bg-orange-50 text-orange-600" : "bg-slate-100 text-slate-500"}
          label="Waiting for approval"
          value={k.approvalsTotal}
          hint={k.approvalsTotal ? "Across all modules" : "All caught up"}
        />
      </div>

      {/* Headcount + today */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Headcount trend" description="Headcount at the end of each month, with people who joined and left" href="/hris/employees">
          <HeadcountTrend data={d.trend} />
        </Panel>
        <Panel title="Attendance today" description={d.dayNote ?? `${k.workforce} people expected at work`} href="/attendance/team">
          <Donut data={d.todaySlices} centerLabel="people" />
        </Panel>
      </div>

      {/* Workforce mix */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel title="By department" href="/admin/org">
          <HBars data={d.byDepartment} max={7} />
        </Panel>
        <Panel title="By location" href="/admin/org">
          <HBars data={d.byLocation} max={7} />
        </Panel>
        <Panel title="Gender">
          <Donut data={d.byGender} centerLabel="people" />
        </Panel>
        <Panel title="Employment type">
          <Donut data={d.byType} centerLabel="people" />
        </Panel>
      </div>

      {/* Approvals + people to act on */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card id="approvals" className="scroll-mt-24">
          <CardHeader title="Waiting for approval" description="Everything pending across the organisation" />
          <ul className="divide-y divide-slate-100">
            {d.approvals.map((a) => (
              <li key={a.label}>
                <Link href={a.href} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-slate-50">
                  <span className="flex-1 text-slate-600">{a.label}</span>
                  <span
                    className={cn(
                      "min-w-8 rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums",
                      a.count ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-400",
                    )}
                  >
                    {a.count}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <PeopleList
          title="Probation ending"
          description="Confirm or extend within 30 days"
          rows={d.probation}
          href="/hris/onboarding"
          empty="No probation reviews due"
          dateLabel={(r) => (r.tone === "warn" ? `Overdue · ${formatDate(r.date, "dd MMM")}` : formatDate(r.date, "dd MMM"))}
        />
        <PeopleList
          title="Onboarding in progress"
          description="New joiners with checklist tasks still open"
          rows={d.onboarding}
          href="/hris/onboarding"
          empty="No one is onboarding right now"
          dateLabel={(r) => `Joined ${formatDate(r.date, "dd MMM")}`}
        />
      </div>

      {/* Time off + money */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Leave taken by type" description="Approved leave days, last 6 months" href="/leave/approvals">
          <StackedBars data={d.leaveByType} unit=" days" empty="No approved leave in the last 6 months" />
        </Panel>
        <Panel title="Expense claims" description="Amount claimed each month, by status" href="/reimbursement/approvals">
          <StackedBars data={d.claimsByMonth} money empty="No claims in the last 6 months" />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Payroll cost" description="Published payslips, last 6 months" href="/payroll/admin">
          <PayrollArea data={d.payroll} />
        </Panel>
        <Panel title="Claims by category" description="Last 6 months, excluding rejected" href="/reimbursement/approvals">
          <HBars data={d.claimsByCategory} money empty="No claims yet" />
        </Panel>
      </div>

      {/* Talent */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Hiring pipeline"
          description={k.openJobs ? `${k.openJobs} open ${k.openJobs === 1 ? "job" : "jobs"} · ${k.openPositions} ${k.openPositions === 1 ? "position" : "positions"}` : "No open jobs"}
          href="/recruit/admin"
          icon={Briefcase}
        >
          <HBars data={d.pipeline} empty="No candidates for open jobs" />
        </Panel>
        <Panel
          title={d.cycle ? `Reviews · ${d.cycle.name}` : "Performance reviews"}
          description={d.cycle ? `${formatDate(d.cycle.start_date, "dd MMM")} – ${formatDate(d.cycle.end_date, "dd MMM yyyy")}` : "No review cycle is running"}
          href="/performance/admin"
        >
          {d.cycle ? (
            <SegmentBar data={d.reviews} empty="No reviews have been started in this cycle yet" />
          ) : (
            <EmptyHint text="Start a review cycle to track progress here." href="/performance/admin" cta="Review cycles" />
          )}
        </Panel>
        <Panel
          title="Learning"
          description={d.learningRate === null ? "No course enrolments yet" : `${d.learningRate}% of ${d.enrollments} enrolments completed`}
          href="/learning/admin"
        >
          {d.enrollments ? <SegmentBar data={d.learning} /> : <EmptyHint text="Assign courses to see completion here." href="/learning/admin" cta="Learning admin" />}
        </Panel>
      </div>

      {/* Moves */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PeopleList title="Recently joined" rows={d.recentJoiners} href="/hris/employees" empty="No one has joined yet" dateLabel={(r) => formatDate(r.date, "dd MMM yyyy")} />
        <PeopleList
          title="Joining soon"
          rows={d.upcomingJoiners}
          href="/hris/onboarding"
          empty="No upcoming joiners"
          dateLabel={(r) => formatDate(r.date, "dd MMM")}
        />
        <PeopleList
          title="Serving notice"
          rows={d.leaving}
          href="/exit/approvals"
          empty="No one is on notice period"
          dateLabel={(r) => (r.date ? `Last day ${formatDate(r.date, "dd MMM")}` : "")}
        />
        <Panel title="Exit reasons" description="Resignations, last 12 months" href="/exit/approvals">
          <HBars data={d.exitReasons} empty="No resignations in the last 12 months" />
        </Panel>
      </div>

      <PeopleList
        title="Birthdays & work anniversaries"
        description="Next 7 days"
        rows={d.celebrations}
        href="/directory"
        empty="Nothing to celebrate this week"
        dateLabel={(r) => (r.date === d.today ? "Today" : formatDate(r.date, "EEE, dd MMM"))}
        grid
      />
    </div>
  );
}

function Kpi({
  href,
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  href: string;
  icon: typeof Users;
  tone: string;
  label: string;
  value: ReactNode;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition hover:border-primary-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tone)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="mt-0.5 truncate text-xs text-slate-500" title={hint}>
        {hint}
      </p>
    </Link>
  );
}

function Panel({
  title,
  description,
  href,
  icon: Icon,
  className,
  children,
}: {
  title: string;
  description?: string;
  href?: string;
  icon?: typeof Users;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col", className)}>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-slate-400" />}
            {title}
          </span>
        }
        description={description}
        action={
          href ? (
            <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
              Open <ArrowRight className="h-3 w-3" />
            </Link>
          ) : undefined
        }
      />
      <div className="flex-1 px-5 py-4">{children}</div>
    </Card>
  );
}

function EmptyHint({ text, href, cta }: { text: string; href: string; cta: string }) {
  return (
    <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-lg bg-slate-50 text-center text-sm text-slate-500">
      {text}
      <Link href={href} className="text-xs font-medium text-primary-600 hover:underline">
        {cta}
      </Link>
    </div>
  );
}

function PeopleList({
  title,
  description,
  rows,
  href,
  empty,
  dateLabel,
  grid = false,
}: {
  title: string;
  description?: string;
  rows: PersonRow[];
  href: string;
  empty: string;
  dateLabel: (r: PersonRow) => string;
  grid?: boolean;
}) {
  const shown = rows.slice(0, grid ? 12 : 6);
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {title}
            {rows.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{rows.length}</span>}
          </span>
        }
        description={description}
        action={
          <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
            Open <ArrowRight className="h-3 w-3" />
          </Link>
        }
      />
      {shown.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className={cn("px-2 py-2", grid && "grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")}>
          {shown.map((r) => (
            <li key={`${r.id}-${r.sub}`}>
              <Link href={`/hris/employees/${r.id}/edit`} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50">
                <Avatar name={r.name} src={r.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{r.name}</p>
                  <p className="truncate text-xs text-slate-500">{r.sub || "—"}</p>
                </div>
                <span className={cn("shrink-0 text-xs", r.tone === "warn" ? "font-medium text-rose-600" : r.tone === "ok" ? "text-emerald-600" : "text-slate-400")}>
                  {dateLabel(r)}
                </span>
              </Link>
            </li>
          ))}
          {rows.length > shown.length && (
            <li className="px-3 pt-1 text-xs text-slate-400">
              <Link href={href} className="hover:underline">
                +{rows.length - shown.length} more
              </Link>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}
