"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Textarea } from "@/components/ui/form";
import { ProgressBar } from "@/components/ui/progress";
import { updateProgress } from "../actions";
import { progressColor } from "./shared";

/** Slider + comment that records a goal_updates row and the new progress. */
export function ProgressForm({ goalId, current }: { goalId: string; current: number }) {
  const [value, setValue] = useState(current);
  return (
    <ActionForm action={updateProgress} className="space-y-4">
      <input type="hidden" name="id" value={goalId} />
      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <label htmlFor={`progress-${goalId}`} className="text-xs font-medium text-slate-600">
            Progress
          </label>
          <span className="font-semibold text-slate-800">{value}%</span>
        </div>
        <input
          id={`progress-${goalId}`}
          name="progress"
          type="range"
          min={0}
          max={100}
          step={5}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="w-full accent-[#4a8ad0]"
        />
        <ProgressBar value={value} className="mt-2" barClassName={progressColor(value)} />
        {value < current && <p className="mt-1 text-xs text-amber-700">This lowers progress from {current}%.</p>}
      </div>
      <Field label="Comment" required>
        <Textarea name="comment" rows={3} required minLength={3} maxLength={2000} placeholder="What did you achieve since the last update?" />
      </Field>
      <div className="flex justify-end">
        <SubmitButton>Save update</SubmitButton>
      </div>
    </ActionForm>
  );
}
