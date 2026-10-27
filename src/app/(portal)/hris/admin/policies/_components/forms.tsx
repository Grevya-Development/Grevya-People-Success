import type { Tables } from "@/lib/database.types";
import { Field, FormGrid, Input, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { saveFaq } from "../actions";

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
