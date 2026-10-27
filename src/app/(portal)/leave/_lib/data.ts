import "server-only";
import type { Tables } from "@/lib/database.types";
import type { createClient } from "@/lib/supabase/server";
import type { HolidayLite } from "./dates";

export type DB = Awaited<ReturnType<typeof createClient>>;

export type LeaveType = Tables<"leave_types">;

export type BalanceRow = {
  type: LeaveType;
  year: number;
  allocated: number;
  used: number;
  pending: number;
  available: number;
};

export async function getLeaveTypes(supabase: DB, { activeOnly = true } = {}) {
  let q = supabase.from("leave_types").select("*").order("sort_order").order("name");
  if (activeOnly) q = q.eq("active", true);
  const { data } = await q;
  return data ?? [];
}

/**
 * Balance per leave type for one employee & year.
 * available = allocated − used − pending (pending = days in pending requests starting that year).
 */
export async function getBalances(supabase: DB, employeeId: string, year: number, types?: LeaveType[]): Promise<BalanceRow[]> {
  const leaveTypes = types ?? (await getLeaveTypes(supabase));
  const [{ data: balances }, { data: pending }] = await Promise.all([
    supabase.from("leave_balances").select("leave_type_id, allocated, used").eq("employee_id", employeeId).eq("year", year),
    supabase
      .from("leave_requests")
      .select("leave_type_id, days")
      .eq("employee_id", employeeId)
      .eq("status", "pending")
      .gte("start_date", `${year}-01-01`)
      .lte("start_date", `${year}-12-31`),
  ]);
  return leaveTypes.map((type) => {
    const b = balances?.find((x) => x.leave_type_id === type.id);
    const allocated = Number(b?.allocated ?? 0);
    const used = Number(b?.used ?? 0);
    const pend = (pending ?? []).filter((p) => p.leave_type_id === type.id).reduce((s, p) => s + Number(p.days), 0);
    return { type, year, allocated, used, pending: pend, available: allocated - used - pend };
  });
}

/** Holidays in a range that apply to this employee's location (or org-wide). */
export async function getHolidays(supabase: DB, from: string, to: string, locationId?: string | null): Promise<(HolidayLite & { id: string; type: string })[]> {
  let q = supabase.from("holidays").select("id, name, date, type, location_id").gte("date", from).lte("date", to).order("date");
  q = locationId ? q.or(`location_id.is.null,location_id.eq.${locationId}`) : q.is("location_id", null);
  const { data } = await q;
  return (data ?? []).map((h) => ({ id: h.id, name: h.name, date: h.date, type: h.type }));
}

/** Direct reports (managers) or every active employee except me (HR). */
export async function getTeam(supabase: DB, me: { id: string; isHR: boolean }) {
  let q = supabase
    .from("employees")
    .select("id, full_name, employee_code, avatar_url, date_of_joining, manager_id, location_id, designation:designations(title), department:departments(name)")
    .neq("status", "exited")
    .neq("id", me.id)
    .order("full_name");
  if (!me.isHR) q = q.eq("manager_id", me.id);
  const { data } = await q;
  return (data ?? []).map((e) => ({
    ...e,
    full_name: e.full_name ?? "",
    designation: (e.designation as { title: string } | null)?.title ?? null,
    department: (e.department as { name: string } | null)?.name ?? null,
  }));
}

export type TeamMember = Awaited<ReturnType<typeof getTeam>>[number];

export type EmbeddedEmployee = { id?: string; full_name: string | null; employee_code: string; avatar_url: string | null } | null;
export type EmbeddedType = { name: string; code: string; color: string } | null;

/** Supabase embeds can come back as object or array depending on inference. */
export function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}
