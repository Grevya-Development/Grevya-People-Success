"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, Loader2, RotateCcw, Trash2, Upload } from "lucide-react";
import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import { orgToday } from "@/lib/utils";
import { Button, Checkbox, Field, FormGrid, Input, Textarea, buttonClass } from "@/components/ui";
import { savePolicy } from "../actions";
import { FileBadge } from "../../../policies/_components/file-badge";
import { POLICY_DOC_ACCEPT, POLICY_DOC_EXT, POLICY_DOC_MAX_BYTES, fileKind, formatBytes, safeFileName } from "../../../policies/_lib/files";

export function PolicyForm({ policy, categories, userId }: { policy: Tables<"policies"> | null; categories: string[]; userId: string | null }) {
  const listId = "policy-categories";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);

  const existing = policy?.document_path && !removeExisting ? policy : null;

  function pickFile(f: File | null) {
    if (f && f.size > POLICY_DOC_MAX_BYTES) {
      toast.error("Document must be 20 MB or smaller");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (f && !POLICY_DOC_EXT.test(f.name)) {
      toast.error("Upload a PDF, Word, Excel, ZIP or image file");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(f);
  }

  function clearFile() {
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.delete("document");
        const content = String(fd.get("content") ?? "").trim();
        if (!content && !file && !existing) {
          toast.error("Add policy content or upload a document");
          return;
        }
        startTransition(async () => {
          let uploaded: string | null = null;
          const supabase = createClient();
          if (file) {
            if (!userId) {
              toast.error("Your login is not linked to an employee record");
              return;
            }
            const path = `${userId}/policies/${crypto.randomUUID()}-${safeFileName(file.name)}`;
            const { error } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type || undefined });
            if (error) {
              toast.error(`Upload failed: ${error.message}`);
              return;
            }
            uploaded = path;
            fd.set("document_path", path);
            fd.set("document_name", file.name);
          } else if (policy?.document_path && removeExisting) {
            fd.set("remove_document", "1");
          }
          let res;
          try {
            res = await savePolicy(null, fd);
          } catch {
            res = { ok: false, error: "Something went wrong" };
          }
          if (res?.ok) {
            toast.success(res.message ?? "Policy saved");
            if (res.redirectTo) router.push(res.redirectTo);
          } else {
            if (uploaded) await supabase.storage.from("documents").remove([uploaded]);
            toast.error(res?.error ?? "Something went wrong");
          }
        });
      }}
    >
      <fieldset disabled={pending} aria-busy={pending} className="m-0 min-w-0 space-y-4 border-0 p-0">
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

          <Field label="Document" htmlFor="p-document" hint="PDF preferred · also Word, Excel, ZIP or images · up to 20 MB" className="sm:col-span-2">
            <input
              ref={fileRef}
              id="p-document"
              name="document"
              type="file"
              accept={POLICY_DOC_ACCEPT}
              className="sr-only"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary-200 bg-primary-50/40 p-3" data-testid="new-document">
                <FileBadge kind={fileKind(file.name, file.type)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                  <p className="text-xs text-slate-500">
                    {formatBytes(file.size)} · {policy?.document_path ? "will replace the current document" : "new upload"}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={clearFile}>
                  <RotateCcw className="h-3.5 w-3.5" /> Undo
                </Button>
              </div>
            ) : existing ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3" data-testid="current-document">
                <FileBadge kind={fileKind(existing.document_name, existing.document_type)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{existing.document_name}</p>
                  <p className="text-xs text-slate-500">{formatBytes(existing.document_size)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <a href={`/hris/policies/${existing.id}/document`} target="_blank" rel="noopener noreferrer" className={buttonClass("outline", "sm")}>
                    <Eye className="h-3.5 w-3.5" /> View
                  </a>
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5" /> Replace
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => setRemoveExisting(true)}>
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500 transition hover:border-primary-400 hover:text-primary-600"
                >
                  <Upload className="h-5 w-5" />
                  <span className="font-medium">Upload document</span>
                </button>
                {policy?.document_path && removeExisting && (
                  <p className="flex items-center gap-2 text-xs text-amber-700" data-testid="document-removed">
                    The current document ({policy.document_name}) will be removed when you save.
                    <button type="button" className="font-medium underline" onClick={() => setRemoveExisting(false)}>
                      Undo
                    </button>
                  </p>
                )}
              </div>
            )}
          </Field>

          <Field
            label="Content"
            htmlFor="p-content"
            hint="Optional when a document is attached. HTML is supported (<h2>, <p>, <ul>, <ol>, <table>, <strong>…). Plain text is shown as paragraphs."
            className="sm:col-span-2"
          >
            <Textarea id="p-content" name="content" rows={12} className="font-mono text-xs" defaultValue={policy?.content ?? ""} />
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
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {policy ? "Save changes" : "Create policy"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
