import { addDays, format, parseISO, subMonths, startOfMonth, endOfMonth, isWeekend } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { orgToday } from "@/lib/utils";

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

const PAGE = 1000;

/** Read every row of a query, a page at a time (PostgREST caps a response at 1000 rows). */
async function all<T>(make: (from: number, to: number) => Page<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

export type Slice = { label: string; value: number; color?: string; href?: string };
export type MonthPoint = { month: string; headcount: number; joiners: number; exits: number };
export type Stacked = { rows: Record<string, number | string>[]; series: { key: string; label: string; color: string }[] };
export type PersonRow = { id: string; name: string; avatarUrl: string | null; sub: string; date: string; tone?: "warn" | "ok" };
export type ApprovalRow = { label: string; count: number; href: string };

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const monthKey = (d: string) => d.slice(0, 7);
const PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#ec4899", "#64748b", "#84cc16"];

/** `meId`: the viewing admin. Their own requests are left out of "waiting for approval" (they can't approve them). */
export async function loadDashboard(meId: string) {
  const supabase = await createClient();
  const today = orgToday();
  const now = parseISO(today);
  const monthStart = ymd(startOfMonth(now));
  const months12 = Array.from({ length: 12 }, (_, i) => startOfMonth(subMonths(now, 11 - i)));
  const months6 = months12.slice(6);
  const sixMonthsAgo = ymd(months6[0]);
  const yearAgo = ymd(months12[0]);
  const in30 = ymd(addDays(now, 30));
  const head = { count: "exact" as const, head: true };

  const [
    employees,
    departments,
    locations,
    resignations,
    attendance,
    remote,
    leaves,
    leaveTypes,
    holidays,
    claims,
    payslips,
    candidates,
    jobs,
    enrollments,
    cycles,
    onboarding,
    pending,
  ] = await Promise.all([
    all((a, b) =>
      supabase
        .from("employees")
        .select("id, full_name, first_name, last_name, avatar_url, status, gender, employment_type, department_id, location_id, date_of_joining, date_of_birth, probation_end_date, confirmation_date, updated_at, designation:designations(title)")
        .order("id")
        .range(a, b),
    ),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("locations").select("id, name").order("name"),
    all((a, b) => supabase.from("resignations").select("employee_id, status, approved_last_day, requested_last_day, reason_category, created_at").order("created_at").range(a, b)),
    all((a, b) => supabase.from("attendance_records").select("employee_id, status, work_mode").eq("date", today).order("id").range(a, b)),
    all((a, b) => supabase.from("remote_work_sessions").select("employee_id").eq("work_date", today).order("id").range(a, b)),
    all((a, b) =>
      supabase
        .from("leave_requests")
        .select("employee_id, leave_type_id, start_date, end_date, days, half_day, status")
        .in("status", ["approved", "pending"])
        .gte("end_date", sixMonthsAgo)
        .order("id")
        .range(a, b),
    ),
    supabase.from("leave_types").select("id, name, color, sort_order").order("sort_order"),
    supabase.from("holidays").select("date, name, location_id, type").eq("date", today).eq("type", "public"),
    all((a, b) => supabase.from("claims").select("amount, status, created_at, category:claim_categories(name)").gte("created_at", sixMonthsAgo).neq("status", "draft").order("id").range(a, b)),
    all((a, b) => supabase.from("payslips").select("year, month, net_pay, gross").eq("status", "published").gte("year", months6[0].getFullYear()).order("id").range(a, b)),
    all((a, b) => supabase.from("candidates").select("stage, job_id").order("id").range(a, b)),
    supabase.from("job_openings").select("id, title, status, openings"),
    all((a, b) => supabase.from("course_enrollments").select("status").order("id").range(a, b)),
    supabase.from("review_cycles").select("id, name, status, start_date, end_date").in("status", ["goal_setting", "in_review"]).order("start_date", { ascending: false }).limit(1),
    all((a, b) => supabase.from("onboarding_tasks").select("employee_id, status, due_date").order("id").range(a, b)),
    Promise.all([
      // Same queries as the Tasks menu (layout.tsx), so the two always agree.
      supabase.from("leave_requests").select("id", head).eq("status", "pending").neq("employee_id", meId),
      supabase.from("regularization_requests").select("id", head).eq("status", "pending").neq("employee_id", meId),
      supabase.from("compoff_requests").select("id", head).eq("status", "pending").neq("employee_id", meId),
      supabase.from("claims").select("id", head).eq("status", "submitted").neq("employee_id", meId),
      supabase.from("resignations").select("id", head).in("status", ["pending_manager", "pending_hr"]).neq("employee_id", meId),
      supabase.from("letter_requests").select("id", head).eq("status", "pending"),
      supabase.from("vpf_declarations").select("id", head).eq("status", "pending"),
      supabase.from("fbp_declarations").select("id", head).eq("status", "submitted"),
      supabase.from("investment_declarations").select("id", head).eq("status", "submitted"),
      supabase.from("goals").select("id", head).eq("status", "pending_approval").neq("employee_id", meId),
      supabase.from("external_trainings").select("id", head).eq("status", "pending").neq("employee_id", meId),
      supabase.from("claims").select("id", head).eq("status", "approved"),
      supabase.from("reviews").select("id", head).eq("status", "pending_manager").neq("employee_id", meId),
    ]),
  ]);

  const deptName = new Map((departments.data ?? []).map((d) => [d.id, d.name]));
  const locName = new Map((locations.data ?? []).map((l) => [l.id, l.name]));
  const nameOf = (e: (typeof employees)[number]) => e.full_name ?? `${e.first_name} ${e.last_name}`;

  // ---- Headcount -------------------------------------------------------------
  // Last day of someone who has left: the agreed last day of their resignation, else when they were marked exited.
  const lastDay = new Map<string, string>();
  for (const r of resignations) {
    if (r.status === "approved" || r.status === "completed") lastDay.set(r.employee_id, r.approved_last_day ?? r.requested_last_day);
  }
  const exitDate = (e: (typeof employees)[number]) => (e.status === "exited" ? (lastDay.get(e.id) ?? e.updated_at.slice(0, 10)) : null);

  const active = employees.filter((e) => e.status !== "exited");
  // People already on the roll; future joiners are counted separately ("Joining soon").
  const onRoll = active.filter((e) => e.date_of_joining <= today);
  const onNotice = employees.filter((e) => e.status === "notice_period");

  const trend: MonthPoint[] = months12.map((m) => {
    const end = ymd(endOfMonth(m));
    const key = monthKey(ymd(m));
    let headcount = 0;
    let joiners = 0;
    let exits = 0;
    for (const e of employees) {
      const left = exitDate(e);
      if (e.date_of_joining <= end && (!left || left > end)) headcount++;
      if (monthKey(e.date_of_joining) === key) joiners++;
      if (left && monthKey(left) === key) exits++;
    }
    return { month: format(m, "MMM yy"), headcount, joiners, exits };
  });
  const exits12 = trend.reduce((s, p) => s + p.exits, 0);
  const avgHeadcount = trend.reduce((s, p) => s + p.headcount, 0) / trend.length;
  const attrition = avgHeadcount > 0 ? Math.round((exits12 / avgHeadcount) * 1000) / 10 : 0;
  const joinedThisMonth = active.filter((e) => e.date_of_joining >= monthStart && e.date_of_joining <= today);

  const tally = (rows: typeof onRoll, keyOf: (e: (typeof active)[number]) => string) => {
    const m = new Map<string, number>();
    for (const e of rows) m.set(keyOf(e), (m.get(keyOf(e)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
  };
  const byDepartment: Slice[] = tally(onRoll, (e) => (e.department_id ? (deptName.get(e.department_id) ?? "Unknown") : "No department"));
  const byLocation: Slice[] = tally(onRoll, (e) => (e.location_id ? (locName.get(e.location_id) ?? "Unknown") : "No location"));
  const GENDER: Record<string, { label: string; color: string }> = {
    male: { label: "Male", color: "#3b82f6" },
    female: { label: "Female", color: "#ec4899" },
    other: { label: "Other", color: "#8b5cf6" },
  };
  const byGender: Slice[] = tally(onRoll, (e) => e.gender ?? "unknown").map((s) => ({
    ...s,
    label: GENDER[s.label]?.label ?? "Not specified",
    color: GENDER[s.label]?.color ?? "#cbd5e1",
  }));
  const byType: Slice[] = tally(onRoll, (e) => e.employment_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));

  // ---- Today ------------------------------------------------------------------
  const holidayToday = (holidays.data ?? [])[0]?.name ?? null;
  const weekend = isWeekend(now);
  const activeIds = new Set(active.filter((e) => e.date_of_joining <= today).map((e) => e.id));
  const onLeaveToday = new Set(
    leaves.filter((l) => l.status === "approved" && l.start_date <= today && l.end_date >= today && activeIds.has(l.employee_id)).map((l) => l.employee_id),
  );
  const attendanceBy = new Map(attendance.map((a) => [a.employee_id, a]));
  const remoteIds = new Set(remote.map((r) => r.employee_id));
  let office = 0;
  let remoteCount = 0;
  let absent = 0;
  let leaveCount = 0;
  let unmarked = 0;
  for (const id of activeIds) {
    const rec = attendanceBy.get(id);
    if (onLeaveToday.has(id) && (!rec || rec.status === "absent")) leaveCount++;
    else if (rec && rec.status === "absent") absent++;
    else if (rec && (rec.status === "wfh" || rec.work_mode === "remote")) remoteCount++;
    else if (rec) office++;
    else if (remoteIds.has(id)) remoteCount++;
    else unmarked++;
  }
  const workforce = activeIds.size;
  const present = office + remoteCount;
  const todaySlices: Slice[] = [
    { label: "In office", value: office, color: "#10b981", href: "/attendance/team" },
    { label: "Remote", value: remoteCount, color: "#0ea5e9", href: "/attendance/remote/team" },
    { label: "On leave", value: leaveCount, color: "#f59e0b", href: "/leave/approvals" },
    { label: "Absent", value: absent, color: "#ef4444", href: "/attendance/team" },
    { label: "Not checked in", value: unmarked, color: "#cbd5e1", href: "/attendance/team" },
  ];

  // ---- Leave by type, last 6 months (approved days, counted in the month the leave starts) ----
  const types = leaveTypes.data ?? [];
  const leaveRows = months6.map((m) => {
    const key = monthKey(ymd(m));
    const row: Record<string, number | string> = { month: format(m, "MMM") };
    for (const t of types) row[t.id] = 0;
    for (const l of leaves) {
      if (l.status !== "approved" || monthKey(l.start_date) !== key) continue;
      row[l.leave_type_id] = Number(row[l.leave_type_id] ?? 0) + Number(l.days);
    }
    return row;
  });
  const usedTypes = types.filter((t) => leaveRows.some((r) => Number(r[t.id]) > 0));
  const leaveByType: Stacked = { rows: leaveRows, series: usedTypes.map((t) => ({ key: t.id, label: t.name, color: t.color || "#64748b" })) };

  // ---- Claims, last 6 months (amount by status, in the month they were raised) ----
  const CLAIM_SERIES = [
    { key: "paid", label: "Paid", color: "#10b981" },
    { key: "approved", label: "Approved, not paid", color: "#0ea5e9" },
    { key: "submitted", label: "Waiting for approval", color: "#f59e0b" },
    { key: "rejected", label: "Rejected", color: "#ef4444" },
  ];
  const claimRows = months6.map((m) => {
    const key = monthKey(ymd(m));
    const row: Record<string, number | string> = { month: format(m, "MMM"), paid: 0, approved: 0, submitted: 0, rejected: 0 };
    for (const c of claims) {
      if (monthKey(c.created_at) !== key || !(c.status in row)) continue;
      row[c.status] = Number(row[c.status]) + Number(c.amount);
    }
    return row;
  });
  const claimsByMonth: Stacked = { rows: claimRows, series: CLAIM_SERIES.filter((s) => claimRows.some((r) => Number(r[s.key]) > 0)) };
  const catTotals = new Map<string, number>();
  for (const c of claims) {
    if (c.status === "rejected" || c.status === "cancelled") continue;
    const name = (c.category as { name: string } | null)?.name ?? "Other";
    catTotals.set(name, (catTotals.get(name) ?? 0) + Number(c.amount));
  }
  const claimsByCategory: Slice[] = [...catTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value], i) => ({ label, value: Math.round(value), color: PALETTE[i % PALETTE.length] }));

  // ---- Payroll cost (published payslips) ----
  const payroll = months6.map((m) => {
    const y = m.getFullYear();
    const mo = m.getMonth() + 1;
    const slips = payslips.filter((p) => p.year === y && p.month === mo);
    // A month with no published payslips (e.g. payroll not run yet) is left blank, not drawn as ₹0.
    const sum = (f: (p: (typeof slips)[number]) => number) => (slips.length ? Math.round(slips.reduce((t, p) => t + f(p), 0)) : null);
    return { month: format(m, "MMM"), net: sum((p) => Number(p.net_pay)), gross: sum((p) => Number(p.gross)), people: slips.length };
  });

  // ---- Recruitment ----
  const openJobs = (jobs.data ?? []).filter((j) => j.status === "open");
  const openJobIds = new Set(openJobs.map((j) => j.id));
  const STAGES = [
    { key: "applied", label: "Applied", color: "#a5b4fc" },
    { key: "screening", label: "Screening", color: "#818cf8" },
    { key: "interview", label: "Interview", color: "#6366f1" },
    { key: "offer", label: "Offer", color: "#4f46e5" },
    { key: "hired", label: "Hired", color: "#10b981" },
  ];
  const pipeline: Slice[] = STAGES.map((s) => ({
    label: s.label,
    color: s.color,
    value: candidates.filter((c) => c.stage === s.key && openJobIds.has(c.job_id)).length,
    href: "/recruit/admin",
  }));
  const openPositions = openJobs.reduce((s, j) => s + j.openings, 0);

  // ---- Learning ----
  const learning: Slice[] = [
    { label: "Completed", value: enrollments.filter((e) => e.status === "completed").length, color: "#10b981" },
    { label: "In progress", value: enrollments.filter((e) => e.status === "in_progress").length, color: "#0ea5e9" },
    { label: "Not started", value: enrollments.filter((e) => e.status === "enrolled").length, color: "#cbd5e1" },
  ];
  const learningRate = enrollments.length ? Math.round((learning[0].value / enrollments.length) * 100) : null;

  // ---- Performance: the current review cycle ----
  const cycle = (cycles.data ?? [])[0] ?? null;
  let reviews: Slice[] = [];
  if (cycle) {
    const rows = await all((a, b) => supabase.from("reviews").select("status").eq("cycle_id", cycle.id).order("id").range(a, b));
    reviews = [
      { label: "Self review due", value: rows.filter((r) => r.status === "pending_self").length, color: "#f59e0b" },
      { label: "With manager", value: rows.filter((r) => r.status === "pending_manager").length, color: "#0ea5e9" },
      { label: "Completed", value: rows.filter((r) => r.status === "completed").length, color: "#10b981" },
    ];
  }

  // ---- Exit reasons, last 12 months ----
  const reasons = new Map<string, number>();
  for (const r of resignations) {
    if (r.created_at.slice(0, 10) < yearAgo || r.status === "withdrawn" || r.status === "rejected") continue;
    const label = r.reason_category.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    reasons.set(label, (reasons.get(label) ?? 0) + 1);
  }
  const exitReasons: Slice[] = [...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: PALETTE[(i + 4) % PALETTE.length] }));

  // ---- Approvals waiting ----
  const [pLeave, pReg, pComp, pClaims, pExit, pLetters, pVpf, pFbp, pInv, pGoals, pTraining, pPayout, pReviews] = pending.map((r) => r.count ?? 0);
  const approvals: ApprovalRow[] = [
    { label: "Leave requests", count: pLeave, href: "/leave/approvals" },
    { label: "Regularization & comp-off", count: pReg + pComp, href: "/attendance/bulk-approval" },
    { label: "Expense claims", count: pClaims, href: "/reimbursement/approvals" },
    { label: "Claims approved, to pay", count: pPayout, href: "/reimbursement/approvals" },
    { label: "Resignations", count: pExit, href: "/exit/approvals" },
    { label: "Letter requests", count: pLetters, href: "/hris/admin/letters" },
    { label: "Payroll declarations", count: pVpf + pFbp + pInv, href: "/payroll/admin" },
    { label: "Goal approvals", count: pGoals, href: "/performance/team-goals?scope=all" },
    { label: "Reviews with managers", count: pReviews, href: "/performance/team-reviews?scope=all" },
    { label: "External training", count: pTraining, href: "/learning/external/approvals" },
  ];
  const approvalsTotal = approvals.reduce((s, a) => s + a.count, 0) - pPayout;

  // ---- People lists ----
  const person = (e: (typeof employees)[number], sub: string, date: string, tone?: PersonRow["tone"]): PersonRow => ({
    id: e.id,
    name: nameOf(e),
    avatarUrl: e.avatar_url,
    sub,
    date,
    tone,
  });
  const titleOf = (e: (typeof employees)[number]) => (e.designation as { title: string } | null)?.title ?? (e.department_id ? (deptName.get(e.department_id) ?? "") : "");

  const probation = active
    .filter((e) => e.probation_end_date && !e.confirmation_date && e.probation_end_date <= in30)
    .sort((a, b) => a.probation_end_date!.localeCompare(b.probation_end_date!))
    .map((e) => person(e, titleOf(e), e.probation_end_date!, e.probation_end_date! < today ? "warn" : undefined));

  const leaving = onNotice
    .map((e) => ({ e, day: resignations.filter((r) => r.employee_id === e.id && (r.status === "approved" || r.status === "pending_hr" || r.status === "pending_manager")).at(-1) }))
    .map(({ e, day }) => person(e, titleOf(e), day?.approved_last_day ?? day?.requested_last_day ?? "", undefined))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Onboarding: active people with checklist tasks still open.
  const tasksBy = new Map<string, { open: number; done: number; overdue: number }>();
  for (const t of onboarding) {
    const cur = tasksBy.get(t.employee_id) ?? { open: 0, done: 0, overdue: 0 };
    if (t.status === "pending") {
      cur.open++;
      if (t.due_date && t.due_date < today) cur.overdue++;
    } else cur.done++;
    tasksBy.set(t.employee_id, cur);
  }
  const onboardingRows = active
    .filter((e) => (tasksBy.get(e.id)?.open ?? 0) > 0)
    .map((e) => {
      const t = tasksBy.get(e.id)!;
      const pct = Math.round((t.done / (t.done + t.open)) * 100);
      return { ...person(e, `${pct}% done${t.overdue ? ` · ${t.overdue} overdue` : ""}`, e.date_of_joining, t.overdue ? "warn" : undefined), pct };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  // Birthdays and work anniversaries in the next 7 days.
  const week = Array.from({ length: 7 }, (_, i) => format(addDays(now, i), "MM-dd"));
  const celebrations: PersonRow[] = [];
  for (const e of onRoll) {
    if (e.date_of_birth && week.includes(e.date_of_birth.slice(5))) celebrations.push(person(e, "Birthday", nextOccurrence(e.date_of_birth, now)));
    if (week.includes(e.date_of_joining.slice(5)) && e.date_of_joining.slice(5) !== "02-29") {
      // Years counted at the anniversary itself, which may fall in the new year.
      const on = nextOccurrence(e.date_of_joining, now);
      const years = Number(on.slice(0, 4)) - Number(e.date_of_joining.slice(0, 4));
      if (years > 0) celebrations.push(person(e, `${years} year${years > 1 ? "s" : ""} at Grevya`, on));
    }
  }
  celebrations.sort((a, b) => a.date.localeCompare(b.date));

  const recentJoiners = active
    .filter((e) => e.date_of_joining <= today)
    .sort((a, b) => b.date_of_joining.localeCompare(a.date_of_joining))
    .slice(0, 6)
    .map((e) => person(e, titleOf(e), e.date_of_joining));
  const upcomingJoiners = active
    .filter((e) => e.date_of_joining > today)
    .sort((a, b) => a.date_of_joining.localeCompare(b.date_of_joining))
    .map((e) => person(e, titleOf(e), e.date_of_joining, "ok"));

  return {
    today,
    kpi: {
      headcount: onRoll.length,
      joinedThisMonth: joinedThisMonth.length,
      upcomingJoiners: upcomingJoiners.length,
      onNotice: onNotice.length,
      exits12,
      attrition,
      workforce,
      present,
      remote: remoteCount,
      onLeave: leaveCount,
      approvalsTotal,
      openPositions,
      openJobs: openJobs.length,
    },
    dayNote: holidayToday ? `Today is a holiday (${holidayToday})` : weekend ? "Today is a weekend" : null,
    trend,
    byDepartment,
    byLocation,
    byGender,
    byType,
    todaySlices,
    leaveByType,
    claimsByMonth,
    claimsByCategory,
    payroll,
    pipeline,
    learning,
    learningRate,
    enrollments: enrollments.length,
    cycle,
    reviews,
    exitReasons,
    approvals,
    probation,
    leaving,
    onboarding: onboardingRows,
    celebrations,
    recentJoiners,
    upcomingJoiners,
  };
}

export type Dashboard = Awaited<ReturnType<typeof loadDashboard>>;

/** The next date (today or later) a yearly event falls on. Feb 29 falls on Feb 28 in other years. */
function nextOccurrence(date: string, now: Date) {
  const md = date.slice(5);
  const y = now.getFullYear();
  const fix = (yr: number) => (md === "02-29" && !isLeap(yr) ? `${yr}-02-28` : `${yr}-${md}`);
  const thisYear = fix(y);
  return thisYear >= format(now, "yyyy-MM-dd") ? thisYear : fix(y + 1);
}
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

