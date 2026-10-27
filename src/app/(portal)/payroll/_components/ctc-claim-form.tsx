"use client";

import { useState } from "react";
import { Paperclip } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { raiseCtcClaim } from "../actions";

export type CtcOption = { code: string; label: string; balance: number; maxAmount: number | null; requiresReceipt: boolean };

export function CtcClaimForm({ options, today, fyStart, defaultCode }: { options: CtcOption[]; today: string; fyStart: string; defaultCode?: string }) {
  const [code, setCode] = useState(defaultCode ?? options[0]?.code ?? "");
  const [amount, setAmount] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const opt = options.find((o) => o.code === code);
  const limit = opt ? Math.min(opt.balance, opt.maxAmount ?? Infinity) : 0;
  const over = Number(amount) > limit + 1e-9;

  return (
    <ActionForm action={raiseCtcClaim} successMessage="Claim submitted" className="space-y-4" onSuccess={() => { setAmount(""); setFileName(null); }}>
      <FormGrid>
        <Field label="Component" htmlFor="component" required className="sm:col-span-2">
          <Select id="component" name="component" value={code} onChange={(e) => setCode(e.target.value)} required>
            {options.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label} — {formatCurrency(o.balance)} available
              </option>
            ))}
          </Select>
          {opt && (
            <p className="mt-1 text-xs text-slate-500">
              You can claim up to {formatCurrency(limit, 2)}
              {opt.maxAmount != null && opt.maxAmount < opt.balance ? " per claim" : ""} · {opt.requiresReceipt ? "Bill required" : "Bill optional"}
            </p>
          )}
        </Field>
        <Field label="Title" htmlFor="ctc-title" required>
          <Input id="ctc-title" name="title" required maxLength={150} placeholder="e.g. Broadband bill — October" />
        </Field>
        <Field label="Bill date" htmlFor="ctc-date" required>
          <Input id="ctc-date" name="expense_date" type="date" required min={fyStart} max={today} defaultValue={today} />
        </Field>
        <Field label="Amount (₹)" htmlFor="ctc-amount" required>
          <Input
            id="ctc-amount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={over ? "border-red-400" : undefined}
          />
          {over && <p className="mt-1 text-xs text-red-600">Exceeds the available {formatCurrency(limit, 2)}</p>}
        </Field>
        <Field label="Bill / receipt" htmlFor="ctc-bill" required={opt?.requiresReceipt}>
          <label
            htmlFor="ctc-bill"
            className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 text-sm text-slate-600 hover:border-[#78a83a] hover:bg-[#f3f8ec]"
          >
            <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate">{fileName ?? "Choose file (PDF/image, ≤10 MB)"}</span>
          </label>
          <input
            id="ctc-bill"
            name="bill"
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
        </Field>
      </FormGrid>
      <Field label="Description" htmlFor="ctc-desc">
        <Textarea id="ctc-desc" name="description" rows={2} maxLength={2000} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton disabled={over || !opt}>Submit claim</SubmitButton>
      </div>
    </ActionForm>
  );
}
