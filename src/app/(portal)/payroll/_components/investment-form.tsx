"use client";

import { useState } from "react";
import { Lock, TrendingDown } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { Card, CardBody, CardHeader, Checkbox, Field, Input } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";
import { saveInvestments } from "../actions";
import { IntentButtons } from "./intent-buttons";
import { computeTax, type Regime } from "../_lib/tax";
import { INVESTMENT_ITEMS, INVESTMENT_SECTIONS, deductionsFromInvestments, type InvestmentItem } from "../_lib/payroll";

type Salary = { basic: number; hra: number; gross: number } | null;

const n = (v: string | undefined) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

export function InvestmentForm({
  items,
  regime: initialRegime,
  salary,
  epfAnnual,
  readOnly,
}: {
  items: InvestmentItem[];
  regime: Regime;
  salary: Salary;
  epfAnnual: number;
  readOnly: boolean;
}) {
  const hraInit = items.find((i) => i.code === "hra");
  const [regime, setRegime] = useState<Regime>(initialRegime);
  const [declared, setDeclared] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.code, i.declared ? String(i.declared) : ""])));
  const [proof, setProof] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.code, i.proof_amount ? String(i.proof_amount) : ""])));
  const [rent, setRent] = useState(hraInit?.monthly_rent ? String(hraInit.monthly_rent) : "");
  const [landlordName, setLandlordName] = useState(hraInit?.landlord_name ?? "");
  const [landlordPan, setLandlordPan] = useState(hraInit?.landlord_pan ?? "");
  const [metro, setMetro] = useState(!!hraInit?.metro);

  const annualRent = n(rent) * 12;
  const current: InvestmentItem[] = INVESTMENT_ITEMS.map((d) => ({
    code: d.code,
    section: d.section,
    label: d.label,
    declared: d.code === "hra" ? annualRent : n(declared[d.code]),
    proof_amount: n(proof[d.code]),
    metro: d.code === "hra" ? metro : undefined,
  }));

  const impact = (() => {
    if (!salary) return null;
    const ded = deductionsFromInvestments(current, salary, { epf: epfAnnual });
    const withDecl = computeTax("old", { grossSalary: salary.gross, deductions: ded });
    const bare = computeTax("old", { grossSalary: salary.gross, deductions: { professionalTax: ded.professionalTax, sec80C: epfAnnual } });
    const newR = computeTax("new", { grossSalary: salary.gross });
    return { old: withDecl, bare, new: newR, deductions: ded };
  })();

  const sum80C = current.filter((i) => i.section === "80C").reduce((a, i) => a + i.declared, 0) + epfAnnual;
  const panNeeded = annualRent > 100000;

  const amountInput = (name: string, value: string, onChange: (v: string) => void, label: string) => (
    <Input
      name={name}
      type="number"
      inputMode="numeric"
      min={0}
      step="1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={readOnly}
      placeholder="0"
      aria-label={label}
      className="w-full text-right sm:w-36"
    />
  );

  return (
    <ActionForm action={saveInvestments} resetOnSuccess={false} className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <Card>
          <CardHeader title="Tax regime" description="Old regime allows the deductions below; the new regime has lower slabs but only a standard deduction." />
          <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(["new", "old"] as Regime[]).map((r) => (
              <label
                key={r}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition",
                  regime === r ? "border-[#78a83a] bg-[#f3f8ec] ring-1 ring-[#78a83a]" : "border-slate-200 hover:bg-slate-50",
                  readOnly && "cursor-default",
                )}
              >
                <input type="radio" name="regime" value={r} checked={regime === r} onChange={() => setRegime(r)} disabled={readOnly} className="mt-1 accent-[#78a83a]" />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">{r === "new" ? "New regime" : "Old regime"}</span>
                  <span className="block text-xs text-slate-500">
                    {impact ? `Estimated tax ${formatCurrency(impact[r].totalTax)} a year` : r === "new" ? "Default regime" : "With exemptions & deductions"}
                  </span>
                </span>
              </label>
            ))}
            {readOnly && <input type="hidden" name="regime" value={regime} />}
          </CardBody>
        </Card>

        {regime === "new" && (
          <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800 ring-1 ring-blue-200">
            Under the new regime these deductions don&apos;t reduce your TDS, but you can still record them — handy if you switch to the old regime when filing your return.
          </p>
        )}

        {INVESTMENT_SECTIONS.map((sec) => {
          const defs = INVESTMENT_ITEMS.filter((d) => d.section === sec.section);
          return (
            <Card key={sec.section}>
              <CardHeader
                title={sec.title}
                description={sec.note}
                action={sec.section === "80C" ? <span className={cn("text-xs font-medium", sum80C > 150000 ? "text-amber-600" : "text-slate-500")}>{formatCurrency(Math.min(sum80C, 150000))} / ₹1,50,000</span> : undefined}
              />
              <CardBody className="space-y-3">
                {sec.section === "HRA" ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Monthly rent (₹)" htmlFor="monthly_rent" hint={annualRent > 0 ? `${formatCurrency(annualRent)} a year` : undefined}>
                        <Input id="monthly_rent" name="monthly_rent" type="number" min={0} step="1" value={rent} onChange={(e) => setRent(e.target.value)} disabled={readOnly} placeholder="0" />
                      </Field>
                      <Field label="Rent receipts submitted (₹, annual)" htmlFor="proof_hra">
                        <Input id="proof_hra" name="proof_hra" type="number" min={0} step="1" value={proof.hra ?? ""} onChange={(e) => setProof((p) => ({ ...p, hra: e.target.value }))} disabled={readOnly} placeholder="0" />
                      </Field>
                      <Field label="Landlord name" htmlFor="landlord_name" required={annualRent > 0}>
                        <Input id="landlord_name" name="landlord_name" maxLength={120} value={landlordName} onChange={(e) => setLandlordName(e.target.value)} disabled={readOnly} />
                      </Field>
                      <Field label="Landlord PAN" htmlFor="landlord_pan" required={panNeeded} hint={panNeeded ? "Required — annual rent exceeds ₹1,00,000" : "Format ABCDE1234F"}>
                        <Input
                          id="landlord_pan"
                          name="landlord_pan"
                          maxLength={10}
                          value={landlordPan}
                          onChange={(e) => setLandlordPan(e.target.value.toUpperCase())}
                          disabled={readOnly}
                          pattern="[A-Z]{5}[0-9]{4}[A-Z]"
                          className="uppercase"
                        />
                      </Field>
                    </div>
                    <Checkbox name="metro" label="I live in a metro city (Delhi, Mumbai, Kolkata, Chennai)" checked={metro} onChange={(e) => setMetro(e.target.checked)} disabled={readOnly} />
                    {readOnly && metro && <input type="hidden" name="metro" value="on" />}
                    {impact && annualRent > 0 && (
                      <p className="text-xs text-slate-500">
                        Estimated HRA exemption: <b className="text-slate-800">{formatCurrency(impact.deductions.hraExemption)}</b> a year
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="hidden grid-cols-[1fr_9rem_9rem] gap-4 text-xs font-medium uppercase tracking-wide text-slate-400 sm:grid">
                      <span>Item</span>
                      <span className="text-right">Declared</span>
                      <span className="text-right">Proof submitted</span>
                    </div>
                    {sec.section === "80C" && (
                      <div className="grid grid-cols-1 items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 sm:grid-cols-[1fr_9rem_9rem] sm:gap-4">
                        <span className="flex items-center gap-1.5 text-sm text-slate-700">
                          <Lock className="h-3.5 w-3.5 text-slate-400" />
                          Employee PF contribution (auto)
                        </span>
                        <span className="text-right text-sm font-medium tabular-nums text-slate-700">{formatCurrency(epfAnnual)}</span>
                        <span className="text-right text-xs text-slate-400">Via payroll</span>
                      </div>
                    )}
                    {defs.map((d) => (
                      <div key={d.code} className="grid grid-cols-1 items-center gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[1fr_9rem_9rem] sm:gap-4 sm:border-0 sm:pt-0">
                        <div>
                          <p className="text-sm text-slate-800">{d.label}</p>
                          {d.hint && <p className="text-xs text-slate-500">{d.hint}</p>}
                          {d.cap && n(declared[d.code]) > d.cap && <p className="text-xs text-amber-600">Only {formatCurrency(d.cap)} is deductible</p>}
                        </div>
                        <div className="flex items-center gap-2 sm:block">
                          <span className="w-16 text-xs text-slate-500 sm:hidden">Declared</span>
                          {amountInput(`declared_${d.code}`, declared[d.code] ?? "", (v) => setDeclared((s) => ({ ...s, [d.code]: v })), `${d.label} declared`)}
                        </div>
                        <div className="flex items-center gap-2 sm:block">
                          <span className="w-16 text-xs text-slate-500 sm:hidden">Proof</span>
                          {amountInput(`proof_${d.code}`, proof[d.code] ?? "", (v) => setProof((s) => ({ ...s, [d.code]: v })), `${d.label} proof`)}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </CardBody>
            </Card>
          );
        })}

        {!readOnly && (
          <Card>
            <CardBody>
              <IntentButtons submitLabel="Submit to HR" />
            </CardBody>
          </Card>
        )}
      </div>

      {/* Tax impact */}
      <div className="xl:sticky xl:top-4 xl:self-start">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 bg-[#78a83a] px-4 py-2.5 text-white">
            <TrendingDown className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Estimated tax impact</h3>
          </div>
          <CardBody className="space-y-3 text-sm">
            {!impact ? (
              <p className="text-slate-500">Your salary structure isn&apos;t set up yet, so tax can&apos;t be estimated.</p>
            ) : (
              <>
                <Row label="Annual gross salary" value={impact.old.grossSalary} />
                <Row label="Old regime deductions" value={impact.old.totalDeductions} />
                <div className="rounded-lg bg-slate-50 p-3">
                  <Row label="Old regime tax" value={impact.old.totalTax} strong={regime === "old"} />
                  <Row label="New regime tax" value={impact.new.totalTax} strong={regime === "new"} />
                </div>
                {impact.bare.totalTax > impact.old.totalTax && (
                  <p className="text-xs text-emerald-700">Your declarations save {formatCurrency(impact.bare.totalTax - impact.old.totalTax)} under the old regime.</p>
                )}
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-500">Monthly TDS with your chosen ({regime}) regime</p>
                  <p className="text-2xl font-semibold tabular-nums text-slate-900">{formatCurrency(impact[regime].monthlyTax)}</p>
                </div>
                {impact.old.totalTax !== impact.new.totalTax && (
                  <p className={cn("rounded-lg px-3 py-2 text-xs", (impact.old.totalTax < impact.new.totalTax ? "old" : "new") === regime ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>
                    The {impact.old.totalTax < impact.new.totalTax ? "old" : "new"} regime is cheaper by {formatCurrency(Math.abs(impact.old.totalTax - impact.new.totalTax))} a year.
                  </p>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </ActionForm>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3 py-0.5", strong ? "font-semibold text-slate-900" : "text-slate-600")}>
      <span>{label}</span>
      <span className="tabular-nums">{formatCurrency(value)}</span>
    </div>
  );
}
