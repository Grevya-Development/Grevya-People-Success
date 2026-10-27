"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { uploadDocument } from "@/lib/storage";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str, num, orgToday, formatCurrency } from "@/lib/utils";
import { isUuid } from "./_lib/claims";

const MAX_CLAIM = 10_000_000; // ₹1 crore sanity cap

function revalidateClaims(id?: string) {
  revalidatePath("/reimbursement/claims");
  revalidatePath("/reimbursement/approvals");
  revalidatePath("/payroll/ctc-reimbursement");
  if (id) revalidatePath(`/reimbursement/claims/${id}`);
}

/** Create a new claim, or update one of the user's own drafts (when `id` is sent). */
export async function saveClaim(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");

  const id = str(fd, "id");
  const intent = str(fd, "intent") === "submit" ? "submit" : "draft";
  const categoryId = str(fd, "category_id");
  const title = str(fd, "title");
  const expenseDate = str(fd, "expense_date");
  const amount = num(fd, "amount");
  const description = str(fd, "description");
  const file = fd.get("receipt");
  const hasNewFile = !!file && typeof file !== "string" && file.size > 0;

  if (id && !isUuid(id)) return fail("Invalid claim");
  if (!isUuid(categoryId)) return fail("Please choose an expense category");
  if (!title) return fail("Title is required");
  if (title.length > 150) return fail("Title must be 150 characters or fewer");
  if (!expenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate) || Number.isNaN(Date.parse(expenseDate))) return fail("Enter a valid expense date");
  if (expenseDate > orgToday()) return fail("Expense date cannot be in the future");
  if (amount === null || amount <= 0) return fail("Amount must be greater than zero");
  if (amount > MAX_CLAIM) return fail("Amount is too large");
  if (Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) return fail("Amount can have at most 2 decimal places");
  if (description && description.length > 2000) return fail("Description is too long");

  const supabase = await createClient();
  const { data: cat } = await supabase
    .from("claim_categories")
    .select("id, name, kind, max_amount, requires_receipt, active")
    .eq("id", categoryId)
    .maybeSingle();
  if (!cat || cat.kind !== "expense") return fail("Please choose a valid expense category");

  let existingReceipt: string | null = null;
  if (id) {
    const { data: claim } = await supabase.from("claims").select("id, employee_id, status, receipt_path, category_id").eq("id", id).maybeSingle();
    if (!claim || claim.employee_id !== me.id) return fail("Claim not found");
    if (claim.status !== "draft") return fail("Only draft claims can be edited");
    existingReceipt = claim.receipt_path;
    // An inactive category may only be kept on an existing draft, not newly chosen.
    if (!cat.active && claim.category_id !== cat.id) return fail("This category is no longer active");
  } else if (!cat.active) {
    return fail("This category is no longer active");
  }

  if (cat.max_amount !== null && amount > Number(cat.max_amount)) {
    return fail(`${cat.name} claims are limited to ${formatCurrency(cat.max_amount)}`);
  }
  if (intent === "submit" && cat.requires_receipt && !hasNewFile && !existingReceipt) {
    return fail(`A receipt is required for ${cat.name} claims`);
  }

  let receiptPath = existingReceipt;
  if (hasNewFile) {
    try {
      receiptPath = await uploadDocument(file, "claims");
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Could not upload the receipt");
    }
  }

  const status = intent === "submit" ? "submitted" : "draft";
  const values = {
    category_id: cat.id,
    title,
    expense_date: expenseDate,
    amount,
    description,
    receipt_path: receiptPath,
    status,
  };

  if (id) {
    const { data, error } = await supabase.from("claims").update(values).eq("id", id).eq("employee_id", me.id).eq("status", "draft").select("id");
    if (error) return fail(dbError(error));
    if (!data?.length) return fail("Claim could not be updated — it may have changed. Please refresh.");
    // Submitting from the edit view: revalidating would re-render ?edit=1 as the read-only view and
    // unmount the form before it can toast and redirect. The redirect below loads fresh (dynamic) data.
    if (status === "draft") revalidateClaims(id);
    return ok(status === "submitted" ? "Claim submitted for approval" : "Draft saved", `/reimbursement/claims/${id}`);
  }

  const { data, error } = await supabase.from("claims").insert({ ...values, employee_id: me.id }).select("id").single();
  if (error) return fail(dbError(error));
  revalidateClaims();
  return ok(status === "submitted" ? "Claim submitted for approval" : "Saved as draft", `/reimbursement/claims/${data.id}`);
}

/** Submit one of the user's own drafts. */
export async function submitClaim(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const id = str(fd, "id");
  if (!isUuid(id)) return fail("Invalid claim");

  const supabase = await createClient();
  const { data: claim } = await supabase
    .from("claims")
    .select("id, employee_id, status, amount, expense_date, receipt_path, category:claim_categories(name, active, max_amount, requires_receipt)")
    .eq("id", id)
    .maybeSingle();
  if (!claim || claim.employee_id !== me.id) return fail("Claim not found");
  if (claim.status !== "draft") return fail("Only draft claims can be submitted");
  const cat = claim.category;
  if (!cat) return fail("Claim category is missing");
  if (!cat.active) return fail("This category is no longer active — edit the draft and choose another");
  if (claim.expense_date > orgToday()) return fail("Expense date cannot be in the future");
  if (cat.max_amount !== null && Number(claim.amount) > Number(cat.max_amount)) {
    return fail(`${cat.name} claims are limited to ${formatCurrency(cat.max_amount)}`);
  }
  if (cat.requires_receipt && !claim.receipt_path) return fail("Attach a receipt before submitting (edit the draft)");

  const { data, error } = await supabase.from("claims").update({ status: "submitted" }).eq("id", id).eq("status", "draft").select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Claim could not be submitted. Please refresh.");
  revalidateClaims(id);
  return ok("Claim submitted for approval");
}

/** Cancel one of the user's own draft / submitted claims. */
export async function cancelClaim(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const id = str(fd, "id");
  if (!isUuid(id)) return fail("Invalid claim");

  const supabase = await createClient();
  const { data: claim } = await supabase.from("claims").select("id, employee_id, status").eq("id", id).maybeSingle();
  if (!claim || claim.employee_id !== me.id) return fail("Claim not found");
  if (claim.status !== "draft" && claim.status !== "submitted") return fail("Only draft or pending claims can be cancelled");

  const { data, error } = await supabase
    .from("claims")
    .update({ status: "cancelled" })
    .eq("id", id)
    .in("status", ["draft", "submitted"])
    .select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Claim could not be cancelled — it may already have been processed.");
  revalidateClaims(id);
  return ok("Claim cancelled");
}

async function decide(fd: FormData, decision: "approved" | "rejected"): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isManager) return fail("You don't have permission to approve claims");
  const id = str(fd, "id");
  if (!isUuid(id)) return fail("Invalid claim");
  const remarks = str(fd, "remarks");
  if (decision === "rejected" && !remarks) return fail("Please add a reason for rejecting");
  if (remarks && remarks.length > 1000) return fail("Remarks are too long");

  const supabase = await createClient();
  // RLS: only returns the row when the user is HR or in the employee's management chain.
  const { data: claim } = await supabase.from("claims").select("id, employee_id, status").eq("id", id).maybeSingle();
  if (!claim) return fail("Claim not found");
  if (claim.employee_id === me.id) return fail("You can't approve your own claim");
  if (claim.status !== "submitted") return fail("This claim is no longer pending");

  const { data: allowed } = await supabase.rpc("can_approve_for", { emp: claim.employee_id });
  if (!allowed) return fail("You don't have permission to approve this claim");

  const { data, error } = await supabase
    .from("claims")
    .update({ status: decision, approver_id: me.id, approver_remarks: remarks, actioned_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "submitted")
    .select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("This claim is no longer pending");
  revalidateClaims(id);
  return ok(decision === "approved" ? "Claim approved" : "Claim rejected");
}

export async function approveClaim(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return decide(fd, "approved");
}

export async function rejectClaim(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return decide(fd, "rejected");
}

/** HR: mark approved claims as paid. `ids` is a comma separated list. */
export async function markClaimsPaid(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can mark claims as paid");
  const ids = (str(fd, "ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) return fail("Select at least one claim");
  if (ids.length > 500) return fail("Too many claims selected at once");
  if (!ids.every(isUuid)) return fail("Invalid selection");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("claims")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "approved")
    .neq("employee_id", me.id)
    .select("id");
  if (error) return fail(dbError(error));
  const n = data?.length ?? 0;
  if (!n) return fail("None of the selected claims could be marked as paid");
  revalidateClaims();
  const skipped = ids.length - n;
  return ok(`${n} claim${n === 1 ? "" : "s"} marked as paid${skipped ? ` (${skipped} skipped)` : ""}`);
}
