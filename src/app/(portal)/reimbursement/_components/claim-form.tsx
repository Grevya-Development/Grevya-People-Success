"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { FileText, Paperclip, Save, Send } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, FormGrid, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { saveClaim } from "../actions";
import type { ClaimCategoryOption } from "../_lib/claims";

export type ClaimFormDefaults = {
  id: string;
  category_id: string;
  title: string;
  expense_date: string;
  amount: number;
  description: string | null;
  receipt_name: string | null;
  receipt_url: string | null;
};

/** Raise / edit an expense claim. Two submit buttons choose draft vs submit via a hidden input. */
export function ClaimForm({
  categories,
  today,
  defaults,
  cancelHref,
}: {
  categories: ClaimCategoryOption[];
  today: string;
  defaults?: ClaimFormDefaults;
  cancelHref: string;
}) {
  const intentRef = useRef<HTMLInputElement>(null);
  const [categoryId, setCategoryId] = useState(defaults?.category_id ?? "");
  const [amount, setAmount] = useState(defaults ? String(defaults.amount) : "");
  const cat = categories.find((c) => c.id === categoryId);
  const over = cat?.max_amount != null && Number(amount) > Number(cat.max_amount);
  const setIntent = (v: "draft" | "submit") => {
    if (intentRef.current) intentRef.current.value = v;
  };

  return (
    <ActionForm action={saveClaim} resetOnSuccess={!defaults} className="space-y-5">
      <input ref={intentRef} type="hidden" name="intent" defaultValue="draft" />
      {defaults && <input type="hidden" name="id" value={defaults.id} />}

      <FormGrid>
        <Field label="Expense category" htmlFor="category_id" required>
          <Select id="category_id" name="category_id" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="" disabled>
              Select a category
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {cat && (
            <p className="mt-1 text-xs text-slate-500">
              {cat.max_amount != null ? `Limit ${formatCurrency(cat.max_amount)} per claim` : "No per-claim limit"} ·{" "}
              {cat.requires_receipt ? "Receipt required" : "Receipt optional"}
            </p>
          )}
        </Field>
        <Field label="Claim title" htmlFor="title" required>
          <Input id="title" name="title" required maxLength={150} defaultValue={defaults?.title} placeholder="e.g. Client visit cab fare" />
        </Field>
        <Field label="Expense date" htmlFor="expense_date" required hint="Cannot be a future date">
          <Input id="expense_date" name="expense_date" type="date" required max={today} defaultValue={defaults?.expense_date} />
        </Field>
        <Field label="Amount (₹)" htmlFor="amount" required>
          <Input
            id="amount"
            name="amount"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={over || undefined}
            className={over ? "border-red-400 focus:border-red-500 focus:ring-red-500/20" : undefined}
          />
          {over && <p className="mt-1 text-xs text-red-600">Exceeds the {formatCurrency(cat?.max_amount)} limit for {cat?.name}</p>}
        </Field>
      </FormGrid>

      <Field label="Description" htmlFor="description" hint="Purpose of the expense, people involved, project, etc.">
        <Textarea id="description" name="description" rows={3} maxLength={2000} defaultValue={defaults?.description ?? ""} />
      </Field>

      <Field
        label={
          <>
            Receipt / bill
            {cat?.requires_receipt && <span className="ml-0.5 text-red-500">*</span>}
          </>
        }
        htmlFor="receipt"
        hint={cat?.requires_receipt ? "Required to submit. PDF or image, up to 10 MB." : "PDF or image, up to 10 MB."}
      >
        {defaults?.receipt_name && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <FileText className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate">Current: {defaults.receipt_name}</span>
            {defaults.receipt_url && (
              <a href={defaults.receipt_url} target="_blank" rel="noreferrer" className="ml-auto shrink-0 font-medium text-primary-600 hover:underline">
                View
              </a>
            )}
          </div>
        )}
        <label
          htmlFor="receipt"
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-600 hover:border-[#b3ad2a] hover:bg-[#eff0d2]/40"
        >
          <Paperclip className="h-4 w-4 text-[#7c7a17]" />
          <input id="receipt" name="receipt" type="file" accept="image/*,application/pdf" className="w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-[#eff0d2] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[#7c7a17]" />
        </label>
        {defaults?.receipt_name && <p className="mt-1 text-xs text-slate-500">Choosing a new file replaces the current receipt.</p>}
      </Field>

      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
        <Link href={cancelHref} className={buttonClass("ghost")}>
          Cancel
        </Link>
        <span className="contents" onClickCapture={() => setIntent("draft")}>
          <SubmitButton variant="outline">
            <Save className="h-4 w-4" />
            Save as draft
          </SubmitButton>
        </span>
        <span className="contents" onClickCapture={() => setIntent("submit")}>
          <SubmitButton disabled={over}>
            <Send className="h-4 w-4" />
            Submit claim
          </SubmitButton>
        </span>
      </div>
    </ActionForm>
  );
}
