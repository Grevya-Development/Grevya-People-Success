"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { uploadDocument } from "@/lib/storage";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str, num, orgToday, financialYear, formatCurrency } from "@/lib/utils";
import {
  FBP_COMPONENTS,
  INVESTMENT_ITEMS,
  fyOf,
  fyRange,
  isRegime,
  parseFbpComponents,
  round2,
  toNum,
  type InvestmentItem,
} from "./_lib/payroll";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const MAX_AMOUNT = 100_000_000;

const twoDecimals = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;

async function context() {
  const me = await getCurrentEmployee();
  if (!me) return null;
  return { me, supabase: await createClient() };
}

async function currentStructure(supabase: Awaited<ReturnType<typeof createClient>>, employeeId: string) {
  const { data } = await supabase
    .from("salary_structures")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("is_current", true)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

// ---------------------------------------------------------------------------
// VPF
// ---------------------------------------------------------------------------

export async function submitVpf(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!ctx) return fail("Not signed in");
  const { me, supabase } = ctx;

  const pct = num(fd, "percentage");
  const month = str(fd, "effective_month"); // yyyy-MM
  if (pct === null || pct < 0 || pct > 88) return fail("VPF percentage must be between 0 and 88");
  if (!twoDecimals(pct)) return fail("Use at most 2 decimal places");
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail("Choose the effective month");
  if (month < orgToday().slice(0, 7)) return fail("Effective month cannot be in the past");
  const [y, m] = month.split("-").map(Number);
  if (y > Number(orgToday().slice(0, 4)) + 1) return fail("Effective month is too far ahead");

  const structure = await currentStructure(supabase, me.id);
  if (!structure) return fail("Your salary structure isn't set up yet — please contact HR");

  const { count } = await supabase
    .from("vpf_declarations")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", me.id)
    .eq("status", "pending");
  if ((count ?? 0) > 0) return fail("You already have a pending VPF request. Cancel it before raising a new one.");

  const { error } = await supabase.from("vpf_declarations").insert({
    employee_id: me.id,
    financial_year: fyOf(y, m),
    percentage: pct,
    effective_month: `${month}-01`,
    status: "pending",
  });
  if (error) return fail(dbError(error));
  revalidatePath("/payroll/vpf");
  revalidatePath("/payroll/admin");
  return ok("VPF declaration submitted for approval");
}

export async function cancelVpf(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!ctx) return fail("Not signed in");
  const { me, supabase } = ctx;
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid request");

  const { data, error } = await supabase
    .from("vpf_declarations")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("employee_id", me.id)
    .eq("status", "pending")
    .select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Only pending requests can be cancelled");
  revalidatePath("/payroll/vpf");
  revalidatePath("/payroll/admin");
  return ok("VPF request cancelled");
}

// ---------------------------------------------------------------------------
// FBP
// ---------------------------------------------------------------------------

export async function saveFbp(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!ctx) return fail("Not signed in");
  const { me, supabase } = ctx;
  const submit = str(fd, "intent") === "submit";
  const fy = financialYear(orgToday());

  const structure = await currentStructure(supabase, me.id);
  if (!structure) return fail("Your salary structure isn't set up yet — please contact HR");
  const fbpTotal = toNum(structure.fbp_total);
  if (fbpTotal <= 0) return fail("Your CTC doesn't include a Flexible Benefit Plan");

  const components = [];
  for (const c of FBP_COMPONENTS) {
    const v = num(fd, `amt_${c.code}`) ?? 0;
    if (v < 0) return fail(`${c.label}: amount can't be negative`);
    if (!twoDecimals(v)) return fail(`${c.label}: use at most 2 decimal places`);
    if (v > c.limit) return fail(`${c.label} is limited to ${formatCurrency(c.limit)} a year`);
    components.push({ code: c.code, label: c.label, limit: c.limit, declared: round2(v) });
  }
  const total = round2(components.reduce((a, c) => a + c.declared, 0));
  if (total > fbpTotal) return fail(`Total ${formatCurrency(total)} exceeds your FBP entitlement of ${formatCurrency(fbpTotal)}`);
  if (submit && total <= 0) return fail("Declare at least one component before submitting");

  const { data: existing } = await supabase
    .from("fbp_declarations")
    .select("id, status")
    .eq("employee_id", me.id)
    .eq("financial_year", fy)
    .maybeSingle();
  if (existing && existing.status !== "draft") {
    return fail(existing.status === "submitted" ? "Your declaration is with HR. Recall it to make changes." : `Your declaration is ${existing.status}; contact HR to reopen it.`);
  }

  const values = {
    components,
    status: submit ? "submitted" : "draft",
    submitted_at: submit ? new Date().toISOString() : null,
  };
  const { error } = existing
    ? await supabase.from("fbp_declarations").update(values).eq("id", existing.id).eq("status", "draft")
    : await supabase.from("fbp_declarations").insert({ ...values, employee_id: me.id, financial_year: fy });
  if (error) return fail(dbError(error));
  revalidatePath("/payroll/fbp");
  revalidatePath("/payroll/admin");
  return ok(submit ? "FBP declaration submitted to HR" : "Draft saved");
}

export async function recallFbp(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!ctx) return fail("Not signed in");
  const { me, supabase } = ctx;
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid request");
  const { data, error } = await supabase
    .from("fbp_declarations")
    .update({ status: "draft", submitted_at: null })
    .eq("id", id)
    .eq("employee_id", me.id)
    .eq("status", "submitted")
    .select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Only a submitted declaration can be recalled");
  revalidatePath("/payroll/fbp");
  revalidatePath("/payroll/admin");
  return ok("Declaration recalled — you can edit it now");
}

// ---------------------------------------------------------------------------
// Investment declaration
// ---------------------------------------------------------------------------

export async function saveInvestments(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!ctx) return fail("Not signed in");
  const { me, supabase } = ctx;
  const submit = str(fd, "intent") === "submit";
  const fy = financialYear(orgToday());
  const regime = str(fd, "regime");
  if (!isRegime(regime)) return fail("Choose a tax regime");

  const items: InvestmentItem[] = [];
  for (const def of INVESTMENT_ITEMS) {
    let declared = num(fd, `declared_${def.code}`) ?? 0;
    const proof = num(fd, `proof_${def.code}`) ?? 0;
    const item: InvestmentItem = { code: def.code, section: def.section, label: def.label, declared: 0, proof_amount: 0 };
    if (def.code === "hra") {
      const monthly = num(fd, "monthly_rent") ?? 0;
      if (monthly < 0 || monthly > 10_000_000) return fail("Enter a valid monthly rent");
      declared = round2(monthly * 12);
      const landlordName = str(fd, "landlord_name") ?? "";
      const landlordPan = (str(fd, "landlord_pan") ?? "").toUpperCase();
      if (landlordName.length > 120) return fail("Landlord name is too long");
      if (landlordPan && !PAN_RE.test(landlordPan)) return fail("Landlord PAN should look like ABCDE1234F");
      if (submit && monthly > 0 && !landlordName) return fail("Enter the landlord's name");
      if (submit && declared > 100000 && !landlordPan) return fail("Landlord PAN is required when annual rent exceeds ₹1,00,000");
      Object.assign(item, { monthly_rent: round2(monthly), landlord_name: landlordName, landlord_pan: landlordPan, metro: str(fd, "metro") === "on" });
    }
    if (declared < 0 || proof < 0) return fail(`${def.label}: amounts can't be negative`);
    if (declared > MAX_AMOUNT || proof > MAX_AMOUNT) return fail(`${def.label}: amount is too large`);
    if (!twoDecimals(declared) || !twoDecimals(proof)) return fail(`${def.label}: use at most 2 decimal places`);
    item.declared = round2(declared);
    item.proof_amount = round2(proof);
    items.push(item);
  }

  const { data: existing } = await supabase
    .from("investment_declarations")
    .select("id, status")
    .eq("employee_id", me.id)
    .eq("financial_year", fy)
    .maybeSingle();
  if (existing && existing.status !== "draft") {
    return fail(existing.status === "submitted" ? "Your declaration is with HR. Recall it to make changes." : `Your declaration is ${existing.status}; contact HR to reopen it.`);
  }

  const values = {
    regime,
    items,
    status: submit ? "submitted" : "draft",
    submitted_at: submit ? new Date().toISOString() : null,
  };
  const { error } = existing
    ? await supabase.from("investment_declarations").update(values).eq("id", existing.id).eq("status", "draft")
    : await supabase.from("investment_declarations").insert({ ...values, employee_id: me.id, financial_year: fy });
  if (error) return fail(dbError(error));
  revalidatePath("/payroll/investments");
  revalidatePath("/payroll/tax-calculator");
  revalidatePath("/payroll/admin");
  return ok(submit ? "Investment declaration submitted to HR" : "Draft saved");
}

export async function recallInvestments(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!ctx) return fail("Not signed in");
  const { me, supabase } = ctx;
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid request");
  const { data, error } = await supabase
    .from("investment_declarations")
    .update({ status: "draft", submitted_at: null })
    .eq("id", id)
    .eq("employee_id", me.id)
    .eq("status", "submitted")
    .select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Only a submitted declaration can be recalled");
  revalidatePath("/payroll/investments");
  revalidatePath("/payroll/admin");
  return ok("Declaration recalled — you can edit it now");
}

// ---------------------------------------------------------------------------
// CTC reimbursement claims
// ---------------------------------------------------------------------------

export async function raiseCtcClaim(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!ctx) return fail("Not signed in");
  const { me, supabase } = ctx;
  const today = orgToday();
  const fy = financialYear(today);
  const { start } = fyRange(fy);

  const code = str(fd, "component");
  const title = str(fd, "title");
  const expenseDate = str(fd, "expense_date");
  const amount = num(fd, "amount");
  const description = str(fd, "description");
  const file = fd.get("bill");
  const hasFile = !!file && typeof file !== "string" && file.size > 0;

  const def = FBP_COMPONENTS.find((c) => c.code === code);
  if (!def) return fail("Choose a component");
  if (!title) return fail("Title is required");
  if (title.length > 150) return fail("Title must be 150 characters or fewer");
  if (!expenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate) || Number.isNaN(Date.parse(expenseDate))) return fail("Enter a valid bill date");
  if (expenseDate > today) return fail("Bill date cannot be in the future");
  if (expenseDate < start) return fail(`Bill date must be within FY ${fy}`);
  if (amount === null || amount <= 0) return fail("Amount must be greater than zero");
  if (!twoDecimals(amount)) return fail("Amount can have at most 2 decimal places");
  if (description && description.length > 2000) return fail("Description is too long");

  const { data: decl } = await supabase
    .from("fbp_declarations")
    .select("components, status")
    .eq("employee_id", me.id)
    .eq("financial_year", fy)
    .maybeSingle();
  if (!decl || decl.status !== "approved") return fail("You need an approved FBP declaration to claim CTC reimbursements");
  const declared = parseFbpComponents(decl.components).find((c) => c.code === def.code)?.declared ?? 0;
  if (declared <= 0) return fail(`You haven't declared ${def.label} in your FBP`);

  const { data: cat } = await supabase
    .from("claim_categories")
    .select("id, name, max_amount, requires_receipt, active")
    .eq("kind", "ctc")
    .ilike("name", def.label)
    .maybeSingle();
  if (!cat || !cat.active) return fail(`HR hasn't enabled claims for ${def.label} yet`);

  const { data: prior } = await supabase
    .from("claims")
    .select("amount")
    .eq("employee_id", me.id)
    .eq("category_id", cat.id)
    .in("status", ["submitted", "approved", "paid"])
    .gte("expense_date", start);
  const claimed = (prior ?? []).reduce((a, c) => a + toNum(c.amount), 0);
  const balance = round2(declared - claimed);
  if (amount > balance) return fail(`Only ${formatCurrency(Math.max(0, balance), 2)} is left to claim under ${def.label}`);
  if (cat.max_amount !== null && amount > Number(cat.max_amount)) return fail(`${def.label} claims are limited to ${formatCurrency(cat.max_amount)} each`);
  if (cat.requires_receipt && !hasFile) return fail("Please attach the bill");

  let billPath: string | null = null;
  if (hasFile) {
    try {
      billPath = await uploadDocument(file, "claims");
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Could not upload the bill");
    }
  }

  const { error } = await supabase.from("claims").insert({
    employee_id: me.id,
    category_id: cat.id,
    title,
    expense_date: expenseDate,
    amount: round2(amount),
    description,
    receipt_path: billPath,
    status: "submitted",
  });
  if (error) return fail(dbError(error));
  revalidatePath("/payroll/ctc-reimbursement");
  revalidatePath("/reimbursement/claims");
  revalidatePath("/reimbursement/approvals");
  return ok("Claim submitted for approval");
}
