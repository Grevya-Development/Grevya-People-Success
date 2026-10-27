import { MODULES } from "@/lib/nav";

export const recruitTheme = MODULES.find((m) => m.key === "recruit")!.theme;

export const STAGES = ["applied", "screening", "interview", "offer", "hired", "rejected"] as const;
export type Stage = (typeof STAGES)[number];

/** The happy path shown on steppers (rejected is a terminal side-exit). */
export const PIPELINE: Stage[] = ["applied", "screening", "interview", "offer", "hired"];

export const STAGE_LABEL: Record<Stage, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

/** Column header colours for the kanban board. */
export const STAGE_COLOR: Record<Stage, string> = {
  applied: "bg-slate-500",
  screening: "bg-sky-500",
  interview: "bg-[#8a6cc6]",
  offer: "bg-teal-500",
  hired: "bg-emerald-600",
  rejected: "bg-red-500",
};

export const JOB_STATUSES = ["open", "on_hold", "closed"] as const;
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "intern"] as const;
export const CANDIDATE_SOURCES = ["portal", "agency", "direct"] as const;
export const ALL_SOURCES = ["referral", "portal", "agency", "direct"] as const;
export const INTERVIEW_MODES = ["video", "in_person", "phone"] as const;
export const INTERVIEW_RESULTS = ["pending", "pass", "fail"] as const;

export function isStage(v: string | null): v is Stage {
  return !!v && (STAGES as readonly string[]).includes(v);
}

export function experienceLabel(min: number, max: number) {
  if (min === max) return `${min} yrs`;
  return `${min}–${max} yrs`;
}
