import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert } from "@/lib/database.types";
import { computeTax, PROFESSIONAL_TAX_MONTHLY, type Regime } from "./tax";
import {
  EPF_RATE,
  annualEpf,
  annualGross,
  deductionsFromInvestments,
  fyOf,
  isRegime,
  parseFbpComponents,
  parseInvestmentItems,
  round2,
  toNum,
  ym,
  type PayLine,
} from "./payroll";

type Client = Awaited<ReturnType<typeof createClient>>;

const PAGE = 1000;

/** Page through a PostgREST query (the API caps responses at 1000 rows). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export type PayrollRow = {
  employee: { id: string; full_name: string; employee_code: string; date_of_joining: string; department: string | null };
  structureId: string;
  annualCtc: number;
  regime: Regime;
  vpfPercent: number;
  workingDays: number;
  notJoinedDays: number;
  lopDays: number;
  paidDays: number;
  earnings: PayLine[];
  deductions: PayLine[];
  gross: number;
  totalDeductions: number;
  netPay: number;
  existingStatus: string | null;
};

export type PayrollPreview = {
  year: number;
  month: number;
  rows: PayrollRow[];
  /** Active employees without a salary structure effective by month end. */
  skipped: { id: string; full_name: string; employee_code: string }[];
  existingCount: number;
  totals: { gross: number; deductions: number; net: number };
};

/** Months HR may run payroll for: any month up to and including the current one. */
export function isRunnableMonth(year: number, month: number, today: string) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || year < 2000) return false;
  return ym(year, month) <= today.slice(0, 7);
}

/**
 * Compute one payslip per active employee with a salary structure for the month.
 * Must be called with an HR user's client (RLS: HR reads everything).
 */
export async function computePayroll(supabase: Client, year: number, month: number, today: string): Promise<PayrollPreview> {
  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;
  const fy = fyOf(year, month);

  const [employees, structures, fbps, vpfs, investments, holidays, attendance, leaves, existing] = await Promise.all([
    fetchAll((f, t) =>
      supabase
        .from("employees")
        .select("id, full_name, employee_code, date_of_joining, location_id, status, department:departments(name)")
        .neq("status", "exited")
        .lte("date_of_joining", monthEnd)
        .order("employee_code")
        .range(f, t),
    ),
    fetchAll((f, t) =>
      supabase
        .from("salary_structures")
        .select("*")
        .lte("effective_from", monthEnd)
        .order("effective_from", { ascending: false })
        .order("created_at", { ascending: false })
        .range(f, t),
    ),
    fetchAll((f, t) => supabase.from("fbp_declarations").select("employee_id, components").eq("financial_year", fy).eq("status", "approved").range(f, t)),
    fetchAll((f, t) =>
      supabase
        .from("vpf_declarations")
        .select("employee_id, percentage, effective_month, created_at")
        .eq("status", "approved")
        .lte("effective_month", monthStart)
        .order("effective_month", { ascending: false })
        .order("created_at", { ascending: false })
        .range(f, t),
    ),
    fetchAll((f, t) =>
      supabase
        .from("investment_declarations")
        .select("employee_id, regime, items, status")
        .eq("financial_year", fy)
        .in("status", ["submitted", "approved"])
        .range(f, t),
    ),
    fetchAll((f, t) => supabase.from("holidays").select("date, location_id").eq("type", "public").gte("date", monthStart).lte("date", monthEnd).range(f, t)),
    fetchAll((f, t) => supabase.from("attendance_records").select("employee_id, date, status").gte("date", monthStart).lte("date", monthEnd).range(f, t)),
    fetchAll((f, t) =>
      supabase
        .from("leave_requests")
        .select("employee_id, start_date, end_date, half_day, leave_type:leave_types(is_paid)")
        .eq("status", "approved")
        .lte("start_date", monthEnd)
        .gte("end_date", monthStart)
        .range(f, t),
    ),
    fetchAll((f, t) => supabase.from("payslips").select("employee_id, status").eq("year", year).eq("month", month).range(f, t)),
  ]);

  // Only employees who have a current structure are on payroll; use the revision effective for this month.
  // (Structures effective after month end aren't in `structures`, so look up is_current separately.)
  const currentRows = await fetchAll((f, t) => supabase.from("salary_structures").select("employee_id").eq("is_current", true).range(f, t));
  const hasCurrent = new Set(currentRows.map((r) => r.employee_id));

  const structureFor = new Map<string, Tables<"salary_structures">>();
  for (const s of structures) if (!structureFor.has(s.employee_id)) structureFor.set(s.employee_id, s);
  const vpfFor = new Map<string, number>();
  for (const v of vpfs) if (!vpfFor.has(v.employee_id)) vpfFor.set(v.employee_id, toNum(v.percentage));
  const fbpFor = new Map(fbps.map((f) => [f.employee_id, parseFbpComponents(f.components)]));
  const invFor = new Map(investments.map((i) => [i.employee_id, i]));
  const existingFor = new Map(existing.map((e) => [e.employee_id, e.status]));

  const attendanceFor = new Map<string, Map<string, string>>();
  for (const a of attendance) {
    if (!attendanceFor.has(a.employee_id)) attendanceFor.set(a.employee_id, new Map());
    attendanceFor.get(a.employee_id)!.set(a.date, a.status);
  }

  type LeaveCover = { paid: number; unpaid: number };
  const leaveFor = new Map<string, Map<string, LeaveCover>>();
  for (const l of leaves) {
    const map = leaveFor.get(l.employee_id) ?? new Map<string, LeaveCover>();
    leaveFor.set(l.employee_id, map);
    const lt = Array.isArray(l.leave_type) ? l.leave_type[0] : l.leave_type;
    const isPaid = lt?.is_paid !== false;
    const share = l.half_day ? 0.5 : 1;
    for (let d = l.start_date > monthStart ? l.start_date : monthStart; d <= l.end_date && d <= monthEnd; d = nextDay(d)) {
      const c = map.get(d) ?? { paid: 0, unpaid: 0 };
      if (isPaid) c.paid = Math.min(1, c.paid + share);
      else c.unpaid = Math.min(1, c.unpaid + share);
      map.set(d, c);
    }
  }

  // Working days: Mon–Fri that aren't public holidays (org-wide or for the employee's location).
  const allDays: { date: string; weekend: boolean }[] = [];
  for (let day = 1; day <= daysInMonth(year, month); day++) {
    const date = `${year}-${pad(month)}-${pad(day)}`;
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    allDays.push({ date, weekend: dow === 0 || dow === 6 });
  }
  const orgHolidays = new Set(holidays.filter((h) => !h.location_id).map((h) => h.date));
  const locHolidays = new Map<string, Set<string>>();
  for (const h of holidays) {
    if (!h.location_id) continue;
    if (!locHolidays.has(h.location_id)) locHolidays.set(h.location_id, new Set());
    locHolidays.get(h.location_id)!.add(h.date);
  }

  const rows: PayrollRow[] = [];
  const skipped: PreviewSkip[] = [];

  for (const e of employees) {
    const s = structureFor.get(e.id);
    if (!s || !hasCurrent.has(e.id)) {
      skipped.push({ id: e.id, full_name: e.full_name ?? "", employee_code: e.employee_code });
      continue;
    }

    // --- Attendance → LOP ---------------------------------------------------
    const locSet = e.location_id ? locHolidays.get(e.location_id) : undefined;
    const att = attendanceFor.get(e.id);
    const lv = leaveFor.get(e.id);
    let workingDays = 0;
    let notJoined = 0;
    let lop = 0;
    for (const d of allDays) {
      if (d.weekend || orgHolidays.has(d.date) || locSet?.has(d.date)) continue;
      workingDays++;
      if (d.date < e.date_of_joining) {
        notJoined++;
        continue;
      }
      // Today and future days are assumed paid (attendance for today may not be marked yet),
      // except where an approved unpaid leave already covers them.
      if (d.date >= today) {
        lop += lv?.get(d.date)?.unpaid ?? 0;
        continue;
      }
      const status = att?.get(d.date);
      const attended = status === "present" || status === "wfh" || status === "on_duty" ? 1 : status === "half_day" ? 0.5 : 0;
      const paidLeave = lv?.get(d.date)?.paid ?? 0;
      lop += Math.max(0, 1 - Math.min(1, attended + paidLeave));
    }
    const paidDays = Math.max(0, workingDays - notJoined - lop);
    const factor = workingDays > 0 ? paidDays / workingDays : 0;

    // --- Earnings -------------------------------------------------------------
    const prorate = (annual: number) => round2((toNum(annual) / 12) * factor);
    const earnings: PayLine[] = [
      { label: "Basic", amount: prorate(s.basic) },
      { label: "House Rent Allowance", amount: prorate(s.hra) },
      { label: "Special Allowance", amount: prorate(s.special_allowance) },
    ];
    const fbpTotal = toNum(s.fbp_total);
    if (fbpTotal > 0) {
      const decl = fbpFor.get(e.id);
      if (decl) {
        let declared = 0;
        for (const c of decl) {
          if (c.declared <= 0) continue;
          declared += c.declared;
          earnings.push({ label: c.label, amount: prorate(c.declared) });
        }
        const rest = fbpTotal - declared;
        if (rest > 0.005) earnings.push({ label: "FBP Balance", amount: prorate(rest) });
      } else {
        earnings.push({ label: "Flexible Benefit Plan", amount: prorate(fbpTotal) });
      }
    }
    const gross = round2(earnings.reduce((a, l) => a + l.amount, 0));
    const earnedBasic = earnings[0].amount;

    // --- Deductions -----------------------------------------------------------
    const vpfPercent = vpfFor.get(e.id) ?? 0;
    const inv = invFor.get(e.id);
    const regime: Regime = inv && isRegime(inv.regime) ? inv.regime : "new";
    const annualVpf = round2(toNum(s.basic) * (vpfPercent / 100));
    const tax = computeTax(regime, {
      grossSalary: annualGross(s),
      deductions:
        regime === "old"
          ? deductionsFromInvestments(parseInvestmentItems(inv?.items), { basic: toNum(s.basic), hra: toNum(s.hra) }, { epf: annualEpf(toNum(s.basic)) + annualVpf })
          : undefined,
    });

    const deductions: PayLine[] = [{ label: "Employee PF (12%)", amount: round2(earnedBasic * EPF_RATE) }];
    if (vpfPercent > 0) deductions.push({ label: `Voluntary PF (${vpfPercent}%)`, amount: round2(earnedBasic * (vpfPercent / 100)) });
    if (gross > 0) deductions.push({ label: "Professional Tax", amount: Math.min(PROFESSIONAL_TAX_MONTHLY, gross) });
    const before = deductions.reduce((a, l) => a + l.amount, 0);
    // TDS never pushes net pay below zero.
    const tds = Math.max(0, Math.min(tax.monthlyTax, round2(gross - before)));
    if (tds > 0) deductions.push({ label: `Income Tax (${regime === "new" ? "New" : "Old"} regime)`, amount: tds });
    const totalDeductions = round2(deductions.reduce((a, l) => a + l.amount, 0));

    rows.push({
      employee: {
        id: e.id,
        full_name: e.full_name ?? "",
        employee_code: e.employee_code,
        date_of_joining: e.date_of_joining,
        department: (Array.isArray(e.department) ? e.department[0]?.name : e.department?.name) ?? null,
      },
      structureId: s.id,
      annualCtc: toNum(s.annual_ctc),
      regime,
      vpfPercent,
      workingDays,
      notJoinedDays: notJoined,
      lopDays: lop,
      paidDays,
      earnings,
      deductions,
      gross,
      totalDeductions,
      netPay: round2(gross - totalDeductions),
      existingStatus: existingFor.get(e.id) ?? null,
    });
  }

  return {
    year,
    month,
    rows,
    skipped,
    existingCount: existing.length,
    totals: {
      gross: round2(rows.reduce((a, r) => a + r.gross, 0)),
      deductions: round2(rows.reduce((a, r) => a + r.totalDeductions, 0)),
      net: round2(rows.reduce((a, r) => a + r.netPay, 0)),
    },
  };
}

type PreviewSkip = PayrollPreview["skipped"][number];

function nextDay(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day + 1));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Payslip rows for upsert. */
export function toPayslipInserts(p: PayrollPreview, publishedAt: string): TablesInsert<"payslips">[] {
  return p.rows.map((r) => ({
    employee_id: r.employee.id,
    year: p.year,
    month: p.month,
    earnings: r.earnings,
    deductions: r.deductions,
    gross: r.gross,
    total_deductions: r.totalDeductions,
    net_pay: r.netPay,
    working_days: r.workingDays,
    paid_days: r.paidDays,
    lop_days: r.lopDays,
    status: "published",
    published_at: publishedAt,
  }));
}
