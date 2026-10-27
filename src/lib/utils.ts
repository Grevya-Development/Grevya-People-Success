import { clsx, type ClassValue } from "clsx";
import { format, parseISO, isValid } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

type DateInput = string | Date | null | undefined;

function toDate(d: DateInput): Date | null {
  if (!d) return null;
  const date = typeof d === "string" ? parseISO(d) : d;
  return isValid(date) ? date : null;
}

/** 27 Oct 2026 */
export function formatDate(d: DateInput, pattern = "dd MMM yyyy") {
  const date = toDate(d);
  return date ? format(date, pattern) : "—";
}

/** 27 Oct 2026, 09:30 AM */
export function formatDateTime(d: DateInput) {
  return formatDate(d, "dd MMM yyyy, hh:mm a");
}

/** 09:30 AM */
export function formatTime(d: DateInput) {
  return formatDate(d, "hh:mm a");
}

/** ₹1,23,456 (Indian grouping). Pass decimals=2 for paise. */
export function formatCurrency(amount: number | string | null | undefined, decimals = 0) {
  const n = Number(amount ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(n) ? n : 0);
}

export function formatNumber(n: number | string | null | undefined, decimals = 0) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: decimals }).format(Number(n ?? 0));
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** "pending_manager" -> "Pending Manager" */
export function humanize(s: string | null | undefined) {
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Today's date in India (yyyy-MM-dd) — matches public.org_today() in the DB. */
export function orgToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/** Indian financial year label for a date, e.g. "2026-27". */
export function financialYear(d: DateInput = new Date()) {
  const date = toDate(d) ?? new Date();
  const y = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export function greeting(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(date));
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

/** Read a trimmed string from FormData ("" -> null). */
export function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function num(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}
