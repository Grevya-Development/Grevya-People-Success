"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Search, Sparkles } from "lucide-react";
import { Button, Field, FormGrid, Input, Select, Badge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { EXTRA_FIELDS, LETTER_LABELS, LETTER_TYPES, letterCategory, type LetterType } from "../../../_lib/letter-templates";
import { generateLetterDraft, issueLetter } from "../actions";
import { LetterEditor } from "./letter-editor";

export type EmployeeOption = { id: string; full_name: string; employee_code: string; status: string };

export function IssueLetterForm({ employees, defaultEmployeeId, today }: { employees: EmployeeOption[]; defaultEmployeeId?: string; today: string }) {
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId && employees.some((e) => e.id === defaultEmployeeId) ? defaultEmployeeId : "");
  const [type, setType] = useState<LetterType | "">("");
  const [query, setQuery] = useState("");
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [generating, startGenerating] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? employees.filter((e) => e.full_name.toLowerCase().includes(q) || e.employee_code.toLowerCase().includes(q)) : employees;
    // Keep the selected person visible even when filtered out.
    const selected = employees.find((e) => e.id === employeeId);
    return selected && !list.includes(selected) ? [selected, ...list] : list;
  }, [employees, query, employeeId]);

  const fields = type ? (EXTRA_FIELDS[type] ?? []) : [];
  const hasDraft = content.trim().length > 0;

  const generate = () => {
    if (!employeeId) return toast.error("Choose an employee first");
    if (!type) return toast.error("Choose a letter type first");
    const missing = fields.find((f) => f.required && !extras[f.key]?.trim());
    if (missing) return toast.error(`${missing.label} is required`);
    startGenerating(async () => {
      const res = await generateLetterDraft(employeeId, type, extras);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTitle(res.title);
      setContent(res.content);
      toast.success("Draft generated — review it below");
    });
  };

  const reset = () => {
    setType("");
    setExtras({});
    setTitle("");
    setContent("");
  };

  return (
    <ActionForm action={issueLetter} successMessage="Letter issued" resetOnSuccess={false} onSuccess={reset} className="space-y-5">
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="letter_type" value={type} />

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">1 · Employee & letter</p>
        <FormGrid>
          <Field label="Employee" htmlFor="issue-employee" required>
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name or code" className="pl-8" aria-label="Filter employees" />
              </div>
              <Select
                id="issue-employee"
                value={employeeId}
                onChange={(e) => {
                  setEmployeeId(e.target.value);
                  setTitle("");
                  setContent("");
                }}
              >
                <option value="">{filtered.length ? "Select employee…" : "No matches"}</option>
                {filtered.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} ({e.employee_code}){e.status === "exited" ? " — exited" : ""}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
          <Field label="Letter type" htmlFor="issue-type" required>
            <Select
              id="issue-type"
              value={type}
              onChange={(e) => {
                setType(e.target.value as LetterType | "");
                setExtras({});
                setTitle("");
                setContent("");
              }}
            >
              <option value="">Select letter type…</option>
              {LETTER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LETTER_LABELS[t]}
                </option>
              ))}
            </Select>
            {type && (
              <p className="mt-1.5 text-xs text-slate-500">
                Appears under <Badge tone={letterCategory(type) === "salary" ? "green" : "blue"}>{letterCategory(type) === "salary" ? "My Salary Letters" : "My Letters"}</Badge>
              </p>
            )}
          </Field>
          {fields.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`extra-${f.key}`} required={f.required} hint={f.hint}>
              <Input
                id={`extra-${f.key}`}
                type={f.type}
                min={f.type === "number" ? 0 : undefined}
                value={extras[f.key] ?? ""}
                onChange={(e) => setExtras((x) => ({ ...x, [f.key]: e.target.value }))}
              />
            </Field>
          ))}
        </FormGrid>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={generate} disabled={generating || !employeeId || !type} variant="secondary">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {hasDraft ? "Regenerate draft" : "Generate draft"}
          </Button>
          <p className="text-xs text-slate-500">Fills name, code, designation, department, dates, address and current salary structure.</p>
        </div>
      </div>

      {hasDraft ? (
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">2 · Review & issue</p>
          <LetterEditor title={title} content={content} onTitle={setTitle} onContent={setContent} />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-4">
            <Field label="Issue date" htmlFor="issued_on" className="w-48">
              <Input id="issued_on" name="issued_on" type="date" defaultValue={today} required />
            </Field>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={reset}>
                Discard
              </Button>
              <SubmitButton>Issue letter</SubmitButton>
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          Choose an employee and letter type, then generate a draft to review and edit it before issuing.
        </p>
      )}
    </ActionForm>
  );
}
