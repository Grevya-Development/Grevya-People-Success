import type { Json, Tables } from "@/lib/database.types";
import { moduleFor } from "@/lib/nav";

export type CourseModule = { title: string; duration_minutes: number };
export type Course = Tables<"courses">;
export type Enrollment = Tables<"course_enrollments">;

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];

export const learningTheme = moduleFor("learning")!.theme;

/** Safely read courses.modules jsonb. */
export function parseModules(raw: Json | null | undefined): CourseModule[] {
  if (!Array.isArray(raw)) return [];
  const out: CourseModule[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object" || Array.isArray(m)) continue;
    const title = typeof m.title === "string" ? m.title.trim() : "";
    const mins = Number(m.duration_minutes);
    if (!title) continue;
    out.push({ title, duration_minutes: Number.isFinite(mins) && mins > 0 ? Math.round(mins) : 0 });
  }
  return out;
}

/** How many modules a progress % represents. */
export function completedModules(progress: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(total, Math.max(0, Math.round((progress / 100) * total)));
}

const CATEGORY_STYLES: Record<string, { band: string; chip: string; dot: string }> = {
  technical: { band: "from-cyan-500 to-teal-600", chip: "bg-cyan-50 text-cyan-700 ring-cyan-200", dot: "bg-cyan-500" },
  compliance: { band: "from-rose-500 to-pink-600", chip: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" },
  leadership: { band: "from-violet-500 to-indigo-600", chip: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500" },
  "soft skills": { band: "from-amber-400 to-orange-500", chip: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  product: { band: "from-emerald-500 to-green-600", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  sales: { band: "from-orange-500 to-red-500", chip: "bg-orange-50 text-orange-700 ring-orange-200", dot: "bg-orange-500" },
};
const FALLBACK_STYLES = [
  { band: "from-sky-500 to-blue-600", chip: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
  { band: "from-fuchsia-500 to-purple-600", chip: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200", dot: "bg-fuchsia-500" },
  { band: "from-lime-500 to-emerald-600", chip: "bg-lime-50 text-lime-700 ring-lime-200", dot: "bg-lime-500" },
  { band: "from-teal-500 to-cyan-700", chip: "bg-teal-50 text-teal-700 ring-teal-200", dot: "bg-teal-500" },
  { band: "from-indigo-500 to-blue-700", chip: "bg-indigo-50 text-indigo-700 ring-indigo-200", dot: "bg-indigo-500" },
];

export function categoryStyle(category: string | null | undefined) {
  const key = (category ?? "").trim().toLowerCase();
  if (CATEGORY_STYLES[key]) return CATEGORY_STYLES[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return FALLBACK_STYLES[h % FALLBACK_STYLES.length];
}

/** Whole days from today (yyyy-MM-dd) to `due`; negative = overdue. */
export function daysUntil(due: string | null | undefined, today: string) {
  if (!due) return null;
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${due}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export function dueLabel(days: number | null) {
  if (days === null) return null;
  if (days < 0) return `Overdue by ${-days} day${days === -1 ? "" : "s"}`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

/** Stable, human-friendly certificate number derived from the enrollment id. */
export function certificateId(enrollmentId: string) {
  const hex = enrollmentId.replace(/-/g, "").toUpperCase();
  return `GRV-LRN-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(-4)}`;
}

export function formatHours(h: number) {
  const v = Math.round(h * 10) / 10;
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}h`;
}
