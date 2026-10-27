"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { STATUS_STYLE } from "../_lib/shift";

export type CalendarDay = {
  date: string;
  day: number;
  dow: number;
  status: string;
  title: string;
  checkIn: string;
  checkOut: string;
  hours: string;
  late: boolean;
  note: string | null;
  regularizeHref: string | null;
  isToday: boolean;
  future: boolean;
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarGrid({ days, initial }: { days: CalendarDay[]; initial: string }) {
  const [selected, setSelected] = useState(initial);
  const sel = days.find((d) => d.date === selected) ?? days[0];
  const lead = days[0]?.dow ?? 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:gap-2">
          {DOW.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-2">
          {Array.from({ length: lead }).map((_, i) => (
            <div key={`b${i}`} />
          ))}
          {days.map((d) => {
            const style = STATUS_STYLE[d.status];
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => setSelected(d.date)}
                className={cn(
                  "flex aspect-square flex-col items-start justify-between rounded-lg p-1 text-left ring-1 ring-inset transition sm:min-h-[4.5rem] sm:p-2",
                  style ? style.cell : "bg-white text-slate-700 ring-slate-200",
                  d.future && "opacity-60",
                  selected === d.date && "ring-2 ring-primary-500",
                  "hover:brightness-[0.97]",
                )}
                aria-pressed={selected === d.date}
                aria-label={`${d.date}: ${d.title}`}
              >
                <span className={cn("text-xs font-semibold sm:text-sm", d.isToday && "flex h-5 w-5 items-center justify-center rounded-full bg-[#e3a91a] text-white sm:h-6 sm:w-6")}>{d.day}</span>
                <span className="hidden w-full truncate text-[10px] font-medium sm:block">{style ? (d.status === "holiday" && d.note ? d.note : style.label) : ""}</span>
                {style && <span className={cn("h-1.5 w-1.5 rounded-full sm:hidden", style.dot)} />}
                {d.late && <span className="hidden text-[9px] font-semibold uppercase text-amber-700 sm:block">Late</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
          {Object.entries(STATUS_STYLE).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", v.dot)} />
              {v.label}
            </span>
          ))}
        </div>
      </div>

      {sel && (
        <div className="h-fit rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Day details</p>
          <p className="mt-1 text-base font-semibold text-slate-800">{sel.title}</p>
          <div className="mt-2">
            {STATUS_STYLE[sel.status] ? (
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_STYLE[sel.status].cell)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_STYLE[sel.status].dot)} />
                {STATUS_STYLE[sel.status].label}
              </span>
            ) : (
              <span className="text-xs text-slate-400">{sel.future ? "Upcoming day" : "No status"}</span>
            )}
            {sel.late && <span className="ml-2 text-xs font-medium text-amber-600">Late check-in</span>}
          </div>
          {sel.note && <p className="mt-2 text-sm text-slate-600">{sel.note}</p>}
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white p-2">
              <dt className="text-[10px] uppercase text-slate-400">In</dt>
              <dd className="text-xs font-semibold text-slate-800">{sel.checkIn}</dd>
            </div>
            <div className="rounded-lg bg-white p-2">
              <dt className="text-[10px] uppercase text-slate-400">Out</dt>
              <dd className="text-xs font-semibold text-slate-800">{sel.checkOut}</dd>
            </div>
            <div className="rounded-lg bg-white p-2">
              <dt className="text-[10px] uppercase text-slate-400">Hours</dt>
              <dd className="text-xs font-semibold text-slate-800">{sel.hours}</dd>
            </div>
          </dl>
          {sel.regularizeHref && (
            <Link href={sel.regularizeHref} className="mt-4 block rounded-lg bg-primary-600 px-3 py-2 text-center text-xs font-medium text-white hover:bg-primary-700">
              Regularize this day
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
