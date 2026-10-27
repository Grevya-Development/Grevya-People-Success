"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbError } from "@/lib/actions";
import { str, bool, orgToday } from "@/lib/utils";
import { EMPLOYMENT_TYPES, GENDERS, ROLES, STATUSES, UUID_RE, isAdminRole, type EmployeeResult } from "./_lib";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,19}$/;

const failure = (error: string): EmployeeResult => ({ ok: false, error });

async function hrOnly() {
  const me = await getCurrentEmployee();
  return me?.isHR ? me : null;
}

function validDate(v: string | null) {
  return v !== null && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));
}

type OrgFields = {
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

function parseEmployee(fd: FormData): { data?: OrgFields; error?: string } {
  const first_name = str(fd, "first_name");
  const last_name = str(fd, "last_name") ?? "";
  const email = str(fd, "email")?.toLowerCase() ?? null;
  const employee_code = str(fd, "employee_code")?.toUpperCase() ?? null;
  const phone = str(fd, "phone");
  const gender = str(fd, "gender");
  const date_of_birth = str(fd, "date_of_birth");
  const date_of_joining = str(fd, "date_of_joining");
  const department_id = str(fd, "department_id");
  const designation_id = str(fd, "designation_id");
  const location_id = str(fd, "location_id");
  const manager_id = str(fd, "manager_id");
  const role = str(fd, "role") ?? "employee";
  const status = str(fd, "status") ?? "active";
  const employment_type = str(fd, "employment_type") ?? "full_time";

  if (!first_name) return { error: "First name is required" };
  if (first_name.length > 60 || last_name.length > 60) return { error: "Names must be 60 characters or fewer" };
  if (!email || !EMAIL_RE.test(email) || email.length > 120) return { error: "Enter a valid work email" };
  if (!employee_code || !CODE_RE.test(employee_code))
    return { error: "Employee code must be 2–20 letters, digits, '-' or '_'" };
  if (phone && !PHONE_RE.test(phone)) return { error: "Enter a valid phone number" };
  if (gender && !(GENDERS as readonly string[]).includes(gender)) return { error: "Invalid gender" };
  if (!date_of_joining || !validDate(date_of_joining)) return { error: "Date of joining is required" };
  if (date_of_birth) {
    if (!validDate(date_of_birth)) return { error: "Invalid date of birth" };
    if (date_of_birth > orgToday()) return { error: "Date of birth can't be in the future" };
    if (date_of_birth >= date_of_joining) return { error: "Date of birth must be before the date of joining" };
  }
  for (const [label, v] of [
    ["department", department_id],
    ["designation", designation_id],
    ["location", location_id],
    ["manager", manager_id],
  ] as const) {
    if (v && !UUID_RE.test(v)) return { error: `Invalid ${label}` };
  }
  if (!(ROLES as readonly string[]).includes(role)) return { error: "Invalid role" };
  if (!(STATUSES as readonly string[]).includes(status)) return { error: "Invalid status" };
  if (!(EMPLOYMENT_TYPES as readonly string[]).includes(employment_type)) return { error: "Invalid employment type" };

  return {
    data: {
      first_name,
      last_name,
      email,
      employee_code,
      phone,
      gender,
      date_of_birth,
      date_of_joining,
      department_id,
      designation_id,
      location_id,
      manager_id,
      role,
      status,
      employment_type,
    },
  };
}

/** Manager must exist, not be exited, not be the employee, and not create a reporting loop. */
async function checkManager(supabase: Awaited<ReturnType<typeof createClient>>, employeeId: string | null, managerId: string | null) {
  if (!managerId) return null;
  if (employeeId && managerId === employeeId) return "An employee can't report to themselves";
  const { data: mgr } = await supabase.from("employees").select("id, status").eq("id", managerId).maybeSingle();
  if (!mgr) return "Selected manager was not found";
  if (mgr.status === "exited") return "Selected manager has exited the organisation";
  if (!employeeId) return null;
  const { data: all } = await supabase.from("employees").select("id, manager_id");
  const parent = new Map((all ?? []).map((e) => [e.id, e.manager_id]));
  let cur: string | null | undefined = managerId;
  for (let i = 0; i < 50 && cur; i++) {
    if (cur === employeeId) return "That manager reports to this employee — it would create a reporting loop";
    cur = parent.get(cur);
  }
  return null;
}

function generatePassword(length = 12) {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "@#$%&*!?"];
  const all = sets.join("");
  const rand = (n: number) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % n;
  };
  const chars = sets.map((s) => s[rand(s.length)]);
  while (chars.length < length) chars.push(all[rand(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function checkPassword(pw: string | null): { password?: string; error?: string } {
  if (!pw) return { password: generatePassword() };
  if (pw.length < 8) return { error: "Password must be at least 8 characters" };
  if (pw.length > 72) return { error: "Password must be 72 characters or fewer" };
  return { password: pw };
}

type Admin = ReturnType<typeof createAdminClient>;

async function findAuthUserByEmail(admin: Admin, email: string) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) return null;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/**
 * Create (or reset) the auth login for an employee and make sure it is linked
 * via employees.user_id. Caller must have verified HR.
 */
async function provisionLogin(employeeId: string, email: string, password: string, fullName: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: emp, error: empErr } = await admin.from("employees").select("user_id").eq("id", employeeId).single();
  if (empErr || !emp) return "Employee not found";

  if (emp.user_id) {
    const { error } = await admin.auth.admin.updateUserById(emp.user_id, { password, email, email_confirm: true });
    return error ? error.message : null;
  }

  let userId: string;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (created?.user) {
    userId = created.user.id;
  } else {
    // The auth user may already exist (so the link trigger never fired) — link it ourselves.
    const existing = await findAuthUserByEmail(admin, email);
    if (!existing) return createErr?.message ?? "Could not create the login";
    const { data: other } = await admin.from("employees").select("id, full_name").eq("user_id", existing.id).maybeSingle();
    if (other && other.id !== employeeId) return `A login with this email is already linked to ${other.full_name}`;
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    if (error) return error.message;
    userId = existing.id;
  }

  const { data: after } = await admin.from("employees").select("user_id").eq("id", employeeId).single();
  if (after?.user_id !== userId) {
    const { error } = await admin.from("employees").update({ user_id: userId }).eq("id", employeeId);
    if (error) return dbError(error);
  }
  return null;
}

function revalidateEmployees(id?: string) {
  revalidatePath("/hris/employees");
  revalidatePath("/directory");
  revalidatePath("/hris/org-chart");
  if (id) revalidatePath(`/hris/employees/${id}/edit`);
}

export async function createEmployee(_prev: EmployeeResult, fd: FormData): Promise<EmployeeResult> {
  const me = await hrOnly();
  if (!me) return failure("Only HR can add employees");
  const { data, error } = parseEmployee(fd);
  if (!data) return failure(error ?? "Invalid input");

  if (isAdminRole(data.role) && !me.isSuperAdmin) return failure("Only a Super Admin can grant admin roles");

  const wantsLogin = bool(fd, "create_login");
  let password: string | undefined;
  if (wantsLogin) {
    if (data.status === "exited") return failure("Exited employees can't be given a login");
    const pw = checkPassword(str(fd, "password"));
    if (!pw.password) return failure(pw.error ?? "Invalid password");
    password = pw.password;
  }

  const supabase = await createClient();
  const mgrErr = await checkManager(supabase, null, data.manager_id);
  if (mgrErr) return failure(mgrErr);

  const { data: row, error: insErr } = await supabase.from("employees").insert(data).select("id, full_name").single();
  if (insErr || !row) {
    if (insErr?.code === "23505") return failure("An employee with this email or employee code already exists");
    return failure(dbError(insErr));
  }

  const warnings: string[] = [];
  const { error: privErr } = await supabase.from("employee_private").insert({ employee_id: row.id });
  if (privErr) warnings.push("private record: " + dbError(privErr));

  const year = Number(orgToday().slice(0, 4));
  const { data: types } = await supabase.from("leave_types").select("id, annual_quota").eq("active", true);
  if (types && types.length > 0) {
    const { error: balErr } = await supabase.from("leave_balances").insert(
      types.map((t) => ({ employee_id: row.id, leave_type_id: t.id, year, allocated: Number(t.annual_quota) || 0, used: 0 })),
    );
    if (balErr) warnings.push("leave balances: " + dbError(balErr));
  }

  let login: { email: string; password: string } | undefined;
  if (wantsLogin && password) {
    const loginErr = await provisionLogin(row.id, data.email, password, row.full_name ?? data.first_name);
    if (loginErr) warnings.push("login: " + loginErr);
    else login = { email: data.email, password };
  }

  revalidateEmployees(row.id);
  return {
    ok: true,
    employeeId: row.id,
    message: `${row.full_name} added`,
    warning: warnings.length ? `Employee created, but some steps failed — ${warnings.join("; ")}` : undefined,
    login,
  };
}

export async function updateEmployee(_prev: EmployeeResult, fd: FormData): Promise<EmployeeResult> {
  const me = await hrOnly();
  if (!me) return failure("Only HR can edit employee records");
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return failure("Invalid employee");
  const { data, error } = parseEmployee(fd);
  if (!data) return failure(error ?? "Invalid input");

  const supabase = await createClient();
  const { data: current } = await supabase.from("employees").select("id, email, user_id, role").eq("id", id).maybeSingle();
  if (!current) return failure("Employee not found");

  if (id === me.id) {
    if (data.role !== current.role) return failure("You can't change your own role");
    if (data.status === "exited") return failure("You can't mark yourself as exited");
  }
  if (data.role !== current.role && (isAdminRole(data.role) || isAdminRole(current.role)) && !me.isSuperAdmin)
    return failure("Only a Super Admin can grant or remove admin roles");
  // Changing an admin's sign-in email would let a non-super HR take over that account.
  if (isAdminRole(current.role) && id !== me.id && !me.isSuperAdmin && current.user_id && current.email.toLowerCase() !== data.email)
    return failure("Only a Super Admin can change an admin's sign-in email");

  const mgrErr = await checkManager(supabase, id, data.manager_id);
  if (mgrErr) return failure(mgrErr);

  const { error: upErr } = await supabase.from("employees").update(data).eq("id", id);
  if (upErr) {
    if (upErr.code === "23505") return failure("Another employee already uses this email or employee code");
    return failure(dbError(upErr));
  }

  let warning: string | undefined;
  if (current.user_id && current.email.toLowerCase() !== data.email) {
    const admin = createAdminClient();
    const { error: authErr } = await admin.auth.admin.updateUserById(current.user_id, { email: data.email, email_confirm: true });
    if (authErr) warning = `Saved, but the login email couldn't be changed: ${authErr.message}`;
  }

  revalidateEmployees(id);
  revalidatePath("/profile");
  return { ok: true, employeeId: id, message: "Employee updated", warning };
}

export async function setEmployeeLogin(_prev: EmployeeResult, fd: FormData): Promise<EmployeeResult> {
  const me = await hrOnly();
  if (!me) return failure("Only HR can manage logins");
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return failure("Invalid employee");
  const pw = checkPassword(str(fd, "password"));
  if (!pw.password) return failure(pw.error ?? "Invalid password");

  const supabase = await createClient();
  const { data: emp } = await supabase.from("employees").select("id, email, full_name, status, role").eq("id", id).maybeSingle();
  if (!emp) return failure("Employee not found");
  if (emp.status === "exited") return failure("Exited employees can't be given a login");
  if (isAdminRole(emp.role) && emp.id !== me.id && !me.isSuperAdmin) return failure("Only a Super Admin can reset an admin's login");

  const err = await provisionLogin(emp.id, emp.email.toLowerCase(), pw.password, emp.full_name ?? emp.email);
  if (err) return failure(err);

  revalidateEmployees(id);
  return { ok: true, employeeId: id, message: "Login is ready", login: { email: emp.email, password: pw.password } };
}
