"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbError, type ActionState } from "@/lib/actions";
import { str } from "@/lib/utils";

export type AccountResult = (NonNullable<ActionState> & { password?: string; email?: string }) | null;
const fail = (error: string): AccountResult => ({ ok: false, error });

const ROLES = ["employee", "manager", "hr_admin", "super_admin"] as const;
const UUID = /^[0-9a-f-]{36}$/i;
const BAN_FOREVER = "876000h"; // ~100 years

function tempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let p = "";
  for (let i = 0; i < 10; i++) p += chars[randomInt(chars.length)];
  return `${p}@${randomInt(10, 99)}`;
}

async function context(fd: FormData) {
  const me = await getCurrentEmployee();
  if (!me) return { error: "Not signed in" } as const;
  if (!me.isSuperAdmin) return { error: "Only a Super Admin can manage accounts" } as const;
  const id = str(fd, "employee_id");
  if (!id || !UUID.test(id)) return { error: "Choose an employee" } as const;
  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("id, email, full_name, role, user_id, status").eq("id", id).maybeSingle();
  if (!emp) return { error: "Employee not found" } as const;
  return { me, admin, emp } as const;
}

async function superAdminCount(admin: ReturnType<typeof createAdminClient>) {
  const { count } = await admin.from("employees").select("id", { count: "exact", head: true }).eq("role", "super_admin").neq("status", "exited");
  return count ?? 0;
}

function done(message: string, extra: Partial<AccountResult> = {}): AccountResult {
  revalidatePath("/admin/accounts");
  revalidatePath("/hris/employees");
  return { ok: true, message, ...extra };
}

/** Create a login (or link an existing auth user) with a temporary password. */
export async function createLogin(_prev: AccountResult, fd: FormData): Promise<AccountResult> {
  const ctx = await context(fd);
  if ("error" in ctx) return fail(ctx.error!);
  const { admin, emp } = ctx;
  if (emp.user_id) return fail("This employee already has a login");
  if (emp.status === "exited") return fail("This employee has exited");
  const password = str(fd, "password") ?? tempPassword();
  if (password.length < 8) return fail("Password must be at least 8 characters");

  const { data, error } = await admin.auth.admin.createUser({ email: emp.email, password, email_confirm: true });
  let userId = data?.user?.id;
  if (error) {
    if (!/already/i.test(error.message)) return fail(error.message);
    // An auth user with this email exists — find it, reset its password and link it.
    const found = await findAuthUserByEmail(admin, emp.email);
    if (!found) return fail(error.message);
    const upd = await admin.auth.admin.updateUserById(found, { password, ban_duration: "none" });
    if (upd.error) return fail(upd.error.message);
    userId = found;
  }
  const { error: linkErr } = await admin.from("employees").update({ user_id: userId }).eq("id", emp.id);
  if (linkErr) return fail(dbError(linkErr));
  return done(`Login created for ${emp.full_name}`, { password, email: emp.email });
}

async function findAuthUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  for (let page = 1; page < 50; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const hit = data?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (!data || data.users.length < 1000) return null;
  }
  return null;
}

export async function resetPassword(_prev: AccountResult, fd: FormData): Promise<AccountResult> {
  const ctx = await context(fd);
  if ("error" in ctx) return fail(ctx.error!);
  const { admin, emp } = ctx;
  if (!emp.user_id) return fail("This employee doesn't have a login yet");
  const password = str(fd, "password") ?? tempPassword();
  if (password.length < 8) return fail("Password must be at least 8 characters");
  const { error } = await admin.auth.admin.updateUserById(emp.user_id, { password });
  if (error) return fail(error.message);
  return done(`Password reset for ${emp.full_name}`, { password, email: emp.email });
}

export async function setLoginEnabled(_prev: AccountResult, fd: FormData): Promise<AccountResult> {
  const ctx = await context(fd);
  if ("error" in ctx) return fail(ctx.error!);
  const { me, admin, emp } = ctx;
  const enable = str(fd, "enable") === "true";
  if (!emp.user_id) return fail("This employee doesn't have a login");
  if (!enable && emp.id === me.id) return fail("You can't disable your own login");
  if (!enable && emp.role === "super_admin" && (await superAdminCount(admin)) <= 1) return fail("You can't disable the last Super Admin");
  const { error } = await admin.auth.admin.updateUserById(emp.user_id, { ban_duration: enable ? "none" : BAN_FOREVER });
  if (error) return fail(error.message);
  return done(enable ? `Login enabled for ${emp.full_name}` : `Login disabled for ${emp.full_name} — they can no longer sign in`);
}

export async function removeLogin(_prev: AccountResult, fd: FormData): Promise<AccountResult> {
  const ctx = await context(fd);
  if ("error" in ctx) return fail(ctx.error!);
  const { me, admin, emp } = ctx;
  if (!emp.user_id) return fail("This employee doesn't have a login");
  if (emp.id === me.id) return fail("You can't remove your own login");
  if (emp.role === "super_admin" && (await superAdminCount(admin)) <= 1) return fail("You can't remove the last Super Admin");
  const { error } = await admin.auth.admin.deleteUser(emp.user_id);
  if (error) return fail(error.message);
  await admin.from("employees").update({ user_id: null }).eq("id", emp.id);
  return done(`Login removed for ${emp.full_name}. Their employee record is kept.`);
}

export async function changeRole(_prev: AccountResult, fd: FormData): Promise<AccountResult> {
  const ctx = await context(fd);
  if ("error" in ctx) return fail(ctx.error!);
  const { me, admin, emp } = ctx;
  const role = str(fd, "role");
  if (!role || !ROLES.includes(role as (typeof ROLES)[number])) return fail("Choose a valid role");
  if (role === emp.role) return { ok: true, message: "No change" };
  if (emp.id === me.id && role !== "super_admin") return fail("You can't remove your own Super Admin access. Ask another Super Admin.");
  if (emp.role === "super_admin" && (await superAdminCount(admin)) <= 1) return fail("You can't demote the last Super Admin");
  // User-scoped client so the database role guard applies.
  const supabase = await createClient();
  const { error } = await supabase.from("employees").update({ role }).eq("id", emp.id);
  if (error) return fail(dbError(error));
  return done(`${emp.full_name} is now ${ROLE_TEXT[role]}`);
}

const ROLE_TEXT: Record<string, string> = { employee: "an Employee", manager: "a Manager", hr_admin: "an HR Admin", super_admin: "a Super Admin" };
