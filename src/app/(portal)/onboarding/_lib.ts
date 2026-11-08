/** Shared (client + server safe) onboarding constants. */

export const OWNERS = ["hr", "it", "finance", "manager", "employee"] as const;
export type Owner = (typeof OWNERS)[number];

export const OWNER_LABELS: Record<Owner, string> = {
  hr: "HR",
  it: "IT",
  finance: "Finance",
  manager: "Manager",
  employee: "Joinee",
};

export const AUTO_LABELS: Record<string, string> = {
  login: "Ticks off when a login exists",
  offer_letter: "Ticks off when an offer letter is issued",
  appointment_letter: "Ticks off when an appointment letter is issued",
  contract: "Ticks off when an employment contract is recorded",
  bank_details: "Ticks off when PAN and bank details are added",
  policies: "Ticks off when every required policy is accepted",
  salary_structure: "Ticks off when a salary structure is set",
  it_setup: "Opens a Service Desk request; ticks off when IT resolves it",
  goals: "Ticks off when the first goal is created",
  confirmation: "Ticks off when a confirmation letter is issued",
};

export type TaskRow = {
  id: string;
  employee_id: string;
  template_id: string | null;
  title: string;
  description: string | null;
  owner: Owner;
  auto_key: string | null;
  due_date: string | null;
  status: "pending" | "done" | "skipped";
  completed_at: string | null;
  note: string | null;
  link: string | null;
  link_label: string | null;
  sort_order: number;
  completer: { full_name: string | null } | null;
};

/** Where to go to get an automatic task done. `self` = the viewer is the joinee. */
export function taskActionHref(autoKey: string | null, employeeId: string, opts: { isHR: boolean; self: boolean }): { href: string; label: string } | null {
  switch (autoKey) {
    case "offer_letter":
    case "appointment_letter":
    case "confirmation":
      return opts.isHR ? { href: `/hris/admin/letters?tab=issue&employee=${employeeId}`, label: "Issue letter" } : null;
    case "contract":
      return opts.isHR ? { href: "/hris/contracts", label: "Add contract" } : null;
    case "salary_structure":
      return opts.isHR ? { href: "/payroll/admin?tab=structures", label: "Set salary" } : null;
    case "login":
      return opts.isHR ? { href: `/hris/employees/${employeeId}/edit`, label: "Create login" } : null;
    case "bank_details":
      // The PAN / bank form lives on the personal details page.
      return opts.self ? { href: "/profile/personal", label: "Add bank details" } : opts.isHR ? { href: `/profile/personal?id=${employeeId}`, label: "Open profile" } : null;
    case "policies":
      return { href: "/hris/policies", label: opts.self ? "Read policies" : "Policies" };
    case "goals":
      return { href: opts.self ? "/performance/goals" : "/performance/team-goals", label: "Goals" };
    default:
      return null;
  }
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
