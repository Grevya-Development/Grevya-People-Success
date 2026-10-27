"use client";

import { useState } from "react";
import { differenceInCalendarDays, parseISO, isValid } from "date-fns";
import { AlertTriangle, Info } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, FormGrid, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { formatDate } from "@/lib/utils";
import { submitResignation } from "../actions";
import { NOTICE_PERIOD_DAYS, REASON_CATEGORIES } from "./shared";

export function ResignForm({ today, defaultLastDay }: { today: string; defaultLastDay: string }) {
  const [lastDay, setLastDay] = useState(defaultLastDay);
  const [reason, setReason] = useState("");

  const d = parseISO(lastDay);
  const days = isValid(d) ? differenceInCalendarDays(d, parseISO(today)) : null;
  const shortNotice = days !== null && days > 0 && days < NOTICE_PERIOD_DAYS;
  const invalid = days !== null && days <= 0;

  return (
    <ActionForm
      action={submitResignation}
      className="space-y-5"
      onSuccess={() => {
        setLastDay(defaultLastDay);
        setReason("");
      }}
    >
      <FormGrid>
        <Field label="Reason category" htmlFor="reason_category" required>
          <Select id="reason_category" name="reason_category" required defaultValue="">
            <option value="" disabled>
              Select a reason
            </option>
            {REASON_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Requested last working day"
          htmlFor="requested_last_day"
          required
          hint={days !== null && days > 0 ? `${days} days from today · notice period is ${NOTICE_PERIOD_DAYS} days` : undefined}
        >
          <Input
            id="requested_last_day"
            name="requested_last_day"
            type="date"
            min={today}
            required
            value={lastDay}
            onChange={(e) => setLastDay(e.target.value)}
          />
        </Field>
      </FormGrid>

      {shortNotice && (
        <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This is <strong>{NOTICE_PERIOD_DAYS - days} days shorter</strong> than your {NOTICE_PERIOD_DAYS}-day notice period (standard last day{" "}
            {formatDate(defaultLastDay)}). An early release is subject to manager and HR approval and may require notice-period recovery.
          </p>
        </div>
      )}
      {invalid && (
        <div className="flex gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Your last working day must be after today.</p>
        </div>
      )}

      <Field label="Detailed reason" htmlFor="reason" required hint={`${reason.trim().length} / 20 characters minimum`}>
        <Textarea
          id="reason"
          name="reason"
          rows={5}
          required
          minLength={20}
          maxLength={4000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Share the context behind your decision. This is visible to your manager and HR."
        />
      </Field>

      <div className="flex gap-2.5 rounded-lg bg-slate-50 px-3.5 py-3 text-xs text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p>
          Your resignation goes to your reporting manager first, then to HR. Once HR approves, the exit clearance checklist (Reporting Manager, IT,
          Finance, Admin, HR) starts. You can withdraw any time before HR approval.
        </p>
      </div>

      <Checkbox
        name="acknowledge"
        required
        label={
          <span>
            I confirm that I wish to resign and understand that I must serve the notice period and complete the exit clearance as per company policy.
          </span>
        }
      />

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <SubmitButton variant="danger" disabled={invalid}>
          Submit resignation
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
