import type { Tables } from "@/lib/database.types";

/** Performance module accent (MODULES[performance].theme). */
export const PERF_THEME = {
  pill: "bg-[#d9e7f5]",
  text: "text-[#2f6aa8]",
  solid: "bg-[#4a8ad0]",
  hex: "#4a8ad0",
};

export const GOAL_CATEGORIES = [
  { value: "business", label: "Business" },
  { value: "development", label: "Development" },
  { value: "behavioral", label: "Behavioral" },
] as const;
export type GoalCategory = (typeof GOAL_CATEGORIES)[number]["value"];

export const CATEGORY_TONE: Record<string, string> = {
  business: "bg-sky-50 text-sky-700 ring-sky-200",
  development: "bg-violet-50 text-violet-700 ring-violet-200",
  behavioral: "bg-teal-50 text-teal-700 ring-teal-200",
  organisation: "bg-indigo-50 text-indigo-700 ring-indigo-200",
};

export const GOAL_STATUS_ORDER = ["pending_approval", "draft", "rejected", "approved", "completed"] as const;
export const GOAL_STATUS_LABEL: Record<string, string> = {
  draft: "Drafts",
  pending_approval: "Pending approval",
  approved: "In progress",
  rejected: "Rejected",
  completed: "Completed",
};

/** Goal statuses that count towards the weightage total. */
export const WEIGHTED_STATUSES = ["draft", "pending_approval", "approved", "completed"];
/** Statuses the owner may edit. */
export const EDITABLE_STATUSES = ["draft", "pending_approval", "rejected"];

export const CYCLE_PHASES = ["draft", "goal_setting", "in_review", "closed"] as const;
export type CyclePhase = (typeof CYCLE_PHASES)[number];
export const PHASE_LABEL: Record<string, string> = {
  draft: "Draft",
  goal_setting: "Goal setting",
  in_review: "In review",
  closed: "Closed",
};

export const RATING_LABEL: Record<number, string> = {
  1: "Needs improvement",
  2: "Below expectations",
  3: "Meets expectations",
  4: "Exceeds expectations",
  5: "Outstanding",
};

export type Cycle = Tables<"review_cycles">;
export type Goal = Tables<"goals">;

export type Person = {
  id: string;
  full_name: string | null;
  employee_code: string;
  avatar_url: string | null;
};

export const PERSON_COLS = "id, full_name, employee_code, avatar_url";

/** The cycle to show by default: the newest open one, else the newest overall. */
export function defaultCycle(cycles: Cycle[]): Cycle | null {
  const sorted = [...cycles].sort((a, b) => b.start_date.localeCompare(a.start_date));
  return (
    sorted.find((c) => c.status === "in_review") ??
    sorted.find((c) => c.status === "goal_setting") ??
    sorted.find((c) => c.status !== "draft") ??
    sorted[0] ??
    null
  );
}

export function pickCycle(cycles: Cycle[], requested: string | string[] | undefined): Cycle | null {
  const id = typeof requested === "string" ? requested : undefined;
  return (id && cycles.find((c) => c.id === id)) || defaultCycle(cycles);
}

export function weightageTotal(goals: Pick<Goal, "status" | "weightage">[]) {
  return goals.filter((g) => WEIGHTED_STATUSES.includes(g.status)).reduce((s, g) => s + Number(g.weightage || 0), 0);
}

/** Weighted average progress (falls back to a plain average when weightage is 0). */
export function averageProgress(goals: Pick<Goal, "status" | "weightage" | "progress">[]) {
  const live = goals.filter((g) => g.status === "approved" || g.status === "completed");
  if (live.length === 0) return 0;
  const w = live.reduce((s, g) => s + Number(g.weightage || 0), 0);
  if (w > 0) return Math.round(live.reduce((s, g) => s + g.progress * Number(g.weightage || 0), 0) / w);
  return Math.round(live.reduce((s, g) => s + g.progress, 0) / live.length);
}

/**
 * Bar colour for <ProgressBar barClassName>. The `!` is needed because the shared
 * ProgressBar always adds bg-primary-500 and `cn` does not merge conflicting classes.
 */
export function progressColor(p: number) {
  if (p >= 100) return "bg-emerald-500!";
  if (p >= 60) return "bg-[#4a8ad0]!";
  if (p >= 30) return "bg-amber-400!";
  return "bg-rose-400!";
}

export function fmtRating(r: number | string | null | undefined) {
  if (r === null || r === undefined || r === "") return "—";
  return Number(r).toFixed(1);
}

export const isPhase = (v: string | null): v is CyclePhase => !!v && (CYCLE_PHASES as readonly string[]).includes(v);
