import { Info, Send, Save, Globe } from "lucide-react";
import { Field, FormGrid, Input, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { saveWikiArticle } from "../wiki-actions";
import { WIKI_CATEGORIES } from "../_lib/wiki";

type Article = { id: string; title: string; category: string; tags: string[]; content: string; status: string };

export function WikiForm({ article, isHR, categories = [] }: { article?: Article; isHR: boolean; categories?: string[] }) {
  const allCategories = [...new Set([...WIKI_CATEGORIES, ...categories])].sort();
  return (
    <ActionForm action={saveWikiArticle} resetOnSuccess={false} className="space-y-5">
      {article && <input type="hidden" name="id" value={article.id} />}
      {article?.status === "published" && !isHR && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This article is live. Saving changes takes it off the wiki until HR reviews it again.
        </p>
      )}
      <FormGrid>
        <Field label="Title" required className="sm:col-span-2">
          <Input name="title" defaultValue={article?.title} required maxLength={200} placeholder="e.g. How we run model evaluations" />
        </Field>
        <Field label="Category" required hint="Pick one or type a new category">
          <Input name="category" list="wiki-categories" defaultValue={article?.category ?? "General"} required maxLength={60} />
          <datalist id="wiki-categories">
            {allCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Tags" hint="Comma separated, up to 10">
          <Input name="tags" defaultValue={article?.tags.join(", ")} placeholder="rag, evals, python" maxLength={300} />
        </Field>
        <Field
          label="Content"
          required
          className="sm:col-span-2"
          hint={
            <>
              Formatting: <code className="text-[#25708a]"># Heading</code>, <code className="text-[#25708a]">## Sub-heading</code>,{" "}
              <code className="text-[#25708a]">- bullet</code>, <code className="text-[#25708a]">1. step</code>, <code className="text-[#25708a]">&gt; note</code>,{" "}
              <code className="text-[#25708a]">**bold**</code>, <code className="text-[#25708a]">`code`</code>. Leave a blank line between paragraphs.
            </>
          }
        >
          <Textarea
            name="content"
            defaultValue={article?.content}
            rows={16}
            maxLength={50000}
            className="font-mono text-[13px] leading-6"
            placeholder={"# Overview\nWhat this article covers…\n\n## Steps\n- First step\n- Second step"}
          />
        </Field>
      </FormGrid>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
        <SubmitButton variant="outline" name="intent" value="draft">
          <Save className="h-4 w-4" /> Save draft
        </SubmitButton>
        {isHR ? (
          <SubmitButton name="intent" value="publish">
            <Globe className="h-4 w-4" /> Publish
          </SubmitButton>
        ) : (
          <SubmitButton name="intent" value="submit">
            <Send className="h-4 w-4" /> Submit for review
          </SubmitButton>
        )}
      </div>
    </ActionForm>
  );
}
