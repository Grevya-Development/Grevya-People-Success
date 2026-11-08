"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbError, fail, ok, type ActionState } from "@/lib/actions";
import { num, str } from "@/lib/utils";
import { OWNERS } from "./_lib";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AUTO_KEYS = ["login", "offer_letter", "appointment_letter", "contract", "bank_details", "policies", "salary_structure", "it_setup", "goals", "confirmation"];

function refresh(employeeId?: string | null) {
  revalidatePath("/hris/onboarding");
  revalidatePath("/onboarding");
  revalidatePath("/home");
  if (employeeId) revalidatePath(`/onboarding/${employeeId}`);
}

/** Tick off, reopen or skip a task (permissions are checked in the database). */
export async function setTaskStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!id || !UUID.test(id)) return fail("Invalid task");
  if (status !== "done" && status !== "pending" && status !== "skipped") return fail("Invalid status");
  const supabase = await createClient();
  const { data: task } = await supabase.from("onboarding_tasks").select("employee_id").eq("id", id).maybeSingle();
  const { error } = await supabase.rpc("set_onboarding_task", { p_task: id, p_status: status, p_note: str(fd, "remarks") ?? undefined });
  if (error) return fail(dbError(error));
  refresh(task?.employee_id);
  return ok(status === "done" ? "Marked as done" : status === "skipped" ? "Task skipped" : "Task reopened");
}

/** HR: start onboarding for an existing employee. */
export async function startOnboarding(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me?.isHR) return fail("Only HR can start onboarding");
  const id = str(fd, "employee_id");
  if (!id || !UUID.test(id)) return fail("Choose an employee");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_onboarding", { p_employee: id });
  if (error) return fail(dbError(error));
  refresh(id);
  return ok(data ? `Checklist started with ${data} tasks` : "Checklist is already up to date", `/onboarding/${id}`);
}

/** HR: add a one-off task to someone's checklist. */
export async function addTask(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me?.isHR) return fail("Only HR can add tasks");
  const employeeId = str(fd, "employee_id");
  const title = str(fd, "title");
  const owner = str(fd, "owner") ?? "hr";
  const due = str(fd, "due_date");
  const description = str(fd, "description");
  if (!employeeId || !UUID.test(employeeId)) return fail("Invalid employee");
  if (!title || title.length < 2 || title.length > 120) return fail("Give the task a title (2–120 characters)");
  if (!(OWNERS as readonly string[]).includes(owner)) return fail("Choose who does it");
  if (due && !DATE.test(due)) return fail("Invalid due date");
  if (description && description.length > 500) return fail("Keep the description under 500 characters");
  const supabase = await createClient();
  const { data: last } = await supabase.from("onboarding_tasks").select("sort_order").eq("employee_id", employeeId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("onboarding_tasks").insert({
    employee_id: employeeId,
    title,
    owner,
    due_date: due,
    description,
    sort_order: (last?.sort_order ?? 0) + 10,
  });
  if (error) return fail(dbError(error));
  refresh(employeeId);
  return ok("Task added");
}

/** HR: change a task's due date. */
export async function setTaskDue(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me?.isHR) return fail("Only HR can change due dates");
  const id = str(fd, "id");
  const due = str(fd, "due_date");
  if (!id || !UUID.test(id)) return fail("Invalid task");
  if (due && !DATE.test(due)) return fail("Invalid date");
  const supabase = await createClient();
  const { data, error } = await supabase.from("onboarding_tasks").update({ due_date: due }).eq("id", id).select("employee_id").maybeSingle();
  if (error) return fail(dbError(error));
  refresh(data?.employee_id);
  return ok("Due date updated");
}

/** HR: remove a task. */
export async function deleteTask(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me?.isHR) return fail("Only HR can remove tasks");
  const id = str(fd, "id");
  if (!id || !UUID.test(id)) return fail("Invalid task");
  const supabase = await createClient();
  const { data, error } = await supabase.from("onboarding_tasks").delete().eq("id", id).select("employee_id").maybeSingle();
  if (error) return fail(dbError(error));
  refresh(data?.employee_id);
  return ok("Task removed");
}

/** HR: set or extend probation (blank = no probation). */
export async function setProbation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me?.isHR) return fail("Only HR can change probation");
  const id = str(fd, "employee_id");
  const end = str(fd, "probation_end_date");
  if (!id || !UUID.test(id)) return fail("Invalid employee");
  if (end && !DATE.test(end)) return fail("Invalid date");
  const supabase = await createClient();
  const { data: emp } = await supabase.from("employees").select("date_of_joining").eq("id", id).maybeSingle();
  if (!emp) return fail("Employee not found");
  if (end && end <= emp.date_of_joining) return fail("Probation must end after the date of joining");
  const { error } = await supabase.from("employees").update({ probation_end_date: end }).eq("id", id);
  if (error) return fail(dbError(error));
  refresh(id);
  revalidatePath(`/hris/employees/${id}/edit`);
  return ok(end ? "Probation updated" : "Probation removed");
}

/** HR: add or edit a checklist template item. */
export async function saveTemplate(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me?.isHR) return fail("Only HR can edit the checklist");
  const id = str(fd, "id");
  const title = str(fd, "title");
  const description = str(fd, "description");
  const owner = str(fd, "owner") ?? "hr";
  const dueBasis = str(fd, "due_basis") === "probation_end" ? "probation_end" : "joining";
  const offset = num(fd, "due_offset_days") ?? 0;
  const autoKey = str(fd, "auto_key");
  const sort = num(fd, "sort_order") ?? 0;
  const active = fd.get("active") === "on";
  if (id && !UUID.test(id)) return fail("Invalid item");
  if (!title || title.length < 2 || title.length > 120) return fail("Give the task a title (2–120 characters)");
  if (description && description.length > 500) return fail("Keep the description under 500 characters");
  if (!(OWNERS as readonly string[]).includes(owner)) return fail("Choose who does it");
  if (!Number.isInteger(offset) || offset < -90 || offset > 365) return fail("Due day must be between -90 and 365");
  if (autoKey && !AUTO_KEYS.includes(autoKey)) return fail("Invalid automation");
  const row = { title, description, owner, due_basis: dueBasis, due_offset_days: offset, auto_key: autoKey, sort_order: Math.round(sort), active };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("onboarding_templates").update(row).eq("id", id) : await supabase.from("onboarding_templates").insert(row);
  if (error) return fail(dbError(error));
  revalidatePath("/hris/onboarding/template");
  return ok(id ? "Checklist item saved" : "Checklist item added. It applies to joiners added from now on.");
}

export async function deleteTemplate(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me?.isHR) return fail("Only HR can edit the checklist");
  const id = str(fd, "id");
  if (!id || !UUID.test(id)) return fail("Invalid item");
  const supabase = await createClient();
  const { error } = await supabase.from("onboarding_templates").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath("/hris/onboarding/template");
  return ok("Checklist item removed. Existing checklists keep their copy.");
}
