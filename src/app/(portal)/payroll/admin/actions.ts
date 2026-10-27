"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str, num, orgToday, formatCurrency } from "@/lib/utils";
import { computePayroll, isRunnableMonth, toPayslipInserts } from "../_lib/run";
import { monthLabel, splitCtc } from "../_lib/payroll";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function hrContext() {
  const me = await getCurrentEmployee();
  if (!me || !me.isHR) return null;
  return { me, supabase: await createClient() };
}

// ---------------------------------------------------------------------------
// Payroll run
// ---------------------------------------------------------------------------

export async function publishPayroll(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if (!ctx) return fail("Only HR can run payroll");
  const year = num(fd, "year");
  const month = num(fd, "month");
  const today = orgToday();
  if (year === null || month === null || !isRunnableMonth(year, month, today)) return fail("Choose a month up to the current one");

  let preview;
  try {
    preview = await computePayroll(ctx.supabase, year, month, today);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not compute payroll");
  }
  if (preview.rows.length === 0) return fail("No employees with a salary structure to pay for this month");

  const rows = toPayslipInserts(preview, new Date().toISOString());
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await ctx.supabase.from("payslips").upsert(rows.slice(i, i + 500), { onConflict: "employee_id,year,month" });
    if (error) return fail(dbError(error));
  }
  revalidatePath("/payroll/admin");
  revalidatePath("/payroll/slips");
  return ok(`Published ${rows.length} payslip${rows.length === 1 ? "" : "s"} for ${monthLabel(year, month)}`);
}

// ---------------------------------------------------------------------------
// Salary structures
// ---------------------------------------------------------------------------

export async function saveSalaryStructure(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if (!ctx) return fail("Only HR can manage salary structures");
  const { supabase } = ctx;

  const employeeId = str(fd, "employee_id");
  const ctc = num(fd, "annual_ctc");
  const fbp = num(fd, "fbp_total") ?? 0;
  const variable = num(fd, "variable_pay") ?? 0;
  const effectiveFrom = str(fd, "effective_from");

  if (!employeeId || !UUID_RE.test(employeeId)) return fail("Choose an employee");
  if (ctc === null || ctc <= 0) return fail("Annual CTC must be greater than zero");
  if (ctc > 1_000_000_000) return fail("Annual CTC is too large");
  if (fbp < 0 || variable < 0) return fail("Amounts can't be negative");
  if (!effectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) || Number.isNaN(Date.parse(effectiveFrom))) return fail("Choose an effective date");

  const { data: emp } = await supabase.from("employees").select("id, full_name, status, date_of_joining").eq("id", employeeId).maybeSingle();
  if (!emp) return fail("Employee not found");
  if (emp.status === "exited") return fail("Can't set a structure for an exited employee");

  const split = splitCtc(ctc, fbp, variable);
  if (split.special_allowance < 0) {
    return fail(`FBP and variable pay leave no room for special allowance — reduce them by ${formatCurrency(-split.special_allowance)}`);
  }

  const { data: latest } = await supabase
    .from("salary_structures")
    .select("effective_from")
    .eq("employee_id", employeeId)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest && effectiveFrom < latest.effective_from) {
    return fail(`A revision must be effective on or after the previous one (${latest.effective_from})`);
  }

  // Insert first (not current), then flip the flags, so a failure never leaves the employee without a structure.
  const { data: created, error } = await supabase
    .from("salary_structures")
    .insert({ ...split, employee_id: employeeId, effective_from: effectiveFrom, is_current: false })
    .select("id")
    .single();
  if (error || !created) return fail(dbError(error));

  const { error: e1 } = await supabase.from("salary_structures").update({ is_current: false }).eq("employee_id", employeeId).neq("id", created.id).eq("is_current", true);
  if (e1) {
    await supabase.from("salary_structures").delete().eq("id", created.id);
    return fail(dbError(e1));
  }
  const { error: e2 } = await supabase.from("salary_structures").update({ is_current: true }).eq("id", created.id);
  if (e2) return fail(dbError(e2));

  revalidatePath("/payroll/admin");
  return ok(`${latest ? "Revised" : "Created"} salary structure for ${emp.full_name}`);
}

// ---------------------------------------------------------------------------
// Declarations (VPF / FBP / Investments)
// ---------------------------------------------------------------------------

const TABLES = { vpf: "vpf_declarations", fbp: "fbp_declarations", investment: "investment_declarations" } as const;
type Kind = keyof typeof TABLES;

export async function actionDeclaration(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if (!ctx) return fail("Only HR can review declarations");
  const { me, supabase } = ctx;

  const kind = str(fd, "kind") as Kind | null;
  const id = str(fd, "id");
  const decision = str(fd, "decision");
  const remarks = str(fd, "remarks");
  if (!kind || !(kind in TABLES)) return fail("Unknown declaration type");
  if (!id || !UUID_RE.test(id)) return fail("Invalid declaration");
  if (!decision || !["approve", "reject", "return", "reopen"].includes(decision)) return fail("Unknown action");
  if ((decision === "reject" || decision === "return" || decision === "reopen") && !remarks) return fail("Please add remarks for the employee");
  if (remarks && remarks.length > 1000) return fail("Remarks are too long");
  if (kind === "vpf" && (decision === "return" || decision === "reopen")) return fail("Not available for VPF");

  const table = TABLES[kind];
  const { data: row } = await supabase.from(table).select("id, employee_id, status").eq("id", id).maybeSingle();
  if (!row) return fail("Declaration not found");
  if (row.employee_id === me.id) return fail("You can't review your own declaration");

  const waiting = kind === "vpf" ? "pending" : "submitted";
  let from: string[];
  let to: string;
  switch (decision) {
    case "approve":
      from = [waiting];
      to = "approved";
      break;
    case "reject":
      from = [waiting];
      to = "rejected";
      break;
    case "return":
      from = [waiting];
      to = "draft";
      break;
    default:
      from = ["approved", "rejected"];
      to = "draft";
  }
  if (!from.includes(row.status)) return fail(`This declaration is already ${row.status}`);

  const patch = { status: to, approver_id: me.id, approver_remarks: remarks, actioned_at: new Date().toISOString() };
  const { data, error } = await supabase.from(table).update(patch).eq("id", id).in("status", from).select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("The declaration changed meanwhile — refresh and try again");

  revalidatePath("/payroll/admin");
  revalidatePath(kind === "vpf" ? "/payroll/vpf" : kind === "fbp" ? "/payroll/fbp" : "/payroll/investments");
  const verb = { approve: "approved", reject: "rejected", return: "returned for revision", reopen: "reopened" }[decision];
  return ok(`Declaration ${verb}`);
}
