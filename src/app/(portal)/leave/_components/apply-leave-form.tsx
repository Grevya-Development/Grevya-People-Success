"use client";

import { useMemo, useState } from "react";
import { CalendarCheck2, Info } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { applyLeave } from "../actions";
import { computeLeaveDays, fmtDays, fmtNum, isISODate, shortDay, type HolidayLite } from "../_lib/dates";

export type ApplyType = {
  id: string;
  name: string;
  code: string;
  color: string;
  is_paid: boolean;
  allow_half_day: boolean;
  /** available days keyed by year */
  available: Record<string, number>;
};

export function ApplyLeaveForm({ types, holidays, today, minDate }: { types: ApplyType[]; holidays: HolidayLite[]; today: string; minDate: string }) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [halfDay, setHalfDay] = useState(false);
  const [session, setSession] = useState("first");

  const type = types.find((t) => t.id === typeId);
  const single = start === end;
  const canHalf = !!type?.allow_half_day && single;
  const effectiveHalf = halfDay && canHalf;
  const valid = isISODate(start) && isISODate(end) && end >= start;

  const calc = useMemo(() => (valid ? computeLeaveDays(start, end, holidays, effectiveHalf) : null), [valid, start, end, holidays, effectiveHalf]);
  const year = start.slice(0, 4);
  const available = type ? (type.available[year] ?? 0) : 0;
  const insufficient = !!type?.is_paid && !!calc && calc.days > available;

  const reset = () => {
    setStart(today);
    setEnd(today);
    setHalfDay(false);
  };

  return (
    <ActionForm action={applyLeave} successMessage="Leave applied" onSuccess={reset} resetOnSuccess={false}>
      <div className="space-y-5">
        <Field label="Leave type" htmlFor="leave_type_id" required>
          <Select id="leave_type_id" name="leave_type_id" value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.is_paid ? `${fmtNum(t.available[year] ?? 0)} available` : "no limit"}
              </option>
            ))}
          </Select>
        </Field>

        {type && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: `${type.color}55`, backgroundColor: `${type.color}10` }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: type.color }} />
            <span className="font-medium text-slate-700">{type.name}</span>
            <span className="text-slate-500">
              {type.is_paid ? (
                <>
                  Available in {year}: <b className="text-slate-800">{fmtNum(available)}</b> day(s)
                </>
              ) : (
                "Unpaid leave — not limited by balance"
              )}
            </span>
            {!type.allow_half_day && <span className="text-slate-400">· Full days only</span>}
          </div>
        )}

        <FormGrid>
          <Field label="From" htmlFor="start_date" required>
            <Input
              id="start_date"
              name="start_date"
              type="date"
              min={minDate}
              value={start}
              onChange={(e) => {
                const v = e.target.value;
                setStart(v);
                if (!end || end < v) setEnd(v);
              }}
              required
            />
          </Field>
          <Field label="To" htmlFor="end_date" required>
            <Input id="end_date" name="end_date" type="date" min={start || minDate} value={end} onChange={(e) => setEnd(e.target.value)} required />
          </Field>
        </FormGrid>

        {canHalf && (
          <div className="rounded-lg border border-slate-200 p-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="half_day"
                checked={halfDay}
                onChange={(e) => setHalfDay(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              Half day
            </label>
            {halfDay && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { v: "first", l: "First half", s: "Morning session" },
                  { v: "second", l: "Second half", s: "Afternoon session" },
                ].map((o) => (
                  <label
                    key={o.v}
                    className={cn(
                      "cursor-pointer rounded-lg border px-3 py-2 text-sm transition",
                      session === o.v ? "border-[#ec7a35] bg-[#fbe2d2]/60 text-[#c2581c]" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    <input type="radio" name="half_day_session" value={o.v} checked={session === o.v} onChange={() => setSession(o.v)} className="sr-only" />
                    <span className="block font-medium">{o.l}</span>
                    <span className="block text-xs opacity-75">{o.s}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Live breakdown */}
        <div className={cn("rounded-xl border p-4", insufficient ? "border-red-200 bg-red-50/60" : "border-[#f8d1b8] bg-[#fbe2d2]/40")}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <CalendarCheck2 className="h-4 w-4 text-[#c2581c]" />
              Leave duration
            </div>
            <span className={cn("text-lg font-semibold", insufficient ? "text-red-600" : "text-[#c2581c]")}>{calc ? fmtDays(calc.days) : "—"}</span>
          </div>
          {calc ? (
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-white/80 py-2">
                <p className="text-base font-semibold text-slate-800">{calc.calendarDays}</p>
                <p className="text-slate-500">Calendar days</p>
              </div>
              <div className="rounded-lg bg-white/80 py-2">
                <p className="text-base font-semibold text-slate-800">{calc.weekends.length}</p>
                <p className="text-slate-500">Weekend days</p>
              </div>
              <div className="rounded-lg bg-white/80 py-2">
                <p className="text-base font-semibold text-slate-800">{calc.holidays.length}</p>
                <p className="text-slate-500">Holidays</p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-red-600">End date must be on or after the start date.</p>
          )}
          {calc && calc.holidays.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-slate-600">
              {calc.holidays.map((h) => (
                <li key={h.date} className="flex justify-between gap-2">
                  <span>{h.name}</span>
                  <span className="text-slate-400">{shortDay(h.date)}</span>
                </li>
              ))}
            </ul>
          )}
          {calc && calc.days === 0 && <p className="mt-3 text-xs text-red-600">The selected dates are all weekends or holidays.</p>}
          {insufficient && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600">
              <Info className="h-3.5 w-3.5" /> Not enough balance — {fmtNum(available)} day(s) available.
            </p>
          )}
          {calc && effectiveHalf && <p className="mt-3 text-xs text-slate-500">Half day ({session === "first" ? "first" : "second"} half) counts as 0.5 day.</p>}
        </div>

        <Field label="Reason" htmlFor="reason" required>
          <Textarea id="reason" name="reason" rows={3} maxLength={1000} placeholder="Briefly describe the reason for your leave" required />
        </Field>

        <div className="flex justify-end">
          <SubmitButton disabled={!calc || calc.days === 0 || insufficient || !type}>Apply Leave</SubmitButton>
        </div>
      </div>
    </ActionForm>
  );
}
