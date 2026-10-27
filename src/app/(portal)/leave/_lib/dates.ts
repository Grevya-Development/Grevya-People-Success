/**
 * Pure date helpers for Leave & Attendance. Works on ISO `yyyy-MM-dd` strings
 * using UTC arithmetic so results never depend on the server's timezone.
 * Safe to import from client and server components.
 */

export const ORG_TZ = "Asia/Kolkata";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s: string | null | undefined): s is string {
  if (!s || !ISO_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function toUTC(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, n: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(iso: string): number {
  return toUTC(iso).getUTCDay();
}

export function isWeekend(iso: string): boolean {
  const d = dayOfWeek(iso);
  return d === 0 || d === 6;
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  if (!isISODate(start) || !isISODate(end) || end < start) return out;
  for (let d = start; d <= end && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** "Tue, 27 Oct" */
export function shortDay(iso: string) {
  const d = toUTC(iso);
  return `${DOW_SHORT[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, "0")} ${MON_SHORT[d.getUTCMonth()]}`;
}

/** yyyy-MM-dd of a timestamp in India time (a UTC timestamp before 05:30 is still "yesterday" in UTC). */
export function istDate(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts.slice(0, 10) : new Intl.DateTimeFormat("en-CA", { timeZone: ORG_TZ }).format(d);
}

/** "27 Oct 2026" — accepts a yyyy-MM-dd date or a full timestamp (shown in India time). */
export function longDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const day = iso.length > 10 ? istDate(iso) : iso;
  if (!isISODate(day)) return "—";
  const d = toUTC(day);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MON_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "27 Oct – 29 Oct 2026" style range */
export function dateRange(start: string, end: string) {
  if (start === end) return longDate(start);
  const s = toUTC(start);
  const e = toUTC(end);
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const left = `${String(s.getUTCDate()).padStart(2, "0")} ${MON_SHORT[s.getUTCMonth()]}${sameYear ? "" : ` ${s.getUTCFullYear()}`}`;
  return `${left} – ${longDate(end)}`;
}

/** yyyy-MM for a date */
export function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export function isMonthKey(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function monthBounds(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start, end: `${ym}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// ---------------------------------------------------------------------------
// Time of day in org timezone
// ---------------------------------------------------------------------------

/** "09:42 AM" in India time ("—" for null). */
export function istTime(ts: string | null | undefined) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: ORG_TZ }).format(d).toUpperCase();
}

/** Minutes since midnight India time. */
export function istMinutes(ts: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ORG_TZ }).formatToParts(new Date(ts));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** "HH:mm" (24h) in India time, for <input type="time"> defaults. */
export function istHHmm(ts: string | null | undefined) {
  if (!ts) return "";
  const mins = istMinutes(ts);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/** "09:30" -> 570 */
export function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Hours between two timestamps (null when incomplete). */
export function hoursBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms > 0 ? ms / 3_600_000 : 0;
}

/** 7.5 -> "7h 30m" */
export function formatHours(h: number | null | undefined) {
  if (h === null || h === undefined || !Number.isFinite(h)) return "—";
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
}

/** Combine a yyyy-MM-dd date and HH:mm time (India time) into an ISO timestamp. */
export function istTimestamp(date: string, hhmm: string) {
  return `${date}T${hhmm}:00+05:30`;
}

// ---------------------------------------------------------------------------
// Leave day computation
// ---------------------------------------------------------------------------

export type HolidayLite = { date: string; name: string; type?: string };

export type LeaveDayBreakdown = {
  calendarDays: number;
  weekends: string[];
  holidays: HolidayLite[];
  workingDays: number;
  /** chargeable days (0.5 for half day) */
  days: number;
};

/** Working days between start and end (inclusive), skipping Sat/Sun and holidays. */
export function computeLeaveDays(start: string, end: string, holidays: HolidayLite[], halfDay = false): LeaveDayBreakdown {
  const days = eachDay(start, end);
  const hmap = new Map(holidays.map((h) => [h.date, h]));
  const weekends: string[] = [];
  const hols: HolidayLite[] = [];
  let working = 0;
  for (const d of days) {
    if (isWeekend(d)) weekends.push(d);
    else if (hmap.has(d)) hols.push(hmap.get(d)!);
    else working++;
  }
  const chargeable = halfDay && start === end && working === 1 ? 0.5 : working;
  return { calendarDays: days.length, weekends, holidays: hols, workingDays: working, days: chargeable };
}

export function fmtDays(n: number) {
  const v = Number(n);
  return `${Number.isInteger(v) ? v : v.toFixed(1)} ${v === 1 ? "day" : "days"}`;
}

export function fmtNum(n: number) {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
