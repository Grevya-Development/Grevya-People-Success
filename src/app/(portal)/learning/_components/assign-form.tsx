"use client";

import { useMemo, useState } from "react";
import { Avatar, Field, Input, Select } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { cn } from "@/lib/utils";
import { assignToReports } from "../actions";

type Person = { id: string; full_name: string; avatar_url: string | null; subtitle: string | null; direct: boolean };

/** Manager: assign one course to one or more reports. */
export function AssignForm({
  courses,
  people,
  today,
  defaultEmployeeId,
}: {
  courses: { id: string; title: string; category: string }[];
  people: Person[];
  today: string;
  defaultEmployeeId?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultEmployeeId ? [defaultEmployeeId] : []));
  const [filter, setFilter] = useState("");
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? people.filter((p) => p.full_name.toLowerCase().includes(q)) : people;
  }, [people, filter]);
  const allShown = shown.length > 0 && shown.every((p) => selected.has(p.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (courses.length === 0) return <p className="text-sm text-slate-500">There are no published courses to assign yet.</p>;

  return (
    <ActionForm action={assignToReports} className="space-y-4" onSuccess={() => setSelected(new Set())}>
      <Field label="Course" required>
        <Select name="course_id" required defaultValue="">
          <option value="" disabled>
            Select a course
          </option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} · {c.category}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Due date" hint="Optional — learners see it on their learning plan">
        <Input type="date" name="due_date" min={today} />
      </Field>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-slate-600">
            Team members <span className="text-red-500">*</span>
            <span className="ml-1 font-normal text-slate-400">({selected.size} selected)</span>
          </p>
          <button
            type="button"
            className="text-xs font-medium text-primary-600 hover:underline"
            onClick={() =>
              setSelected((s) => {
                const n = new Set(s);
                shown.forEach((p) => (allShown ? n.delete(p.id) : n.add(p.id)));
                return n;
              })
            }
          >
            {allShown ? "Clear" : "Select all"}
          </button>
        </div>
        {people.length > 6 && <Input placeholder="Filter by name" value={filter} onChange={(e) => setFilter(e.target.value)} className="mb-2" />}
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1 thin-scroll">
          {shown.map((p) => (
            <label
              key={p.id}
              className={cn("flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50", selected.has(p.id) && "bg-[#d5e9f0]/50")}
            >
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
              <Avatar name={p.full_name} src={p.avatar_url} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-700">{p.full_name}</span>
                {p.subtitle && <span className="block truncate text-[11px] text-slate-400">{p.subtitle}</span>}
              </span>
              {!p.direct && <span className="text-[10px] text-slate-400">Indirect</span>}
            </label>
          ))}
          {shown.length === 0 && <p className="px-2 py-4 text-center text-xs text-slate-500">No one matches.</p>}
        </div>
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="employee_ids" value={id} />
        ))}
      </div>

      <div className="flex justify-end">
        <SubmitButton disabled={selected.size === 0}>Assign course</SubmitButton>
      </div>
    </ActionForm>
  );
}
