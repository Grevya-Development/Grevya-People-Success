import { addDays, format, parseISO } from "date-fns";

export const CONTRACT_TYPES = ["employment", "nda", "consultant", "internship", "vendor", "other"] as const;
export const CONTRACT_STATUSES = ["draft", "active", "expired", "terminated", "renewed"] as const;

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  employment: "Employment",
  nda: "NDA",
  consultant: "Consultant",
  internship: "Internship",
  vendor: "Vendor",
  other: "Other",
};

/** An active contract whose end date has passed is shown (and filtered) as expired. */
export function effectiveStatus(c: { status: string; end_date: string | null }, today: string) {
  return c.status === "active" && c.end_date && c.end_date < today ? "expired" : c.status;
}

export function plusDays(date: string, days: number) {
  return format(addDays(parseISO(date), days), "yyyy-MM-dd");
}

/** Active and ending within the next 30 days (inclusive of today). */
export function isExpiringSoon(c: { status: string; end_date: string | null }, today: string) {
  return c.status === "active" && !!c.end_date && c.end_date >= today && c.end_date <= plusDays(today, 30);
}

export function daysUntil(date: string, today: string) {
  return Math.round((parseISO(date).getTime() - parseISO(today).getTime()) / 86_400_000);
}
