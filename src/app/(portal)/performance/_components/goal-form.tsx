"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { assignGoal, createGoal, updateGoal } from "../actions";
import { IntentSubmit } from "./intent-submit";
import { GOAL_CATEGORIES, PHASE_LABEL } from "./shared";

export type GoalFormCycle = { id: string; name: string; status: string; start_date: string; end_date: string };
export type GoalFormParent = { id: string; title: string; employee_id: string | null; cycle_id: string | null; owner: string | null };
export type GoalWeightRow = { id: string; employee_id: string | null; cycle_id: string | null; weightage: number };
export type GoalFormMember = { id: string; full_name: string | null; employee_code: string; manager_id: string | null };

export type GoalFormDefaults = {
  id?: string;
  title?: string;
  description?: string | null;
  category?: string;
  weightage?: number;
  target?: string | null;
  due_date?: string | null;
  cycle_id?: string | null;
  parent_goal_id?: string | null;
  status?: string;
};

export function GoalForm({
  mode,
  ownerId,
  ownerManagerId,
  cycles,
  parents,
  weights,
  members = [],
  defaults = {},
}: {
  mode: "create" | "update" | "assign";
  /** owner for create / update */
  ownerId?: string;
  ownerManagerId?: string | null;
  cycles: GoalFormCycle[];
  parents: GoalFormParent[];
  weights: GoalWeightRow[];
  members?: GoalFormMember[];
  defaults?: GoalFormDefaults;
}) {
  const [cycleId, setCycleId] = useState(defaults.cycle_id ?? cycles[0]?.id ?? "");
  const [memberId, setMemberId] = useState(mode === "assign" ? "" : (ownerId ?? ""));
  const [weightage, setWeightage] = useState<string>(defaults.weightage ? String(defaults.weightage) : "");

  const member = members.find((m) => m.id === memberId);
  const parentOwnerId = mode === "assign" ? (member?.manager_id ?? null) : (ownerManagerId ?? null);

  const parentOptions = useMemo(
    () =>
      parents.filter(
        (p) =>
          p.id !== defaults.id &&
          (p.employee_id === null || (parentOwnerId !== null && p.employee_id === parentOwnerId)) &&
          (p.cycle_id === null || p.cycle_id === cycleId),
      ),
    [parents, parentOwnerId, cycleId, defaults.id],
  );

  const used = weights
    .filter((w) => w.employee_id === memberId && w.cycle_id === cycleId && w.id !== defaults.id)
    .reduce((s, w) => s + Number(w.weightage || 0), 0);
  const entered = Number(weightage) || 0;
  const remaining = Math.max(0, 100 - used);
  const over = used + entered > 100.001;
  const cycle = cycles.find((c) => c.id === cycleId);

  const action = mode === "create" ? createGoal : mode === "update" ? updateGoal : assignGoal;

  return (
    <ActionForm action={action} resetOnSuccess={mode !== "update"} className="space-y-4">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

      {mode === "assign" && (
        <Field label="Team member" required>
          <Select name="employee_id" required value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">Select a team member…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name} ({m.employee_code})
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Goal title" required>
        <Input name="title" required minLength={3} maxLength={200} defaultValue={defaults.title} placeholder="e.g. Reduce customer onboarding time by 20%" />
      </Field>
      <Field label="Description">
        <Textarea name="description" rows={3} maxLength={4000} defaultValue={defaults.description ?? ""} placeholder="Why this goal matters and how you will approach it" />
      </Field>

      <FormGrid>
        <Field label="Category" required>
          <Select name="category" required defaultValue={defaults.category ?? "business"}>
            {GOAL_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Weightage (%)"
          required
          hint={
            memberId ? (
              <span className={cn(over && "font-medium text-red-600")}>
                {over ? `Exceeds 100% — only ${+remaining.toFixed(2)}% left in this cycle` : `${+used.toFixed(2)}% already allocated · ${+remaining.toFixed(2)}% left`}
              </span>
            ) : undefined
          }
        >
          <Input
            name="weightage"
            type="number"
            required
            min={1}
            max={100}
            step="0.01"
            value={weightage}
            onChange={(e) => setWeightage(e.target.value)}
            placeholder={remaining ? String(+remaining.toFixed(2)) : "0"}
          />
        </Field>
        <Field label="Review cycle" required>
          <Select name="cycle_id" required value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
            {cycles.length === 0 && <option value="">No open cycles</option>}
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {PHASE_LABEL[c.status] ?? c.status}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date" hint={cycle ? `Cycle runs ${cycle.start_date} → ${cycle.end_date}` : undefined}>
          <Input name="due_date" type="date" min={cycle?.start_date} defaultValue={defaults.due_date ?? cycle?.end_date ?? ""} />
        </Field>
      </FormGrid>

      <Field label="Target / KPI">
        <Input name="target" maxLength={1000} defaultValue={defaults.target ?? ""} placeholder="e.g. Onboarding time ≤ 4 days by Q4" />
      </Field>

      <Field label="Align to" hint="Link this goal to an organisation objective or one of the manager's goals.">
        <Select name="parent_goal_id" defaultValue={defaults.parent_goal_id ?? ""} key={`${parentOwnerId}-${cycleId}`}>
          <option value="">Not aligned</option>
          {parentOptions.some((p) => p.employee_id === null) && (
            <optgroup label="Organisation objectives">
              {parentOptions
                .filter((p) => p.employee_id === null)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </optgroup>
          )}
          {parentOptions.some((p) => p.employee_id !== null) && (
            <optgroup label="Manager's goals">
              {parentOptions
                .filter((p) => p.employee_id !== null)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                    {p.owner ? ` — ${p.owner}` : ""}
                  </option>
                ))}
            </optgroup>
          )}
        </Select>
      </Field>

      {defaults.status === "rejected" && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This goal was rejected. Revise it and submit again for approval.
        </p>
      )}

      <div className="border-t border-slate-100 pt-4">
        {mode === "assign" ? (
          <div className="flex justify-end">
            <SubmitButton disabled={over || cycles.length === 0}>Assign goal</SubmitButton>
          </div>
        ) : (
          <IntentSubmit
            options={[
              { value: "draft", label: "Save as draft", variant: "outline", disabled: over || cycles.length === 0 },
              { value: "submit", label: "Submit for approval", disabled: over || cycles.length === 0 },
            ]}
          />
        )}
      </div>
    </ActionForm>
  );
}
