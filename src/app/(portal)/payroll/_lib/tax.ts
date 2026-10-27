/**
 * Indian income-tax engine for salaried employees — FY 2026-27 (AY 2027-28),
 * using the Budget 2025 slabs. Pure functions: safe on server and client.
 *
 * Shared by the Tax Calculator, Investment Details (tax impact) and the
 * monthly payroll run (TDS).
 */

export type Regime = "old" | "new";

export type Slab = { from: number; to: number | null; rate: number };

export const TAX_SLABS: Record<Regime, Slab[]> = {
  new: [
    { from: 0, to: 400000, rate: 0 },
    { from: 400000, to: 800000, rate: 0.05 },
    { from: 800000, to: 1200000, rate: 0.1 },
    { from: 1200000, to: 1600000, rate: 0.15 },
    { from: 1600000, to: 2000000, rate: 0.2 },
    { from: 2000000, to: 2400000, rate: 0.25 },
    { from: 2400000, to: null, rate: 0.3 },
  ],
  old: [
    { from: 0, to: 250000, rate: 0 },
    { from: 250000, to: 500000, rate: 0.05 },
    { from: 500000, to: 1000000, rate: 0.2 },
    { from: 1000000, to: null, rate: 0.3 },
  ],
};

export const STANDARD_DEDUCTION: Record<Regime, number> = { new: 75000, old: 50000 };

/** Section 87A: full rebate up to this taxable income. */
export const REBATE_LIMIT: Record<Regime, number> = { new: 1200000, old: 500000 };
/** Old regime 87A rebate is capped at ₹12,500. */
export const OLD_REBATE_MAX = 12500;

export const CESS_RATE = 0.04;

/** Professional tax: ₹200 per month (deductible u/s 16(iii) in the old regime only). */
export const PROFESSIONAL_TAX_MONTHLY = 200;

/** Statutory caps for old-regime deductions. */
export const DEDUCTION_LIMITS = {
  sec80C: 150000,
  sec80D: 100000, // self/family (25k, 50k senior) + parents (25k, 50k senior)
  sec24b: 200000,
  sec80CCD1B: 50000,
} as const;

/** Old-regime deductions & exemptions (annual amounts, before caps). */
export type OldRegimeDeductions = {
  hraExemption: number;
  professionalTax: number;
  sec80C: number;
  sec80D: number;
  sec24b: number;
  sec80CCD1B: number;
  sec80E: number;
  sec80G: number;
};

export type TaxInput = {
  /** Annual gross taxable salary (excludes employer PF / gratuity). */
  grossSalary: number;
  /** Interest, rent, etc. */
  otherIncome?: number;
  /** Only applied under the old regime. */
  deductions?: Partial<OldRegimeDeductions>;
};

export type SlabBreakup = { from: number; to: number | null; rate: number; amount: number; tax: number };
export type DeductionLine = { key: string; label: string; claimed: number; allowed: number };

export type TaxResult = {
  regime: Regime;
  grossSalary: number;
  otherIncome: number;
  grossTotalIncome: number;
  standardDeduction: number;
  /** All deductions applied (incl. standard deduction), with caps. */
  deductionLines: DeductionLine[];
  totalDeductions: number;
  taxableIncome: number;
  slabs: SlabBreakup[];
  slabTax: number;
  rebate: number;
  taxAfterRebate: number;
  surchargeRate: number;
  surcharge: number;
  cess: number;
  totalTax: number;
  monthlyTax: number;
  /** totalTax / grossTotalIncome, 0..1 */
  effectiveRate: number;
};

const clamp0 = (n: number | undefined | null) => (Number.isFinite(n) && (n as number) > 0 ? (n as number) : 0);
const roundTo10 = (n: number) => Math.round(n / 10) * 10;

/** Tax on `income` by slabs, with the per-slab breakup. */
export function slabTax(regime: Regime, income: number): { tax: number; slabs: SlabBreakup[] } {
  const slabs = TAX_SLABS[regime].map((s) => {
    const upper = s.to ?? Infinity;
    const amount = Math.max(0, Math.min(income, upper) - s.from);
    return { from: s.from, to: s.to, rate: s.rate, amount, tax: amount * s.rate };
  });
  return { tax: slabs.reduce((a, s) => a + s.tax, 0), slabs };
}

/** Section 87A rebate (incl. new-regime marginal relief just above ₹12L). */
export function rebate87A(regime: Regime, taxableIncome: number, tax: number): number {
  if (regime === "new") {
    if (taxableIncome <= REBATE_LIMIT.new) return tax;
    // Marginal relief: tax may not exceed the income earned above ₹12L.
    const excess = taxableIncome - REBATE_LIMIT.new;
    return tax > excess ? tax - excess : 0;
  }
  return taxableIncome <= REBATE_LIMIT.old ? Math.min(tax, OLD_REBATE_MAX) : 0;
}

const SURCHARGE_BANDS: { above: number; old: number; new: number }[] = [
  { above: 50000000, old: 0.37, new: 0.25 },
  { above: 20000000, old: 0.25, new: 0.25 },
  { above: 10000000, old: 0.15, new: 0.15 },
  { above: 5000000, old: 0.1, new: 0.1 },
];

export function surchargeRate(regime: Regime, taxableIncome: number) {
  const band = SURCHARGE_BANDS.find((b) => taxableIncome > b.above);
  return band ? band[regime] : 0;
}

/** Surcharge with marginal relief at each threshold. */
function surchargeFor(regime: Regime, taxableIncome: number, tax: number): { rate: number; amount: number } {
  const band = SURCHARGE_BANDS.find((b) => taxableIncome > b.above);
  if (!band || tax <= 0) return { rate: 0, amount: 0 };
  const rate = band[regime];
  const full = tax * rate;
  // Tax + surcharge may not exceed (tax + surcharge at the threshold) + income above the threshold.
  const t = band.above;
  const atThreshold = slabTax(regime, t).tax;
  const cap = atThreshold * (1 + surchargeRate(regime, t)) + (taxableIncome - t);
  const amount = Math.max(0, Math.min(full, cap - tax));
  return { rate, amount };
}

export function computeTax(regime: Regime, input: TaxInput): TaxResult {
  const grossSalary = clamp0(input.grossSalary);
  const otherIncome = clamp0(input.otherIncome);
  const d = input.deductions ?? {};
  const grossTotalIncome = grossSalary + otherIncome;

  const standardDeduction = Math.min(STANDARD_DEDUCTION[regime], grossSalary);
  const lines: DeductionLine[] = [
    { key: "standard", label: "Standard deduction", claimed: STANDARD_DEDUCTION[regime], allowed: standardDeduction },
  ];

  if (regime === "old") {
    const add = (key: string, label: string, claimed: number | undefined, cap?: number) => {
      const c = clamp0(claimed);
      if (c <= 0) return;
      lines.push({ key, label, claimed: c, allowed: cap === undefined ? c : Math.min(c, cap) });
    };
    add("hra", "HRA exemption u/s 10(13A)", d.hraExemption, grossSalary);
    add("pt", "Professional tax u/s 16(iii)", d.professionalTax, 2500);
    add("80C", "Section 80C", d.sec80C, DEDUCTION_LIMITS.sec80C);
    add("80D", "Section 80D (medical insurance)", d.sec80D, DEDUCTION_LIMITS.sec80D);
    add("24b", "Section 24(b) home-loan interest", d.sec24b, DEDUCTION_LIMITS.sec24b);
    add("80CCD1B", "Section 80CCD(1B) NPS", d.sec80CCD1B, DEDUCTION_LIMITS.sec80CCD1B);
    add("80E", "Section 80E education-loan interest", d.sec80E);
    add("80G", "Section 80G donations", d.sec80G);
  }

  const totalDeductions = lines.reduce((a, l) => a + l.allowed, 0);
  const taxableIncome = roundTo10(Math.max(0, grossTotalIncome - totalDeductions));

  const { tax: rawSlabTax, slabs } = slabTax(regime, taxableIncome);
  const rebate = rebate87A(regime, taxableIncome, rawSlabTax);
  const taxAfterRebate = Math.max(0, rawSlabTax - rebate);
  const sc = surchargeFor(regime, taxableIncome, taxAfterRebate);
  const cess = (taxAfterRebate + sc.amount) * CESS_RATE;
  const totalTax = roundTo10(taxAfterRebate + sc.amount + cess);

  return {
    regime,
    grossSalary,
    otherIncome,
    grossTotalIncome,
    standardDeduction,
    deductionLines: lines,
    totalDeductions,
    taxableIncome,
    slabs,
    slabTax: Math.round(rawSlabTax),
    rebate: Math.round(rebate),
    taxAfterRebate: Math.round(taxAfterRebate),
    surchargeRate: sc.rate,
    surcharge: Math.round(sc.amount),
    cess: Math.round(cess),
    totalTax,
    monthlyTax: Math.round(totalTax / 12),
    effectiveRate: grossTotalIncome > 0 ? totalTax / grossTotalIncome : 0,
  };
}

export type RegimeComparison = {
  old: TaxResult;
  new: TaxResult;
  recommended: Regime;
  /** Tax saved by choosing the recommended regime. */
  savings: number;
};

export function compareRegimes(input: TaxInput): RegimeComparison {
  const oldR = computeTax("old", input);
  const newR = computeTax("new", input);
  const recommended: Regime = oldR.totalTax < newR.totalTax ? "old" : "new";
  return { old: oldR, new: newR, recommended, savings: Math.abs(oldR.totalTax - newR.totalTax) };
}

/**
 * HRA exemption u/s 10(13A) — least of:
 *  (a) HRA received, (b) rent paid − 10% of basic, (c) 50% (metro) / 40% of basic.
 * All amounts annual.
 */
export function hraExemption({
  basic,
  hraReceived,
  rentPaid,
  metro,
}: {
  basic: number;
  hraReceived: number;
  rentPaid: number;
  metro: boolean;
}): { exemption: number; parts: { label: string; amount: number }[] } {
  const b = clamp0(basic);
  const parts = [
    { label: "Actual HRA received", amount: clamp0(hraReceived) },
    { label: "Rent paid − 10% of basic", amount: Math.max(0, clamp0(rentPaid) - 0.1 * b) },
    { label: `${metro ? 50 : 40}% of basic (${metro ? "metro" : "non-metro"})`, amount: (metro ? 0.5 : 0.4) * b },
  ];
  const exemption = clamp0(rentPaid) > 0 ? Math.round(Math.min(...parts.map((p) => p.amount))) : 0;
  return { exemption, parts };
}
