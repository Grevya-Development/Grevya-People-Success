import Link from "next/link";
import type { Tables } from "@/lib/database.types";
import { orgToday } from "@/lib/utils";
import { Checkbox, Field, FormGrid, Input, Textarea, buttonClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { saveFaq, savePolicy } from "../actions";

export function PolicyForm({ policy, categories }: { policy: Tables<"policies"> | null; categories: string[] }) {
  const listId = "policy-categories";
  return (
    <ActionForm action={savePolicy} successMessage="Policy saved" className="space-y-4">
      {policy && <input type="hidden" name="id" value={policy.id} />}
      <FormGrid>
        <Field label="Title" htmlFor="p-title" required className="sm:col-span-2">
          <Input id="p-title" name="title" required maxLength={200} defaultValue={policy?.title ?? ""} placeholder="e.g. Code of Conduct" />
        </Field>
        <Field label="Category" htmlFor="p-category" required hint="Pick an existing category or type a new one">
          <Input id="p-category" name="category" required maxLength={60} list={listId} defaultValue={policy?.category ?? "General"} />
          <datalist id={listId}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Version" htmlFor="p-version" required>
            <Input id="p-version" name="version" required maxLength={20} defaultValue={policy?.version ?? "1.0"} />
          </Field>
          <Field label="Effective date" htmlFor="p-date" required>
            <Input id="p-date" name="effective_date" type="date" required defaultValue={policy?.effective_date ?? orgToday()} />
          </Field>
        </div>
        <Field label="Summary" htmlFor="p-summary" hint="Shown on the policy card (max 600 characters)" className="sm:col-span-2">
          <Textarea id="p-summary" name="summary" rows={2} maxLength={600} defaultValue={policy?.summary ?? ""} />
        </Field>
        <Field
          label="Content"
          htmlFor="p-content"
          required
          hint="HTML is supported (<h2>, <p>, <ul>, <ol>, <table>, <strong>…). Plain text is shown as paragraphs."
          className="sm:col-span-2"
        >
          <Textarea id="p-content" name="content" rows={14} required className="font-mono text-xs" defaultValue={policy?.content ?? ""} />
        </Field>
      </FormGrid>
      <div className="flex flex-col gap-2 rounded-lg bg-slate-50 px-4 py-3">
        <Checkbox name="published" label="Published (visible to all employees)" defaultChecked={policy?.published ?? true} />
        <Checkbox name="requires_acknowledgement" label="Employees must acknowledge this policy" defaultChecked={policy?.requires_acknowledgement ?? false} />
        {policy && (
          <Checkbox
            name="reset_acknowledgements"
            label="Clear existing acknowledgements so everyone re-acknowledges this version"
            className="text-amber-700"
          />
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Link href="/hris/admin/policies" className={buttonClass("ghost")}>
          Cancel
        </Link>
        <SubmitButton>{policy ? "Save changes" : "Create policy"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function FaqForm({ faq, categories }: { faq?: Tables<"faqs">; categories: string[] }) {
  const listId = `faq-categories-${faq?.id ?? "new"}`;
  return (
    <ActionForm action={saveFaq} successMessage={faq ? "FAQ updated" : "FAQ added"} className="space-y-4">
      {faq && <input type="hidden" name="id" value={faq.id} />}
      <FormGrid>
        <Field label="Category" required>
          <Input name="category" required maxLength={60} list={listId} defaultValue={faq?.category ?? "General"} />
          <datalist id={listId}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Sort order" hint="Lower numbers appear first">
          <Input name="sort_order" type="number" min={0} max={9999} step={1} defaultValue={faq?.sort_order ?? 0} />
        </Field>
        <Field label="Question" required className="sm:col-span-2">
          <Input name="question" required maxLength={300} defaultValue={faq?.question ?? ""} />
        </Field>
        <Field label="Answer" required className="sm:col-span-2">
          <Textarea name="answer" rows={5} required maxLength={5000} defaultValue={faq?.answer ?? ""} />
        </Field>
      </FormGrid>
      <div className="flex justify-end">
        <SubmitButton>{faq ? "Save FAQ" : "Add FAQ"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
