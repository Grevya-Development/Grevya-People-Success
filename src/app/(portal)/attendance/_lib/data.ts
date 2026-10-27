import "server-only";
import type { DB } from "../../leave/_lib/data";
import { getHolidays, one } from "../../leave/_lib/data";
import { buildDays, parseShift, type LeaveLite, type ShiftSettings } from "./shift";

export async function getShiftSettings(supabase: DB): Promise<ShiftSettings> {
  const { data } = await supabase.from("org_settings").select("value").eq("key", "attendance").maybeSingle();
  return parseShift(data?.value);
}

/** Approved leave overlapping [from, to] for one employee. */
export async function getApprovedLeaves(supabase: DB, employeeId: string, from: string, to: string): Promise<LeaveLite[]> {
  const { data } = await supabase
    .from("leave_requests")
    .select("start_date, end_date, half_day, type:leave_types(name, color)")
    .eq("employee_id", employeeId)
    .eq("status", "approved")
    .lte("start_date", to)
    .gte("end_date", from);
  return (data ?? []).map((l) => {
    const t = one(l.type as { name: string; color: string } | null);
    return { start_date: l.start_date, end_date: l.end_date, half_day: l.half_day, type_name: t?.name, color: t?.color };
  });
}

/** Everything needed to render an employee's attendance for a date range. */
export async function getAttendanceDays(
  supabase: DB,
  emp: { id: string; location_id: string | null; date_of_joining?: string | null },
  from: string,
  to: string,
  today: string,
) {
  const [shift, { data: records }, leaves, holidays] = await Promise.all([
    getShiftSettings(supabase),
    supabase.from("attendance_records").select("date, check_in, check_out, status, work_mode, source, notes").eq("employee_id", emp.id).gte("date", from).lte("date", to),
    getApprovedLeaves(supabase, emp.id, from, to),
    getHolidays(supabase, from, to, emp.location_id),
  ]);
  const days = buildDays({ start: from, end: to, today, records: records ?? [], leaves, holidays, shift, joinedOn: emp.date_of_joining });
  return { shift, days, holidays };
}

export function summarize(days: ReturnType<typeof buildDays>) {
  const past = days.filter((d) => !d.future);
  const worked = past.filter((d) => d.hours !== null && d.hours > 0);
  return {
    present: past.filter((d) => d.status === "present" || d.status === "on_duty" || d.status === "half_day").length,
    wfh: past.filter((d) => d.status === "wfh").length,
    absent: past.filter((d) => d.status === "absent").length,
    leave: days.filter((d) => d.status === "leave").length,
    holidays: days.filter((d) => d.holiday && !d.weekend).length,
    late: past.filter((d) => d.late).length,
    avgHours: worked.length ? worked.reduce((s, d) => s + (d.hours ?? 0), 0) / worked.length : null,
    workingDays: days.filter((d) => !d.weekend && !d.holiday).length,
  };
}
