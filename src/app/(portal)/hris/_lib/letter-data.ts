import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CurrentEmployee } from "@/lib/auth";
import { formatDate, formatNumber, humanize, orgToday } from "@/lib/utils";
import { buildLetter, isLetterType, type LetterData, type LetterType } from "./letter-templates";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const money = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? "—" : `₹${formatNumber(n)}`);

type EmpRow = {
  id: string;
  first_name: string;
  full_name: string | null;
  employee_code: string;
  email: string;
  gender: string | null;
  date_of_joining: string;
  employment_type: string;
  designation: { title: string } | null;
  department: { name: string } | null;
  location: { name: string; city: string | null } | null;
  manager: { full_name: string | null } | null;
};

/**
 * Placeholder values for each employee id (employee record, private address,
 * current salary structure). Caller must already be HR (RLS also enforces it).
 */
export async function loadLetterData(supabase: Supabase, employeeIds: string[], signer: Pick<CurrentEmployee, "full_name" | "designation">) {
  const ids = [...new Set(employeeIds)].filter(Boolean);
  const out = new Map<string, LetterData>();
  if (ids.length === 0) return out;

  const [{ data: emps }, { data: privs }, { data: salaries }, { data: resignations }] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, first_name, full_name, employee_code, email, gender, date_of_joining, employment_type, designation:designations(title), department:departments(name), location:locations(name, city), manager:manager_id(full_name)",
      )
      .in("id", ids),
    supabase.from("employee_private").select("employee_id, address").in("employee_id", ids),
    supabase
      .from("salary_structures")
      .select("employee_id, annual_ctc, basic, hra, special_allowance, effective_from")
      .in("employee_id", ids)
      .eq("is_current", true)
      .order("effective_from", { ascending: false }),
    supabase
      .from("resignations")
      .select("employee_id, resignation_date, requested_last_day, approved_last_day")
      .in("employee_id", ids)
      .in("status", ["pending_hr", "approved", "completed"])
      .order("created_at", { ascending: false }),
  ]);

  const today = formatDate(orgToday());
  for (const e of (emps ?? []) as unknown as EmpRow[]) {
    const priv = privs?.find((p) => p.employee_id === e.id);
    const sal = salaries?.find((s) => s.employee_id === e.id);
    const resignation = resignations?.find((r) => r.employee_id === e.id);
    const lastDay = resignation ? (resignation.approved_last_day ?? resignation.requested_last_day) : null;
    const female = e.gender === "female";
    const male = e.gender === "male";
    const ctc = sal ? Number(sal.annual_ctc) : null;
    out.set(e.id, {
      company: "Grevya",
      issue_date: today,
      employee_name: e.full_name ?? e.first_name,
      first_name: e.first_name,
      employee_code: e.employee_code,
      email: e.email,
      salutation: female ? "Ms." : male ? "Mr." : "Mx.",
      pronoun: female ? "she" : male ? "he" : "they",
      object_pronoun: female ? "her" : male ? "him" : "them",
      possessive: female ? "her" : male ? "his" : "their",
      possessive_cap: female ? "Her" : male ? "His" : "Their",
      designation: e.designation?.title ?? "—",
      department: e.department?.name ?? "—",
      location: e.location ? [e.location.name, e.location.city].filter(Boolean).join(", ") : "—",
      manager_name: e.manager?.full_name ?? "the reporting manager assigned to you",
      date_of_joining: formatDate(e.date_of_joining),
      employment_type: humanize(e.employment_type).toLowerCase(),
      address: priv?.address ?? "—",
      annual_ctc: money(ctc),
      monthly_ctc: money(ctc !== null ? Math.round(ctc / 12) : null),
      basic: money(sal?.basic),
      hra: money(sal?.hra),
      special_allowance: money(sal?.special_allowance),
      basic_monthly: money(sal ? Math.round(Number(sal.basic) / 12) : null),
      hra_monthly: money(sal ? Math.round(Number(sal.hra) / 12) : null),
      special_allowance_monthly: money(sal ? Math.round(Number(sal.special_allowance) / 12) : null),
      offer_ctc: money(ctc),
      probation_months: "6",
      last_working_day: lastDay ? formatDate(lastDay) : "—",
      resignation_date: resignation ? formatDate(resignation.resignation_date) : "—",
      purpose: "official purposes",
      signatory_name: signer.full_name ?? "Human Resources",
      signatory_title: signer.designation?.title ? `${signer.designation.title}, Human Resources` : "Human Resources",
    });
  }
  return out;
}

/** Turn raw HR inputs (yyyy-MM-dd dates, numbers) into display strings for templates. */
export function formatExtras(type: LetterType, raw: Record<string, string | null | undefined>): LetterData {
  const out: LetterData = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!v) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) out[k] = formatDate(v);
    else if (["offer_ctc", "new_ctc", "bonus_amount"].includes(k) && Number.isFinite(Number(v))) out[k] = money(Number(v));
    else out[k] = v;
  }
  if (type === "bonus" && !out.bonus_reason) out.bonus_reason = "your outstanding contribution";
  if (type === "promotion" && !out.new_ctc) out.new_ctc = "as communicated separately";
  return out;
}

export function generateFor(type: string, base: LetterData | undefined, extras: LetterData = {}) {
  if (!base) return null;
  const t: LetterType = isLetterType(type) ? type : "other";
  return { type: t, ...buildLetter(t, { ...base, ...extras }) };
}
