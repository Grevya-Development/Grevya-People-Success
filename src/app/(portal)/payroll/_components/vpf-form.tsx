"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { submitVpf } from "../actions";

export function VpfForm({ monthlyBasic, minMonth, disabled }: { monthlyBasic: number; minMonth: string; disabled?: boolean }) {
  const [pct, setPct] = useState("0");
  const p = Math.min(88, Math.max(0, Number(pct) || 0));
  const vpf = (monthlyBasic * p) / 100;
  const epf = monthlyBasic * 0.12;

  return (
    <ActionForm action={submitVpf} successMessage="VPF declaration submitted" onSuccess={() => setPct("0")} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Additional VPF (% of basic)" htmlFor="percentage" required hint="Between 0% and 88%. Choose 0% to stop VPF.">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={88}
              step={1}
              value={p}
              onChange={(e) => setPct(e.target.value)}
              disabled={disabled}
              className="h-2 flex-1 cursor-pointer accent-[#78a83a]"
              aria-label="VPF percentage"
            />
            <Input
              id="percentage"
              name="percentage"
              type="number"
              min={0}
              max={88}
              step="0.5"
              required
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              disabled={disabled}
              className="w-24"
            />
          </div>
        </Field>
        <Field label="Effective from" htmlFor="effective_month" required hint="Deductions start with this month's payroll">
          <Input id="effective_month" name="effective_month" type="month" min={minMonth} defaultValue={minMonth} required disabled={disabled} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl bg-[#f3f8ec] p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-slate-500">Mandatory EPF (12%)</p>
          <p className="text-lg font-semibold tabular-nums text-slate-800">{formatCurrency(epf)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">VPF ({p}%) per month</p>
          <p className="text-lg font-semibold tabular-nums text-[#4f7a1f]">{formatCurrency(vpf)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Your total PF per month</p>
          <p className="text-lg font-semibold tabular-nums text-slate-900">{formatCurrency(epf + vpf)}</p>
          <p className="text-xs text-slate-500">{formatCurrency((epf + vpf) * 12)} a year</p>
        </div>
      </div>

      <div className="flex justify-end">
        <SubmitButton disabled={disabled}>Submit declaration</SubmitButton>
      </div>
    </ActionForm>
  );
}
