import { formatDate } from "@/lib/utils";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
] as const;

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export const MARITAL_STATUSES = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
] as const;

export const ROLE_LABELS: Record<string, string> = {
  employee: "Employee",
  manager: "Manager",
  hr_admin: "HR Admin",
  super_admin: "Super Admin",
};

export const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  contract: "Contract",
  intern: "Intern",
};

/** "••••••1234" — keeps the last `visible` characters. */
export function mask(value: string | null | undefined, visible = 4) {
  if (!value) return "—";
  const v = value.trim();
  if (v.length <= visible) return "•".repeat(Math.max(4, v.length));
  return "•".repeat(Math.min(8, v.length - visible)) + v.slice(-visible);
}

/** "Jun 2018 – Present" */
export function dateRange(start: string | null, end: string | null) {
  if (!start && !end) return "Dates not added";
  const s = start ? formatDate(start, "MMM yyyy") : "—";
  const e = end ? formatDate(end, "MMM yyyy") : "Present";
  return `${s} – ${e}`;
}

/** Link to a profile page, keeping ?id= when HR is viewing someone else. */
export function profileHref(path: string, targetId: string, isSelf: boolean) {
  return isSelf ? path : `${path}?id=${targetId}`;
}
