"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, Calculator, RotateCcw } from "lucide-react";
import { Button, Card, CardBody, CardHeader, Checkbox, Field, Input } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";
import { DEDUCTION_LIMITS, PROFESSIONAL_TAX_MONTHLY, compareRegimes, hraExemption, type Regime, type TaxResult } from "../_lib/tax";

export type TaxCalcDefaults = {
  grossSalary: number;
  otherIncome: number;
  basic: number;
  hraReceived: number;
  monthlyRent: number;
  metro: boolean;
  sec80C: number;
  sec80D: number;
  sec24b: number;
  sec80CCD1B: number;
  sec80E: number;
  sec80G: number;
};

type Key = Exclude<keyof TaxCalcDefaults, "metro">;

const n = (v: string) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

const pct = (r: number) => `${Math.round(r * 100)}%`;
const slabLabel = (from: number, to: number | null) =>
  to === null ? `Above ${formatCurrency(from)}` : `${formatCurrency(from)} – ${formatCurrency(to)}`;

export function TaxCalculator({ defaults, source }: { defaults: TaxCalcDefaults; source: string[] }) {
  const init = () => Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, typeof v === "number" ? (v ? String(Math.round(v)) : "") : v])) as Record<Key, string> & { metro: boolean };
  const [v, setV] = useState(init);
  const set = (k: Key) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  const hra = useMemo(
    () => hraExemption({ basic: n(v.basic), hraReceived: n(v.hraReceived), rentPaid: n(v.monthlyRent) * 12, metro: v.metro }),
    [v.basic, v.hraReceived, v.monthlyRent, v.metro],
  );

  const cmp = useMemo(
    () =>
      compareRegimes({
        grossSalary: n(v.grossSalary),
        otherIncome: n(v.otherIncome),
        deductions: {
          hraExemption: hra.exemption,
          professionalTax: PROFESSIONAL_TAX_MONTHLY * 12,
          sec80C: n(v.sec80C),
          sec80D: n(v.sec80D),
          sec24b: n(v.sec24b),
          sec80CCD1B: n(v.sec80CCD1B),
          sec80E: n(v.sec80E),
          sec80G: n(v.sec80G),
        },
      }),
    [v, hra.exemption],
  );
  const best = cmp[cmp.recommended];

  const num = (k: Key, label: string, hint?: string, cap?: number) => (
    <Field label={label} htmlFor={`tc-${k}`} hint={cap && n(v[k]) > cap ? <span className="text-amber-600">Capped at {formatCurrency(cap)}</span> : hint}>
      <Input id={`tc-${k}`} type="number" inputMode="numeric" min={0} step="1" value={v[k]} onChange={set(k)} placeholder="0" />
    </Field>
  );

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,420px)_1fr]">
      {/* Inputs */}
      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Income"
            description={source.length ? `Prefilled from ${source.join(" & ")}` : "Enter your annual figures"}
            action={
              <Button variant="ghost" size="sm" onClick={() => setV(init())} title="Reset to prefilled values">
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
            }
          />
          <CardBody className="space-y-4">
            {num("grossSalary", "Annual gross salary", "Taxable salary before deductions (excl. employer PF & gratuity)")}
            {num("otherIncome", "Other income", "Interest, rental income, etc.")}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="HRA exemption" description="Old regime only — least of the three below" />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {num("basic", "Annual basic salary")}
              {num("hraReceived", "Annual HRA received")}
              {num("monthlyRent", "Monthly rent paid")}
              <div className="flex items-end pb-2">
                <Checkbox label="Metro city (50%)" checked={v.metro} onChange={(e) => setV((s) => ({ ...s, metro: e.target.checked }))} />
              </div>
            </div>
            <ul className="space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              {hra.parts.map((p) => (
                <li key={p.label} className="flex justify-between gap-3">
                  <span>{p.label}</span>
                  <span className="tabular-nums">{formatCurrency(p.amount)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-3 border-t border-slate-200 pt-1 font-semibold text-slate-800">
                <span>Exempt HRA</span>
                <span className="tabular-nums">{formatCurrency(hra.exemption)}</span>
              </li>
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Deductions" description="Old regime only (annual amounts)" />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {num("sec80C", "80C — PPF, ELSS, LIC, EPF…", "Up to ₹1,50,000", DEDUCTION_LIMITS.sec80C)}
            {num("sec80D", "80D — Medical insurance", "Up to ₹1,00,000", DEDUCTION_LIMITS.sec80D)}
            {num("sec24b", "24(b) — Home-loan interest", "Up to ₹2,00,000", DEDUCTION_LIMITS.sec24b)}
            {num("sec80CCD1B", "80CCD(1B) — NPS", "Up to ₹50,000", DEDUCTION_LIMITS.sec80CCD1B)}
            {num("sec80E", "80E — Education-loan interest", "No upper limit")}
            {num("sec80G", "80G — Donations (eligible)")}
          </CardBody>
        </Card>
      </div>

      {/* Results */}
      <div className="space-y-5">
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-4 bg-gradient-to-r from-[#78a83a] to-[#5e8a2a] px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
                <BadgeCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-white/80">Recommended</p>
                <p className="text-xl font-semibold">{cmp.recommended === "new" ? "New" : "Old"} tax regime</p>
                <p className="text-sm text-white/90">
                  {cmp.savings > 0 ? `Saves ${formatCurrency(cmp.savings)} a year over the ${cmp.recommended === "new" ? "old" : "new"} regime` : "Both regimes result in the same tax"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:text-right">
              <div>
                <p className="text-xs text-white/80">Annual tax</p>
                <p className="text-lg font-semibold tabular-nums">{formatCurrency(best.totalTax)}</p>
              </div>
              <div>
                <p className="text-xs text-white/80">Monthly TDS</p>
                <p className="text-lg font-semibold tabular-nums">{formatCurrency(best.monthlyTax)}</p>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {(["new", "old"] as Regime[]).map((r) => (
            <RegimeCard key={r} result={cmp[r]} recommended={cmp.recommended === r} />
          ))}
        </div>
        <p className="flex items-start gap-1.5 text-xs text-slate-500">
          <Calculator className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          FY 2026-27 estimate using Budget 2025 slabs, 87A rebate with marginal relief, surcharge and 4% health &amp; education cess. Professional tax of ₹2,400 is deducted under
          the old regime. Taxable income and tax are rounded to the nearest ₹10. This is an estimate, not tax advice.
        </p>
      </div>
    </div>
  );
}

function RegimeCard({ result: r, recommended }: { result: TaxResult; recommended: boolean }) {
  const line = (label: string, value: number, opts: { strong?: boolean; minus?: boolean; muted?: boolean } = {}) => (
    <div className={cn("flex justify-between gap-3 py-1 text-sm", opts.strong ? "font-semibold text-slate-900" : opts.muted ? "text-slate-500" : "text-slate-700")}>
      <span>{label}</span>
      <span className="tabular-nums">
        {opts.minus && value > 0 ? "− " : ""}
        {formatCurrency(value)}
      </span>
    </div>
  );
  return (
    <Card className={cn(recommended && "ring-2 ring-[#78a83a]")}>
      <CardHeader
        title={r.regime === "new" ? "New regime" : "Old regime"}
        description={r.regime === "new" ? "Lower slabs, ₹75,000 standard deduction only" : "Exemptions & Chapter VI-A deductions"}
        action={recommended ? <span className="rounded-full bg-[#e2eed4] px-2.5 py-0.5 text-xs font-semibold text-[#4f7a1f]">Best</span> : undefined}
      />
      <CardBody className="space-y-4">
        <div className="divide-y divide-slate-100">
          {line("Gross income", r.grossTotalIncome)}
          <div className="py-1">
            {r.deductionLines.map((d) => (
              <div key={d.key} className="flex justify-between gap-3 py-0.5 text-xs text-slate-500">
                <span>
                  {d.label}
                  {d.allowed < d.claimed && <span className="text-amber-600"> (capped)</span>}
                </span>
                <span className="tabular-nums">− {formatCurrency(d.allowed)}</span>
              </div>
            ))}
          </div>
          {line("Taxable income", r.taxableIncome, { strong: true })}
        </div>

        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                <th className="px-2 py-1.5 font-medium">Slab</th>
                <th className="px-2 py-1.5 text-right font-medium">Rate</th>
                <th className="px-2 py-1.5 text-right font-medium">Tax</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {r.slabs.map((s) => (
                <tr key={s.from} className={s.amount > 0 ? "text-slate-700" : "text-slate-300"}>
                  <td className="px-2 py-1.5 whitespace-nowrap">{slabLabel(s.from, s.to)}</td>
                  <td className="px-2 py-1.5 text-right">{pct(s.rate)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(s.tax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-slate-100">
          {line("Tax on slabs", r.slabTax)}
          {r.rebate > 0 && line(r.regime === "new" && r.taxableIncome > 1200000 ? "Marginal relief u/s 87A" : "Rebate u/s 87A", r.rebate, { minus: true, muted: true })}
          {r.surcharge > 0 && line(`Surcharge (${pct(r.surchargeRate)})`, r.surcharge, { muted: true })}
          {line("Health & education cess (4%)", r.cess, { muted: true })}
          {line("Total tax payable", r.totalTax, { strong: true })}
          {line("Monthly TDS", r.monthlyTax)}
          <div className="flex justify-between py-1 text-xs text-slate-500">
            <span>Effective rate</span>
            <span>{(r.effectiveRate * 100).toFixed(2)}%</span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
