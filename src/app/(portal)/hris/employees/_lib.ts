/** Shared (client + server safe) constants and types for the Employee List module. */

export const ROLES = ["employee", "manager", "hr_admin"] as const;
export const STATUSES = ["active", "notice_period", "exited"] as const;
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "intern"] as const;
export const GENDERS = ["male", "female", "other"] as const;

export const ROLE_LABELS: Record<string, string> = {
  employee: "Employee",
  manager: "Manager",
  hr_admin: "HR Admin",
};

export type Option = { id: string; label: string };

export type EmployeeFormValues = {
  id?: string;
  first_name: string;
  last_name: string;
  email: string;
  employee_code: string;
  phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  date_of_joining: string;
  department_id: string | null;
  designation_id: string | null;
  location_id: string | null;
  manager_id: string | null;
  role: string;
  status: string;
  employment_type: string;
};

/** Result of create / update / login actions — carries a one-time password when a login was provisioned. */
export type EmployeeResult = {
  ok: boolean;
  error?: string;
  message?: string;
  warning?: string;
  employeeId?: string;
  login?: { email: string; password: string };
} | null;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
