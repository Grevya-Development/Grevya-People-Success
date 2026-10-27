/**
 * Payroll domain helpers — pure, safe on server & client.
 * Salary structure amounts are ANNUAL; payslip lines are MONTHLY.
 */
import type { Json } from "@/lib/database.types";
import { DEDUCTION_LIMITS, PROFESSIONAL_TAX_MONTHLY, hraExemption, type OldRegimeDeductions, type Regime } from "./tax";

/** Payroll module accent (green), mirrors MODULES[].theme. */
export const PAYROLL_THEME = {
  pill: "bg-[#e2eed4]",
  text: "text-[#4f7a1f]",
  solid: "bg-[#78a83a]",
  stat: "bg-[#e2eed4] text-[#4f7a1f]",
  border: "border-[#78a83a]",
};

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

export const EPF_RATE = 0.12;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const toNum = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// ---------------------------------------------------------------------------
// Financial year
// ---------------------------------------------------------------------------

/** "2026-27" -> 2026 (start year), null if malformed. */
export function fyStartYear(fy: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(fy ?? "");
  if (!m) return null;
  const y = Number(m[1]);
  return (y + 1) % 100 === Number(m[2]) ? y : null;
}

export const fyLabel = (startYear: number) => `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;

/** FY that contains (year, month). */
export const fyOf = (year: number, month: number) => fyLabel(month >= 4 ? year : year - 1);

export function fyRange(fy: string) {
  const y = fyStartYear(fy) ?? new Date().getFullYear();
  return { start: `${y}-04-01`, end: `${y + 1}-03-31` };
}

/** April..March as {year, month}. */
export function fyMonths(fy: string): { year: number; month: number }[] {
  const y = fyStartYear(fy) ?? new Date().getFullYear();
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((3 + i) % 12) + 1;
    return { year: m >= 4 ? y : y + 1, month: m };
  });
}

export const monthLabel = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`;
export const ym = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

// ---------------------------------------------------------------------------
// Salary structure
// ---------------------------------------------------------------------------

export const DEFAULT_FBP = 120000;

export type StructureSplit = {
  annual_ctc: number;
  basic: number;
  hra: number;
  pf_employer: number;
  gratuity: number;
  fbp_total: number;
  variable_pay: number;
  special_allowance: number;
};

/** Auto-split an annual CTC: basic 40% CTC, HRA 50% basic, PF 12% basic, gratuity 4.81% basic, special = remainder. */
export function splitCtc(annualCtc: number, fbpTotal = DEFAULT_FBP, variablePay = 0): StructureSplit {
  const ctc = round2(Math.max(0, annualCtc));
  const basic = round2(ctc * 0.4);
  const hra = round2(basic * 0.5);
  const pf_employer = round2(basic * EPF_RATE);
  const gratuity = round2(basic * 0.0481);
  const fbp_total = round2(Math.max(0, fbpTotal));
  const variable_pay = round2(Math.max(0, variablePay));
  const special_allowance = round2(ctc - basic - hra - pf_employer - gratuity - fbp_total - variable_pay);
  return { annual_ctc: ctc, basic, hra, pf_employer, gratuity, fbp_total, variable_pay, special_allowance };
}

type StructureLike = { basic: number; hra: number; special_allowance: number; fbp_total: number; variable_pay?: number | null };

/** Annual taxable gross salary (CTC minus employer PF & gratuity). */
export const annualGross = (s: StructureLike) =>
  toNum(s.basic) + toNum(s.hra) + toNum(s.special_allowance) + toNum(s.fbp_total) + toNum(s.variable_pay);

// ---------------------------------------------------------------------------
// FBP
// ---------------------------------------------------------------------------

export const FBP_COMPONENTS = [
  { code: "fuel", label: "Fuel & Conveyance", limit: 60000, hint: "Fuel bills, cab / auto receipts" },
  { code: "telephone", label: "Telephone & Internet", limit: 24000, hint: "Mobile & broadband bills" },
  { code: "meal", label: "Meal Card", limit: 26400, hint: "₹2,200 per month via meal card" },
  { code: "books", label: "Books & Periodicals", limit: 12000, hint: "Books, journals, subscriptions" },
  { code: "lta", label: "Leave Travel Allowance", limit: 50000, hint: "Domestic travel, twice in a block of 4 years" },
  { code: "uniform", label: "Uniform/Gadget", limit: 30000, hint: "Work uniform or gadgets (laptop, tablet)" },
] as const;

export type FbpComponent = { code: string; label: string; limit: number; declared: number };

export function parseFbpComponents(raw: Json | null | undefined): FbpComponent[] {
  const arr = Array.isArray(raw) ? raw : [];
  const map = new Map<string, number>();
  for (const r of arr) {
    if (r && typeof r === "object" && !Array.isArray(r) && typeof r.code === "string") map.set(r.code, toNum(r.declared));
  }
  return FBP_COMPONENTS.map((c) => ({ code: c.code, label: c.label, limit: c.limit, declared: map.get(c.code) ?? 0 }));
}

// ---------------------------------------------------------------------------
// Investment declaration
// ---------------------------------------------------------------------------

export type InvestmentDef = {
  code: string;
  section: string;
  label: string;
  hint?: string;
  /** cap for the individual item (statutory) */
  cap?: number;
};

export const INVESTMENT_ITEMS: InvestmentDef[] = [
  { code: "ppf", section: "80C", label: "Public Provident Fund (PPF)" },
  { code: "elss", section: "80C", label: "ELSS mutual funds" },
  { code: "lic", section: "80C", label: "Life insurance premium (LIC)" },
  { code: "tuition", section: "80C", label: "Children's tuition fees" },
  { code: "home_principal", section: "80C", label: "Home-loan principal repayment" },
  { code: "80d_self", section: "80D", label: "Medical insurance — self, spouse & children", hint: "Up to ₹25,000 (₹50,000 if senior citizen)", cap: 50000 },
  { code: "80d_parents", section: "80D", label: "Medical insurance — parents", hint: "Up to ₹25,000 (₹50,000 if senior citizen)", cap: 50000 },
  { code: "hra", section: "HRA", label: "House rent paid", hint: "Annual rent — monthly rent × 12" },
  { code: "home_interest", section: "24(b)", label: "Home-loan interest (self-occupied)", cap: DEDUCTION_LIMITS.sec24b },
  { code: "nps", section: "80CCD(1B)", label: "Additional NPS contribution", cap: DEDUCTION_LIMITS.sec80CCD1B },
  { code: "edu_loan", section: "80E", label: "Education-loan interest" },
  { code: "donation", section: "80G", label: "Donations (eligible amount)" },
];

export const INVESTMENT_SECTIONS: { section: string; title: string; note?: string }[] = [
  { section: "80C", title: "Section 80C", note: "Combined limit ₹1,50,000 including your EPF contribution" },
  { section: "80D", title: "Section 80D — Medical insurance" },
  { section: "HRA", title: "House Rent Allowance (HRA)", note: "Landlord PAN is mandatory when annual rent exceeds ₹1,00,000" },
  { section: "24(b)", title: "Section 24(b) — Home-loan interest", note: "Up to ₹2,00,000" },
  { section: "80CCD(1B)", title: "Section 80CCD(1B) — NPS", note: "Up to ₹50,000" },
  { section: "80E", title: "Section 80E — Education loan", note: "No upper limit" },
  { section: "80G", title: "Section 80G — Donations" },
];

export type InvestmentItem = {
  code: string;
  section: string;
  label: string;
  declared: number;
  proof_amount: number;
  monthly_rent?: number;
  landlord_name?: string;
  landlord_pan?: string;
  metro?: boolean;
};

export function parseInvestmentItems(raw: Json | null | undefined): InvestmentItem[] {
  const arr = Array.isArray(raw) ? raw : [];
  const byCode = new Map<string, Record<string, Json | undefined>>();
  const loose: Record<string, Json | undefined>[] = [];
  for (const r of arr) {
    if (!r || typeof r !== "object" || Array.isArray(r)) continue;
    if (typeof r.code === "string" && INVESTMENT_ITEMS.some((d) => d.code === r.code)) byCode.set(r.code, r);
    else loose.push(r);
  }
  // Items without a known code (e.g. imported data): match by section + label, else the first free slot in the section.
  for (const r of loose) {
    const section = typeof r.section === "string" ? r.section : "";
    const label = typeof r.label === "string" ? r.label.toLowerCase() : "";
    const free = INVESTMENT_ITEMS.filter((d) => d.section === section && !byCode.has(d.code));
    const match = free.find((d) => label && (d.label.toLowerCase().includes(label) || label.includes(d.label.toLowerCase()))) ?? free[0];
    if (match) byCode.set(match.code, r);
  }
  return INVESTMENT_ITEMS.map((def) => {
    const r = byCode.get(def.code);
    const item: InvestmentItem = {
      code: def.code,
      section: def.section,
      label: def.label,
      declared: toNum(r?.declared),
      proof_amount: toNum(r?.proof_amount),
    };
    if (def.code === "hra") {
      item.monthly_rent = toNum(r?.monthly_rent);
      item.landlord_name = typeof r?.landlord_name === "string" ? r.landlord_name : "";
      item.landlord_pan = typeof r?.landlord_pan === "string" ? r.landlord_pan : "";
      item.metro = r?.metro === true;
    }
    return item;
  });
}

/** Employee EPF (12% of basic) — counts towards 80C. Annual. */
export const annualEpf = (basicAnnual: number) => round2(toNum(basicAnnual) * EPF_RATE);

/** Turn an investment declaration into old-regime deductions for tax.ts. */
export function deductionsFromInvestments(
  items: InvestmentItem[],
  salary: { basic: number; hra: number } | null,
  opts: { epf?: number } = {},
): OldRegimeDeductions {
  const sum = (section: string) => items.filter((i) => i.section === section).reduce((a, i) => a + Math.min(toNum(i.declared), INVESTMENT_ITEMS.find((d) => d.code === i.code)?.cap ?? Infinity), 0);
  const hraItem = items.find((i) => i.code === "hra");
  const hra = salary && hraItem && toNum(hraItem.declared) > 0
    ? hraExemption({ basic: toNum(salary.basic), hraReceived: toNum(salary.hra), rentPaid: toNum(hraItem.declared), metro: !!hraItem.metro }).exemption
    : 0;
  return {
    hraExemption: hra,
    professionalTax: PROFESSIONAL_TAX_MONTHLY * 12,
    sec80C: sum("80C") + toNum(opts.epf),
    sec80D: sum("80D"),
    sec24b: sum("24(b)"),
    sec80CCD1B: sum("80CCD(1B)"),
    sec80E: sum("80E"),
    sec80G: sum("80G"),
  };
}

export const isRegime = (v: unknown): v is Regime => v === "old" || v === "new";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export type PayLine = { label: string; amount: number };

export function parseLines(raw: Json | null | undefined): PayLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) =>
    r && typeof r === "object" && !Array.isArray(r) && typeof r.label === "string" ? [{ label: r.label, amount: toNum(r.amount) }] : [],
  );
}

export function maskPan(pan: string | null | undefined) {
  if (!pan) return "—";
  const p = pan.trim().toUpperCase();
  if (p.length < 6) return "XXXX";
  return p.slice(0, 2) + "X".repeat(p.length - 5) + p.slice(-3);
}

export function maskAccount(acc: string | null | undefined) {
  if (!acc) return "—";
  const a = acc.replace(/\s+/g, "");
  return a.length <= 4 ? a : "X".repeat(Math.min(8, a.length - 4)) + a.slice(-4);
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
}

function threeDigits(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? ONES[h] + " Hundred" : "", r ? twoDigits(r) : ""].filter(Boolean).join(" ");
}

/** Indian numbering in words: 120000 -> "One Lakh Twenty Thousand". */
export function numberToIndianWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(numberToIndianWords(crore) + " Crore");
  if (lakh) parts.push(twoDigits(lakh) + " Lakh");
  if (thousand) parts.push(twoDigits(thousand) + " Thousand");
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
}

/** "Rupees One Lakh Twenty Thousand and Fifty Paise Only" */
export function amountInWords(amount: number) {
  const a = Math.abs(toNum(amount));
  const rupees = Math.floor(a);
  const paise = Math.round((a - rupees) * 100);
  return `Rupees ${numberToIndianWords(rupees)}${paise ? ` and ${twoDigits(paise)} Paise` : ""} Only`;
}
