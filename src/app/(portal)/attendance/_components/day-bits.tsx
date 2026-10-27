import { Badge, StatusBadge } from "@/components/ui";
import type { DayInfo } from "../_lib/shift";

/** Status chip for a derived day status (blank for future / not applicable). */
export function DayStatusBadge({ day }: { day: DayInfo }) {
  if (!day.status) return <span className="text-xs text-slate-300">—</span>;
  if (day.status === "weekend") return <Badge tone="gray">Weekend</Badge>;
  if (day.status === "leave")
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <StatusBadge status="leave" label={day.leave?.half_day ? "Half-day leave" : "Leave"} />
        {day.leave?.type_name && <span className="text-[11px] text-slate-400">{day.leave.type_name}</span>}
      </span>
    );
  if (day.status === "holiday")
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <StatusBadge status="holiday" />
        {day.holiday?.name && <span className="text-[11px] text-slate-400">{day.holiday.name}</span>}
      </span>
    );
  return <StatusBadge status={day.status} label={day.status === "wfh" ? "WFH" : undefined} />;
}
