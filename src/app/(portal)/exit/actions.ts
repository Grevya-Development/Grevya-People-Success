"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee, type CurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str, bool, orgToday } from "@/lib/utils";
import { NOTICE_PERIOD_DAYS, REASON_CATEGORIES, MANAGER_CLEARANCE } from "./_components/shared";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function revalidateExit() {
  revalidatePath("/exit/resign");
  revalidatePath("/exit/status");
  revalidatePath("/exit/approvals");
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Load a resignation visible to the current user (RLS: own row or approver chain). */
async function loadResignation(supabase: Supabase, id: string | null) {
  if (!id) return null;
  const { data } = await supabase
    .from("resignations")
    .select("*, employee:employees!resignations_employee_id_fkey(id, full_name, manager_id)")
    .eq("id", id)
    .maybeSingle();
  return data as (typeof data & { employee: { id: string; full_name: string | null; manager_id: string | null } | null }) | null;
}

/**
 * May `me` act as the reporting manager on this resignation?
 * Non-HR managers only see their chain through RLS. HR may act when the
 * employee has no manager, reports to them, or is in their chain.
 */
async function canActAsManager(supabase: Supabase, me: CurrentEmployee, employeeId: string, managerId: string | null) {
  if (employeeId === me.id) return false;
  if (!me.isHR) return true; // row was visible, so RLS confirmed the chain
  if (!managerId || managerId === me.id) return true;
  const { data } = await supabase.rpc("is_manager_of", { emp: employeeId });
  return Boolean(data);
}

// ---------------------------------------------------------------------------
// Employee
// ---------------------------------------------------------------------------

export async function submitResignation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (me.status === "exited") return fail("Your exit has already been completed.");

  const category = str(fd, "reason_category");
  const reason = str(fd, "reason");
  const lastDay = str(fd, "requested_last_day");
  if (!category || !(REASON_CATEGORIES as readonly string[]).includes(category)) return fail("Choose a reason category");
  if (!reason || reason.length < 20) return fail("Please describe your reason in at least 20 characters");
  if (reason.length > 4000) return fail("Reason is too long (max 4000 characters)");
  if (!lastDay || !DATE_RE.test(lastDay)) return fail("Choose your requested last working day");
  const today = orgToday();
  if (lastDay <= today) return fail("Last working day must be after today");
  if (!bool(fd, "acknowledge")) return fail("Please confirm the acknowledgement");

  const supabase = await createClient();
  const { count } = await supabase
    .from("resignations")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", me.id)
    .in("status", ["pending_manager", "pending_hr", "approved"]);
  if ((count ?? 0) > 0) return fail("You already have an open resignation.");

  const { error } = await supabase.from("resignations").insert({
    employee_id: me.id,
    reason_category: category,
    reason,
    resignation_date: today,
    requested_last_day: lastDay,
    notice_period_days: NOTICE_PERIOD_DAYS,
    status: "pending_manager",
  });
  if (error) return fail(error.code === "23505" ? "You already have an open resignation." : dbError(error));
  revalidateExit();
  return ok("Resignation submitted to your manager", "/exit/status");
}

export async function withdrawResignation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const supabase = await createClient();
  const r = await loadResignation(supabase, str(fd, "id"));
  if (!r || r.employee_id !== me.id) return fail("Resignation not found");
  if (r.status !== "pending_manager" && r.status !== "pending_hr") return fail("This resignation can no longer be withdrawn");

  const { error } = await supabase
    .from("resignations")
    .update({ status: "withdrawn" })
    .eq("id", r.id)
    .in("status", ["pending_manager", "pending_hr"]);
  if (error) return fail(dbError(error));
  revalidateExit();
  return ok("Resignation withdrawn");
}

// ---------------------------------------------------------------------------
// Manager / HR decisions
// ---------------------------------------------------------------------------

export async function managerApproveResignation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isManager) return fail("Only managers can approve resignations");
  const supabase = await createClient();
  const r = await loadResignation(supabase, str(fd, "id"));
  if (!r) return fail("Resignation not found");
  if (r.status !== "pending_manager") return fail("This resignation is not awaiting manager approval");
  if (!(await canActAsManager(supabase, me, r.employee_id, r.employee?.manager_id ?? null))) {
    return fail("Only the reporting manager can approve this resignation");
  }

  const { error } = await supabase
    .from("resignations")
    .update({ status: "pending_hr", manager_remarks: str(fd, "remarks"), manager_action_at: new Date().toISOString() })
    .eq("id", r.id)
    .eq("status", "pending_manager");
  if (error) return fail(dbError(error));
  revalidateExit();
  return ok("Approved and sent to HR");
}

export async function hrApproveResignation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can give final approval");
  const supabase = await createClient();
  const r = await loadResignation(supabase, str(fd, "id"));
  if (!r) return fail("Resignation not found");
  if (r.employee_id === me.id) return fail("You cannot approve your own resignation");
  if (r.status !== "pending_hr") return fail("This resignation is not awaiting HR approval");

  const lastDay = str(fd, "approved_last_day");
  if (!lastDay || !DATE_RE.test(lastDay)) return fail("Set the approved last working day");
  if (lastDay < r.resignation_date) return fail("Last working day cannot be before the resignation date");

  const { error } = await supabase
    .from("resignations")
    .update({
      status: "approved",
      approved_last_day: lastDay,
      hr_remarks: str(fd, "remarks"),
      hr_action_at: new Date().toISOString(),
    })
    .eq("id", r.id)
    .eq("status", "pending_hr");
  if (error) return fail(dbError(error));
  revalidateExit();
  return ok("Resignation approved — clearance started");
}

export async function rejectResignation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isManager) return fail("Only approvers can reject resignations");
  const remarks = str(fd, "remarks");
  if (!remarks) return fail("Please add a reason for rejecting");
  const supabase = await createClient();
  const r = await loadResignation(supabase, str(fd, "id"));
  if (!r) return fail("Resignation not found");
  const now = new Date().toISOString();

  if (r.status === "pending_manager") {
    if (!(await canActAsManager(supabase, me, r.employee_id, r.employee?.manager_id ?? null))) {
      return fail("Only the reporting manager can act on this resignation");
    }
    const { error } = await supabase
      .from("resignations")
      .update({ status: "rejected", manager_remarks: remarks, manager_action_at: now })
      .eq("id", r.id)
      .eq("status", "pending_manager");
    if (error) return fail(dbError(error));
  } else if (r.status === "pending_hr") {
    if (!me.isHR) return fail("Only HR can act on this resignation");
    if (r.employee_id === me.id) return fail("You cannot act on your own resignation");
    const { error } = await supabase
      .from("resignations")
      .update({ status: "rejected", hr_remarks: remarks, hr_action_at: now })
      .eq("id", r.id)
      .eq("status", "pending_hr");
    if (error) return fail(dbError(error));
  } else {
    return fail("This resignation is not pending approval");
  }
  revalidateExit();
  return ok("Resignation rejected");
}

// ---------------------------------------------------------------------------
// Clearance
// ---------------------------------------------------------------------------

async function loadClearance(supabase: Supabase, id: string | null) {
  if (!id) return null;
  const { data } = await supabase
    .from("exit_clearances")
    .select("id, department, status, resignation:resignations!exit_clearances_resignation_id_fkey(id, status, employee_id)")
    .eq("id", id)
    .maybeSingle();
  return data as
    | (Omit<NonNullable<typeof data>, "resignation"> & { resignation: { id: string; status: string; employee_id: string } | null })
    | null;
}

export async function markClearanceCleared(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isManager) return fail("Only approvers can clear exit items");
  const supabase = await createClient();
  const c = await loadClearance(supabase, str(fd, "id"));
  if (!c || !c.resignation) return fail("Clearance item not found");
  if (c.resignation.employee_id === me.id) return fail("You cannot clear your own exit");
  if (c.resignation.status !== "approved") return fail("Clearance is only open for approved resignations");
  if (!me.isHR && c.department !== MANAGER_CLEARANCE) return fail("Managers can only sign off the Reporting Manager clearance");
  if (c.status === "cleared") return fail("Already cleared");

  const { error } = await supabase
    .from("exit_clearances")
    .update({ status: "cleared", remarks: str(fd, "remarks"), cleared_by: me.id, cleared_at: new Date().toISOString() })
    .eq("id", c.id);
  if (error) return fail(dbError(error));
  revalidateExit();
  return ok(`${c.department} clearance marked done`);
}

export async function reopenClearance(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can reopen a clearance item");
  const supabase = await createClient();
  const c = await loadClearance(supabase, str(fd, "id"));
  if (!c || !c.resignation) return fail("Clearance item not found");
  if (c.resignation.status !== "approved") return fail("This exit is no longer in clearance");

  const { error } = await supabase
    .from("exit_clearances")
    .update({ status: "pending", cleared_by: null, cleared_at: null, remarks: str(fd, "remarks") })
    .eq("id", c.id);
  if (error) return fail(dbError(error));
  revalidateExit();
  return ok(`${c.department} clearance reopened`);
}

export async function completeExit(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can complete an exit");
  const supabase = await createClient();
  const r = await loadResignation(supabase, str(fd, "id"));
  if (!r) return fail("Resignation not found");
  if (r.employee_id === me.id) return fail("You cannot complete your own exit");
  if (r.status !== "approved") return fail("Only approved resignations can be completed");

  const { data: items, error: itemsError } = await supabase.from("exit_clearances").select("status").eq("resignation_id", r.id);
  if (itemsError) return fail(dbError(itemsError));
  if (!items || items.length === 0) return fail("No clearance checklist found for this exit");
  const pending = items.filter((i) => i.status !== "cleared").length;
  if (pending > 0) return fail(`${pending} clearance item${pending === 1 ? " is" : "s are"} still pending`);

  const { error } = await supabase.from("resignations").update({ status: "completed" }).eq("id", r.id).eq("status", "approved");
  if (error) return fail(dbError(error));
  revalidateExit();
  return ok(`Exit completed for ${r.employee?.full_name ?? "employee"}`);
}
