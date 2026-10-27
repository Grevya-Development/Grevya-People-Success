import "server-only";
import { addDays, addMonths, differenceInMonths, format, intervalToDuration, isAfter, parseISO } from "date-fns";
import type { CurrentEmployee } from "@/lib/auth";
import type { createClient } from "@/lib/supabase/server";
import { formatDate, orgToday } from "@/lib/utils";
import { NOTICE_PERIOD_DAYS } from "../_components/shared";

type DB = Awaited<ReturnType<typeof createClient>>;

/** Notice period in days: org_settings 'exit' {notice_period_days}, else 60. */
export async function getNoticePeriodDays(supabase: DB): Promise<number> {
  const { data } = await supabase.from("org_settings").select("value").eq("key", "exit").maybeSingle();
  const v = (data?.value as { notice_period_days?: unknown } | null)?.notice_period_days;
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 365 ? n : NOTICE_PERIOD_DAYS;
}

export type ResignInfo = {
  today: string;
  noticeDays: number;
  /** yyyy-MM-dd: today + notice period */
  relievingDate: string;
  employeeCode: string;
  employeeName: string;
  /** "05 Oct 2026 (0 Y : 0 M : 23 D)" */
  joiningLabel: string;
  role: string;
  officialEmail: string;
  personalEmail: string | null;
  phone: string | null;
  confirmationStatus: "Confirmed" | "On probation";
  /** Earned Leave expected on the last working day (available now + pro-rated accrual). */
  earnedLeaveOnLwd: number;
};

/** Everything the read-only "Employee Info" section of the resignation form shows. */
export async function getResignInfo(supabase: DB, me: CurrentEmployee): Promise<ResignInfo> {
  const today = orgToday();
  const year = Number(today.slice(0, 4));
  const todayDate = parseISO(today);

  const [noticeDays, { data: priv }, { data: el }] = await Promise.all([
    getNoticePeriodDays(supabase),
    supabase.from("employee_private").select("personal_email").eq("employee_id", me.id).maybeSingle(),
    supabase.from("leave_types").select("id, annual_quota").eq("code", "EL").maybeSingle(),
  ]);

  const relieving = addDays(todayDate, noticeDays);
  const relievingDate = format(relieving, "yyyy-MM-dd");

  // Earned Leave: available today (allocated − used − pending) + quota/12 per full month until the relieving date.
  let earnedLeaveOnLwd = 0;
  if (el) {
    const [{ data: bal }, { data: pending }] = await Promise.all([
      supabase.from("leave_balances").select("allocated, used").eq("employee_id", me.id).eq("leave_type_id", el.id).eq("year", year).maybeSingle(),
      supabase
        .from("leave_requests")
        .select("days")
        .eq("employee_id", me.id)
        .eq("leave_type_id", el.id)
        .eq("status", "pending")
        .gte("start_date", `${year}-01-01`)
        .lte("start_date", `${year}-12-31`),
    ]);
    const pend = (pending ?? []).reduce((s, p) => s + Number(p.days), 0);
    const available = Number(bal?.allocated ?? 0) - Number(bal?.used ?? 0) - pend;
    const accrual = (Number(el.annual_quota) / 12) * Math.max(0, differenceInMonths(relieving, todayDate));
    earnedLeaveOnLwd = Math.round((Math.max(0, available) + accrual) * 100) / 100;
  }

  const doj = parseISO(me.date_of_joining);
  const t = isAfter(doj, todayDate) ? { years: 0, months: 0, days: 0 } : intervalToDuration({ start: doj, end: todayDate });
  const joiningLabel = `${formatDate(me.date_of_joining)} (${t.years ?? 0} Y : ${t.months ?? 0} M : ${t.days ?? 0} D)`;

  return {
    today,
    noticeDays,
    relievingDate,
    employeeCode: me.employee_code,
    employeeName: me.full_name ?? `${me.first_name} ${me.last_name}`.trim(),
    joiningLabel,
    role: me.designation?.title ?? "—",
    officialEmail: me.email,
    personalEmail: priv?.personal_email ?? null,
    phone: me.phone,
    confirmationStatus: isAfter(todayDate, addMonths(doj, 6)) ? "Confirmed" : "On probation",
    earnedLeaveOnLwd,
  };
}
