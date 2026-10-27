"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, Checkbox, Field, FormGrid, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { saveCourse } from "../actions";
import type { Course, CourseModule } from "../_lib/course";

type Row = CourseModule & { key: number };

let nextKey = 1;
const toRows = (mods: CourseModule[]): Row[] => mods.map((m) => ({ ...m, key: nextKey++ }));

export function CourseForm({
  course,
  modules = [],
  categories,
}: {
  course?: Pick<Course, "id" | "title" | "description" | "category" | "provider" | "level" | "duration_hours" | "content_url" | "is_mandatory" | "published">;
  modules?: CourseModule[];
  categories: string[];
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(modules));

  const update = (key: number, patch: Partial<CourseModule>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (i: number, dir: -1 | 1) =>
    setRows((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const copy = [...rs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const totalMinutes = rows.reduce((s, r) => s + (Number(r.duration_minutes) || 0), 0);
  const serialized = JSON.stringify(rows.map(({ title, duration_minutes }) => ({ title: title.trim(), duration_minutes: Number(duration_minutes) || 0 })));

  return (
    <ActionForm action={saveCourse} successMessage={course ? "Course updated" : "Course created"} className="space-y-5">
      {course && <input type="hidden" name="id" value={course.id} />}
      <input type="hidden" name="modules" value={serialized} />

      <FormGrid>
        <Field label="Title" required className="sm:col-span-2">
          <Input name="title" defaultValue={course?.title} required maxLength={200} placeholder="e.g. Information Security Essentials" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea name="description" defaultValue={course?.description ?? ""} rows={3} placeholder="What will learners get out of this course?" />
        </Field>
        <Field label="Category" required hint="Pick an existing category or type a new one">
          <Input name="category" list="learning-categories" defaultValue={course?.category ?? "Technical"} required maxLength={60} />
          <datalist id="learning-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Provider">
          <Input name="provider" defaultValue={course?.provider ?? "Internal"} placeholder="Internal, Coursera, Udemy…" />
        </Field>
        <Field label="Level" required>
          <Select name="level" defaultValue={course?.level ?? "beginner"}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </Select>
        </Field>
        <Field label="Duration (hours)" hint={totalMinutes > 0 ? `Modules add up to ${(totalMinutes / 60).toFixed(1)}h — leave blank to use that` : undefined}>
          <Input name="duration_hours" type="number" min={0.1} step={0.1} defaultValue={course ? Number(course.duration_hours) : ""} />
        </Field>
        <Field label="Content URL" className="sm:col-span-2" hint="Link to the course material (LMS, video, document)">
          <Input name="content_url" type="url" defaultValue={course?.content_url ?? ""} placeholder="https://" />
        </Field>
      </FormGrid>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-slate-600">
            Modules <span className="font-normal text-slate-400">({rows.length})</span>
          </p>
          <Button size="sm" variant="secondary" onClick={() => setRows((rs) => [...rs, { title: "", duration_minutes: 30, key: nextKey++ }])}>
            <Plus className="h-3.5 w-3.5" /> Add module
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">
            No modules yet. Learners will only be able to mark the whole course complete.
          </p>
        ) : (
          <ol className="space-y-2">
            {rows.map((r, i) => (
              <li key={r.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2 sm:flex-nowrap">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#d5e9f0] text-xs font-semibold text-[#25708a]">{i + 1}</span>
                <Input
                  aria-label={`Module ${i + 1} title`}
                  value={r.title}
                  onChange={(e) => update(r.key, { title: e.target.value })}
                  placeholder="Module title"
                  className="min-w-0 flex-1 basis-40"
                  required
                />
                <div className="flex items-center gap-1">
                  <Input
                    aria-label={`Module ${i + 1} minutes`}
                    type="number"
                    min={0}
                    value={r.duration_minutes}
                    onChange={(e) => update(r.key, { duration_minutes: Number(e.target.value) })}
                    className="w-20"
                  />
                  <span className="text-xs text-slate-500">min</span>
                </div>
                <div className="ml-auto flex items-center">
                  <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    aria-label="Remove module"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Checkbox name="published" label="Published (visible in the catalog)" defaultChecked={course?.published ?? true} />
        <Checkbox name="is_mandatory" label="Mandatory for employees" defaultChecked={course?.is_mandatory ?? false} />
      </div>

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <SubmitButton>{course ? "Save changes" : "Create course"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
