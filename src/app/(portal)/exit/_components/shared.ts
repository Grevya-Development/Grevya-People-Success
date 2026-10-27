import type { Tables } from "@/lib/database.types";

export const NOTICE_PERIOD_DAYS = 60;

export const REASON_CATEGORIES = [
  "Better opportunity",
  "Higher studies",
  "Relocation",
  "Personal / family reasons",
  "Health",
  "Compensation",
  "Career change",
  "Other",
] as const;

/** Resignee comment limit (characters). */
export const COMMENT_MAX = 3000;

/** Resignation attachment: PDF, image or Word document up to 10 MB. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx";
export const ATTACHMENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const ATTACHMENT_EXT = /\.(pdf|png|jpe?g|webp|docx?)$/i;

/** Statuses that count as an "open" resignation (one per employee). */
export const OPEN_STATUSES = ["pending_manager", "pending_hr", "approved"] as const;
/** Statuses the employee may still withdraw from. */
export const WITHDRAWABLE = ["pending_manager", "pending_hr"] as const;

export const MANAGER_CLEARANCE = "Reporting Manager";

/** Exit module accent (MODULES[exit].theme). */
export const EXIT_THEME = {
  pill: "bg-[#f7dcd8]",
  text: "text-[#b2463a]",
  solid: "bg-[#d9675a]",
  /** For <ProgressBar barClassName>: `!` beats the bar's built-in bg-primary-500 (cn does not merge classes). */
  bar: "bg-[#d9675a]!",
};

export type ClearanceRow = Pick<Tables<"exit_clearances">, "id" | "department" | "status" | "remarks" | "cleared_at"> & {
  cleared_by_emp: { full_name: string | null } | null;
};

export type ResignationWithClearances = Tables<"resignations"> & { exit_clearances: ClearanceRow[] };

export type ExitEmployee = {
  id: string;
  full_name: string | null;
  employee_code: string;
  avatar_url: string | null;
  manager_id: string | null;
  department: { name: string } | null;
  designation: { title: string } | null;
};

export type ResignationRow = ResignationWithClearances & { employee: ExitEmployee | null };

export const CLEARANCE_ORDER = [MANAGER_CLEARANCE, "IT", "Finance", "Admin", "HR"];

export function sortClearances<T extends { department: string }>(rows: T[]): T[] {
  const idx = (d: string) => {
    const i = CLEARANCE_ORDER.indexOf(d);
    return i === -1 ? 99 : i;
  };
  return [...rows].sort((a, b) => idx(a.department) - idx(b.department));
}
