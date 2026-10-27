"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Input, ProgressBar } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";
import { saveFbp } from "../actions";
import { IntentButtons } from "./intent-buttons";

type Comp = { code: string; label: string; limit: number; hint: string; declared: number };

export function FbpForm({ components, fbpTotal, readOnly }: { components: Comp[]; fbpTotal: number; readOnly: boolean }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(components.map((c) => [c.code, c.declared ? String(c.declared) : ""])));
  const amount = (code: string) => Math.max(0, Number(vals[code]) || 0);
  const total = components.reduce((a, c) => a + amount(c.code), 0);
  const remaining = fbpTotal - total;
  const overAny = components.some((c) => amount(c.code) > c.limit);
  const over = remaining < -0.004;

  return (
    <ActionForm action={saveFbp} resetOnSuccess={false} className="space-y-5">
      <div className="overflow-x-auto thin-scroll">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Component</th>
              <th className="px-4 py-2.5 text-right font-medium">Annual limit</th>
              <th className="px-4 py-2.5 text-right font-medium">Declared (annual)</th>
              <th className="px-4 py-2.5 text-right font-medium">Monthly</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {components.map((c) => {
              const a = amount(c.code);
              const bad = a > c.limit;
              return (
                <tr key={c.code}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{c.label}</p>
                    <p className="text-xs text-slate-500">{c.hint}</p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatCurrency(c.limit)}</td>
                  <td className="px-4 py-3 text-right">
                    <Input
                      name={`amt_${c.code}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={c.limit}
                      step="1"
                      value={vals[c.code]}
                      onChange={(e) => setVals((v) => ({ ...v, [c.code]: e.target.value }))}
                      disabled={readOnly}
                      placeholder="0"
                      aria-invalid={bad || undefined}
                      className={cn("ml-auto w-36 text-right", bad && "border-red-400")}
                    />
                    {bad && <p className="mt-1 text-xs text-red-600">Max {formatCurrency(c.limit)}</p>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatCurrency(a / 12)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
              <td className="px-4 py-3" colSpan={2}>
                Total declared
              </td>
              <td className={cn("px-4 py-3 text-right tabular-nums", over && "text-red-600")}>{formatCurrency(total)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(total / 12)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="rounded-xl bg-[#f3f8ec] p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-slate-600">
            Used <b className="text-slate-900">{formatCurrency(total)}</b> of {formatCurrency(fbpTotal)}
          </span>
          <span className={cn("font-medium", over ? "text-red-600" : "text-[#4f7a1f]")}>
            {over ? `Over by ${formatCurrency(-remaining)}` : `${formatCurrency(remaining)} unallocated (paid as taxable FBP balance)`}
          </span>
        </div>
        <ProgressBar value={fbpTotal > 0 ? (total / fbpTotal) * 100 : 0} barClassName={over ? "bg-red-500" : "bg-[#78a83a]"} />
      </div>

      {!readOnly && <IntentButtons submitLabel="Submit to HR" disabled={over || overAny} submitDisabled={total <= 0} />}
    </ActionForm>
  );
}
