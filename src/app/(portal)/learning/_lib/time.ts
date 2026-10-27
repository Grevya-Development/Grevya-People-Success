/** India-time helpers for training sessions (stored as timestamptz, shown in IST). */
const TZ = "Asia/Kolkata";

function toDate(d: string | Date) {
  return typeof d === "string" ? new Date(d) : d;
}

/** yyyy-MM-dd in IST. */
export function istDate(d: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(toDate(d));
}

/** "10:30 AM" in IST. */
export function istTime(d: string | Date) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true }).format(toDate(d)).toUpperCase();
}

/** "Tue, 3 Nov 2026" in IST. */
export function istDayLabel(d: string | Date) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(toDate(d));
}

/** "10:00 AM – 11:30 AM IST" (adds the end date when it spans days). */
export function istTimeRange(start: string | Date, end: string | Date) {
  const sameDay = istDate(start) === istDate(end);
  return `${istTime(start)} – ${sameDay ? "" : istDayLabel(end) + ", "}${istTime(end)} IST`;
}

/** Value for <input type="datetime-local"> showing IST wall time. */
export function toISTInput(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = toDate(d);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/** Parse a datetime-local value entered as IST into an ISO timestamp, or null. */
export function fromISTInput(v: string | null) {
  if (!v || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Indian financial year bounds (Apr–Mar) containing `today` (yyyy-MM-dd). */
export function fyRange(today: string) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31`, label: `FY ${start}-${String((start + 1) % 100).padStart(2, "0")}` };
}

/** { day: "3", month: "Nov" } in IST — for date badges. */
export function istDayMonth(d: string | Date) {
  const date = toDate(d);
  return {
    day: new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric" }).format(date),
    month: new Intl.DateTimeFormat("en-IN", { timeZone: TZ, month: "short" }).format(date),
  };
}
