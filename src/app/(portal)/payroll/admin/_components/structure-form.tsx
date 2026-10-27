"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";
import { saveSalaryStructure } from "../actions";
import { DEFAULT_FBP, splitCtc } from "../../_lib/payroll";

export function StructureForm({
  employeeId,
  current,
  today,
  minDate,
}: {
  employeeId: string;
  current: { annual_ctc: number; fbp_total: number; variable_pay: number } | null;
  today: string;
  minDate?: string;
}) {
  const [ctc, setCtc] = useState(current ? String(current.annual_ctc) : "");
  const [fbp, setFbp] = useState(String(current?.fbp_total ?? DEFAULT_FBP));
  const [variable, setVariable] = useState(current?.variable_pay ? String(current.variable_pay) : "0");
  const split = splitCtc(Number(ctc) || 0, Number(fbp) || 0, Number(variable) || 0);
  const negative = split.special_allowance < 0;
  const gross = split.basic + split.hra + split.special_allowance + split.fbp_total;

  const rows: [string, number, string?][] = [
    ["Basic", split.basic, "40% of CTC"],
    ["House Rent Allowance", split.hra, "50% of basic"],
    ["Special Allowance", split.special_allowance, "Balancing figure"],
    ["Flexible Benefit Plan", split.fbp_total],
    ["Gross salary", gross, "Taxable fixed pay"],
    ["Employer PF", split.pf_employer, "12% of basic"],
    ["Gratuity", split.gratuity, "4.81% of basic"],
    ["Variable pay", split.variable_pay, "Paid separately"],
  ];

  return (
    <ActionForm action={saveSalaryStructure} className="space-y-4">
      <input type="hidden" name="employee_id" value={employeeId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Annual CTC (₹)" htmlFor="annual_ctc" required>
          <Input id="annual_ctc" name="annual_ctc" type="number" min={1} step="1" required value={ctc} onChange={(e) => setCtc(e.target.value)} autoFocus />
        </Field>
        <Field label="Effective from" htmlFor="effective_from" required hint={minDate ? `On or after ${minDate}` : undefined}>
          <Input id="effective_from" name="effective_from" type="date" required min={minDate} defaultValue={minDate && minDate > today ? minDate : today} />
        </Field>
        <Field label="FBP (annual ₹)" htmlFor="fbp_total" hint="Default ₹1,20,000">
          <Input id="fbp_total" name="fbp_total" type="number" min={0} step="1" value={fbp} onChange={(e) => setFbp(e.target.value)} />
        </Field>
        <Field label="Variable pay (annual ₹)" htmlFor="variable_pay" hint="Part of CTC, not paid monthly">
          <Input id="variable_pay" name="variable_pay" type="number" min={0} step="1" value={variable} onChange={(e) => setVariable(e.target.value)} />
        </Field>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Component</th>
              <th className="px-3 py-2 text-right font-medium">Annual</th>
              <th className="px-3 py-2 text-right font-medium">Monthly</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(([label, amount, hint]) => {
              const strong = label === "Gross salary";
              return (
                <tr key={label} className={cn(strong && "bg-[#f3f8ec] font-semibold")}>
                  <td className="px-3 py-1.5">
                    {label}
                    {hint && <span className="ml-1 text-xs font-normal text-slate-400">· {hint}</span>}
                  </td>
                  <td className={cn("px-3 py-1.5 text-right tabular-nums", label === "Special Allowance" && negative && "text-red-600")}>{formatCurrency(amount)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{formatCurrency(amount / 12)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 font-semibold">
              <td className="px-3 py-2">Total CTC</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(split.annual_ctc)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(split.annual_ctc / 12)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {negative && <p className="text-xs text-red-600">FBP and variable pay are too high for this CTC — special allowance would be negative.</p>}
      {current && <p className="text-xs text-slate-500">Saving creates a new revision and marks the current structure ({formatCurrency(current.annual_ctc)}) as historical.</p>}

      <div className="flex justify-end">
        <SubmitButton disabled={negative || !(Number(ctc) > 0)}>{current ? "Save revision" : "Create structure"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
