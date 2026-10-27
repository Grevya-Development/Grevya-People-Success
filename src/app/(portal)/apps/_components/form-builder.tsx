"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button, Card, CardBody, CardHeader, Checkbox, EmptyState, Field, FormGrid, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { cn } from "@/lib/utils";
import { saveDeclarationForm } from "../declarations/actions";
import { FIELD_TYPES, FIELD_TYPE_LABELS, MAX_FIELDS, slugify, uniqueKey, type DeclField, type FieldType } from "../declarations/_lib/fields";

type Row = {
  uid: string;
  /** key saved in the DB — kept stable so existing responses still line up */
  savedKey: string | null;
  label: string;
  type: FieldType;
  optionsText: string;
  required: boolean;
};

export type BuilderInitial = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  active: boolean;
  fields: DeclField[];
};

let counter = 0;
const newUid = () => `n${Date.now().toString(36)}${(counter++).toString(36)}`;

export function FormBuilder({ initial }: { initial?: BuilderInitial }) {
  const [rows, setRows] = useState<Row[]>(() =>
    (initial?.fields ?? []).map((f, i) => ({
      uid: `init-${i}`,
      savedKey: f.key,
      label: f.label,
      type: f.type,
      optionsText: (f.options ?? []).join("\n"),
      required: !!f.required,
    })),
  );

  // Final keys: saved keys stay as-is, new fields get a unique slug of their label.
  const keyed = useMemo(() => {
    const taken = new Set(rows.filter((r) => r.savedKey).map((r) => r.savedKey!));
    return rows.map((r) => ({ ...r, key: r.savedKey ?? uniqueKey(slugify(r.label), taken) }));
  }, [rows]);

  const payload = JSON.stringify(
    keyed.map((r) => ({
      key: r.key,
      label: r.label.trim(),
      type: r.type,
      required: r.required,
      ...(r.type === "select"
        ? {
            options: r.optionsText
              .split("\n")
              .map((o) => o.trim())
              .filter(Boolean),
          }
        : {}),
    })),
  );

  const update = (uid: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  const move = (i: number, dir: -1 | 1) =>
    setRows((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const add = (type: FieldType = "text") =>
    setRows((rs) => (rs.length >= MAX_FIELDS ? rs : [...rs, { uid: newUid(), savedKey: null, label: "", type, optionsText: "", required: false }]));

  return (
    <ActionForm action={saveDeclarationForm} resetOnSuccess={false} className="space-y-6">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="fields" value={payload} />

      <Card>
        <CardHeader title="Form details" />
        <CardBody className="space-y-4">
          <Field label="Title" htmlFor="title" required>
            <Input id="title" name="title" required maxLength={150} defaultValue={initial?.title} placeholder="e.g. Conflict of Interest Declaration FY 2026-27" />
          </Field>
          <Field label="Description" htmlFor="description" hint="Shown to employees above the form.">
            <Textarea id="description" name="description" rows={3} maxLength={2000} defaultValue={initial?.description ?? ""} />
          </Field>
          <FormGrid>
            <Field label="Due date" htmlFor="due_date" hint="Employees can submit and edit until this date. Leave empty for no deadline.">
              <Input id="due_date" name="due_date" type="date" defaultValue={initial?.due_date ?? ""} />
            </Field>
            <div className="flex items-center sm:pt-6">
              <Checkbox name="active" defaultChecked={initial?.active ?? true} label="Active — visible to employees" />
            </div>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Questions"
          description={`${rows.length} of ${MAX_FIELDS} fields`}
          action={
            <Button variant="secondary" size="sm" onClick={() => add()} disabled={rows.length >= MAX_FIELDS}>
              <Plus className="h-3.5 w-3.5" /> Add field
            </Button>
          }
        />
        {rows.length === 0 ? (
          <EmptyState
            title="No fields yet"
            description="Add the questions employees need to answer."
            action={
              <Button variant="outline" onClick={() => add()}>
                <Plus className="h-4 w-4" /> Add first field
              </Button>
            }
          />
        ) : (
          <ol className="divide-y divide-slate-100">
            {keyed.map((r, i) => (
              <li key={r.uid} className="flex gap-3 px-4 py-4 sm:px-5">
                <div className="flex flex-col items-center gap-1 pt-1 text-slate-400">
                  <GripVertical className="hidden h-4 w-4 sm:block" />
                  <span className="text-xs font-semibold text-slate-500">{i + 1}</span>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30" aria-label="Move up">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30" aria-label="Move down">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px]">
                    <div>
                      <Input value={r.label} onChange={(e) => update(r.uid, { label: e.target.value })} placeholder="Question / label" aria-label={`Field ${i + 1} label`} maxLength={200} />
                      <p className="mt-1 font-mono text-[11px] text-slate-400">
                        key: {r.key}
                        {r.savedKey && " (locked — responses use this key)"}
                      </p>
                    </div>
                    <Select value={r.type} onChange={(e) => update(r.uid, { type: e.target.value as FieldType })} aria-label={`Field ${i + 1} type`}>
                      {FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {FIELD_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {r.type === "select" && (
                    <div>
                      <Textarea
                        rows={3}
                        value={r.optionsText}
                        onChange={(e) => update(r.uid, { optionsText: e.target.value })}
                        placeholder={"Options, one per line\nYes\nNo"}
                        aria-label={`Field ${i + 1} options`}
                      />
                      <p className="mt-1 text-[11px] text-slate-400">One option per line (at least two).</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={r.required}
                        onChange={(e) => update(r.uid, { required: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      onClick={() => setRows((rs) => rs.filter((x) => x.uid !== r.uid))}
                      className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50")}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
        {rows.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
            <span className="self-center text-xs text-slate-500">Quick add:</span>
            {FIELD_TYPES.map((t) => (
              <Button key={t} variant="ghost" size="sm" onClick={() => add(t)} disabled={rows.length >= MAX_FIELDS}>
                <Plus className="h-3 w-3" /> {FIELD_TYPE_LABELS[t]}
              </Button>
            ))}
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <SubmitButton>{initial ? "Save changes" : "Create form"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
