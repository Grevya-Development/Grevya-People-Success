"use client";

import { useState } from "react";
import { cn, formatDate } from "@/lib/utils";

export type DayRow = {
  date: string;
  status: "present" | "wfh" | "on_duty" | "half_day" | "absent" | "leave" | "holiday" | "weekend" | "today";
  checkIn: string | null;
  checkOut: string | null;
  hours: number | null;
};

const STATUS: Record<DayRow["status"], { label: string; dot: string; text: string }> = {
  present: { label: "Present", dot: "bg-emerald-500", text: "text-emerald-700" },
  wfh: { label: "WFH", dot: "bg-violet-500", text: "text-violet-700" },
  on_duty: { label: "On duty", dot: "bg-teal-500", text: "text-teal-700" },
  half_day: { label: "Half day", dot: "bg-amber-500", text: "text-amber-700" },
  absent: { label: "Absent", dot: "bg-red-500", text: "text-red-600" },
  leave: { label: "Leave", dot: "bg-orange-500", text: "text-orange-700" },
  holiday: { label: "Holiday", dot: "bg-sky-500", text: "text-sky-700" },
  weekend: { label: "Weekend", dot: "bg-slate-300", text: "text-slate-400" },
  today: { label: "Today", dot: "bg-primary-500", text: "text-primary-700" },
};

export function AttendanceWidget({ days }: { days: DayRow[] }) {
  const [range, setRange] = useState<"7" | "month">("7");
  const rows = range === "7" ? days.slice(0, 7) : days.filter((d) => d.date.slice(0, 7) === days[0]?.date.slice(0, 7));
  const worked = rows.filter((r) => r.hours && r.hours > 0);
  const avg = worked.length ? worked.reduce((s, r) => s + (r.hours ?? 0), 0) / worked.length : 0;
  const present = rows.filter((r) => ["present", "wfh", "on_duty", "half_day"].includes(r.status)).length;
  const maxH = 10;

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {(["7", "month"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={cn("rounded-lg px-4 py-1.5 text-xs font-semibold transition", range === r ? "bg-navy-900 text-white" : "text-slate-600 hover:bg-slate-100")}
          >
            {r === "7" ? "Last 7 Days" : "This Month"}
          </button>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 py-2">
          <p className="text-lg font-semibold text-slate-800">{present}</p>
          <p className="text-[11px] text-slate-500">Days present</p>
        </div>
        <div className="rounded-lg bg-slate-50 py-2">
          <p className="text-lg font-semibold text-slate-800">{avg ? `${Math.floor(avg)}h ${Math.round((avg % 1) * 60)}m` : "—"}</p>
          <p className="text-[11px] text-slate-500">Avg. hours</p>
        </div>
      </div>
      <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1 thin-scroll">
        {rows.map((r) => {
          const s = STATUS[r.status];
          return (
            <li key={r.date} className="flex items-center gap-3 text-xs">
              <span className="w-16 shrink-0 text-slate-500">{formatDate(r.date, "EEE, dd")}</span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                {r.hours ? <div className={cn("h-full rounded-full", s.dot)} style={{ width: `${Math.min(100, (r.hours / maxH) * 100)}%` }} /> : null}
              </div>
              <span className={cn("w-[128px] shrink-0 whitespace-nowrap text-right", s.text)}>
                {r.hours ? `${formatDate(r.checkIn, "HH:mm")} – ${r.checkOut ? formatDate(r.checkOut, "HH:mm") : "now"}` : s.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
