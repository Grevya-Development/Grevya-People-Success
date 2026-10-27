/** Shift settings + day status derivation. Pure — safe on client and server. */
import { hhmmToMinutes, hoursBetween, istMinutes, isWeekend, eachDay, type HolidayLite } from "../../leave/_lib/dates";

export type ShiftSettings = {
  shift_start: string;
  shift_end: string;
  grace_minutes: number;
  min_full_day_hours: number;
};

export const DEFAULT_SHIFT: ShiftSettings = { shift_start: "09:30", shift_end: "18:30", grace_minutes: 15, min_full_day_hours: 8 };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseShift(value: unknown): ShiftSettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const s = typeof v.shift_start === "string" && HHMM.test(v.shift_start) ? v.shift_start : DEFAULT_SHIFT.shift_start;
  const e = typeof v.shift_end === "string" && HHMM.test(v.shift_end) ? v.shift_end : DEFAULT_SHIFT.shift_end;
  const g = Number(v.grace_minutes);
  const h = Number(v.min_full_day_hours);
  return {
    shift_start: s,
    shift_end: e,
    grace_minutes: Number.isFinite(g) && g >= 0 ? g : DEFAULT_SHIFT.grace_minutes,
    min_full_day_hours: Number.isFinite(h) && h > 0 ? h : DEFAULT_SHIFT.min_full_day_hours,
  };
}

export function isLate(checkIn: string | null | undefined, shift: ShiftSettings) {
  if (!checkIn) return false;
  return istMinutes(checkIn) > hhmmToMinutes(shift.shift_start) + shift.grace_minutes;
}

export type DayStatus = "present" | "absent" | "half_day" | "on_duty" | "wfh" | "leave" | "holiday" | "weekend" | "";

export type RecordLite = { date: string; check_in: string | null; check_out: string | null; status: string; work_mode?: string; source?: string; notes?: string | null };
export type LeaveLite = { start_date: string; end_date: string; half_day: boolean; type_name?: string; color?: string };

export type DayInfo = {
  date: string;
  status: DayStatus;
  record: RecordLite | null;
  leave: LeaveLite | null;
  holiday: HolidayLite | null;
  weekend: boolean;
  hours: number | null;
  late: boolean;
  /** past working day with no punches, or punched in without punching out */
  needsRegularization: boolean;
  future: boolean;
};

/**
 * Derive one row per day: record status if present; else approved leave; else holiday;
 * else weekend; else 'absent' for past working days; blank for today/future
 * (and days before joining).
 */
export function buildDays(opts: {
  start: string;
  end: string;
  today: string;
  records: RecordLite[];
  leaves: LeaveLite[];
  holidays: HolidayLite[];
  shift: ShiftSettings;
  joinedOn?: string | null;
}): DayInfo[] {
  const recMap = new Map(opts.records.map((r) => [r.date, r]));
  const holMap = new Map(opts.holidays.map((h) => [h.date, h]));
  return eachDay(opts.start, opts.end).map((date) => {
    const record = recMap.get(date) ?? null;
    const leave = opts.leaves.find((l) => l.start_date <= date && l.end_date >= date) ?? null;
    const holiday = holMap.get(date) ?? null;
    const weekend = isWeekend(date);
    const future = date > opts.today;
    const beforeJoining = !!opts.joinedOn && date < opts.joinedOn;
    let status: DayStatus = "";
    if (record) status = record.status as DayStatus;
    else if (leave) status = "leave";
    else if (holiday) status = "holiday";
    else if (weekend) status = "weekend";
    else if (date < opts.today && !beforeJoining) status = "absent";
    const hours = record ? hoursBetween(record.check_in, record.check_out) : null;
    const missedPunch = !!record && date < opts.today && (!record.check_in || !record.check_out);
    return {
      date,
      status,
      record,
      leave,
      holiday,
      weekend,
      hours,
      late: !!record && record.status !== "wfh" && isLate(record.check_in, opts.shift),
      needsRegularization: status === "absent" || missedPunch,
      future,
    };
  });
}

export const STATUS_STYLE: Record<string, { label: string; cell: string; dot: string }> = {
  present: { label: "Present", cell: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
  wfh: { label: "WFH", cell: "bg-violet-50 text-violet-800 ring-violet-200", dot: "bg-violet-500" },
  on_duty: { label: "On duty", cell: "bg-teal-50 text-teal-800 ring-teal-200", dot: "bg-teal-500" },
  half_day: { label: "Half day", cell: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  leave: { label: "Leave", cell: "bg-orange-50 text-orange-800 ring-orange-200", dot: "bg-orange-500" },
  holiday: { label: "Holiday", cell: "bg-blue-50 text-blue-800 ring-blue-200", dot: "bg-blue-500" },
  absent: { label: "Absent", cell: "bg-red-50 text-red-800 ring-red-200", dot: "bg-red-500" },
  weekend: { label: "Weekend", cell: "bg-slate-50 text-slate-500 ring-slate-200", dot: "bg-slate-300" },
};
