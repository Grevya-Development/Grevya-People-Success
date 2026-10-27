"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, Checkbox, Field, FormGrid, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { saveLearningPath } from "../paths-actions";

type CourseOpt = { id: string; title: string; category: string; published: boolean };

export function PathForm({
  path,
  courseIds = [],
  courses,
  categories,
}: {
  path?: { id: string; title: string; description: string | null; category: string; published: boolean };
  courseIds?: string[];
  courses: CourseOpt[];
  categories: string[];
}) {
  const [selected, setSelected] = useState<string[]>(courseIds);
  const [pick, setPick] = useState("");
  const byId = new Map(courses.map((c) => [c.id, c]));
  const available = courses.filter((c) => c.published && !selected.includes(c.id));

  const move = (i: number, dir: -1 | 1) =>
    setSelected((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const copy = [...s];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  return (
    <ActionForm action={saveLearningPath} successMessage={path ? "Learning path updated" : "Learning path created"} className="space-y-5" onSuccess={() => !path && setSelected([])}>
      {path && <input type="hidden" name="id" value={path.id} />}
      <input type="hidden" name="course_ids" value={JSON.stringify(selected)} />
      <FormGrid>
        <Field label="Title" required className="sm:col-span-2">
          <Input name="title" defaultValue={path?.title} required maxLength={200} placeholder="e.g. GenAI Engineer Foundations" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea name="description" defaultValue={path?.description ?? ""} rows={3} maxLength={4000} placeholder="Who is this path for and what will they be able to do?" />
        </Field>
        <Field label="Category" required>
          <Input name="category" list="path-categories" defaultValue={path?.category ?? "Technical"} required maxLength={60} />
          <datalist id="path-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <div className="flex items-end pb-2">
          <Checkbox name="published" label="Published (visible to employees)" defaultChecked={path?.published ?? true} />
        </div>
      </FormGrid>

      <div>
        <p className="mb-2 text-xs font-medium text-slate-600">
          Courses, in order <span className="text-red-500">*</span> <span className="font-normal text-slate-400">({selected.length})</span>
        </p>
        <div className="mb-3 flex gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Course to add" className="min-w-0 flex-1">
            <option value="">{available.length ? "Select a course to add" : "All published courses are in this path"}</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} · {c.category}
              </option>
            ))}
          </Select>
          <Button
            variant="secondary"
            disabled={!pick}
            onClick={() => {
              if (pick) setSelected((s) => [...s, pick]);
              setPick("");
            }}
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        {selected.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">No courses yet — add the first course learners should take.</p>
        ) : (
          <ol className="space-y-2">
            {selected.map((id, i) => {
              const c = byId.get(id);
              return (
                <li key={id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#d5e9f0] text-xs font-semibold text-[#25708a]">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-800">{c?.title ?? "Unknown course"}</p>
                    <p className="truncate text-[11px] text-slate-400">
                      {c?.category}
                      {c && !c.published && " · unpublished"}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === selected.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setSelected((s) => s.filter((x) => x !== id))} aria-label="Remove course">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <SubmitButton disabled={selected.length === 0}>{path ? "Save changes" : "Create path"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
