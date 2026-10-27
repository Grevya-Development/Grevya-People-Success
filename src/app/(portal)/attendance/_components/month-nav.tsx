import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthLabel, shiftMonth } from "../../leave/_lib/dates";

/** ‹ October 2026 › — links keep other query params (e.g. emp). */
export function MonthNav({ ym, basePath, params = {}, maxYm }: { ym: string; basePath: string; params?: Record<string, string>; maxYm?: string }) {
  const href = (m: string) => `${basePath}?${new URLSearchParams({ ...params, month: m }).toString()}`;
  const next = shiftMonth(ym, 1);
  const canNext = !maxYm || next <= maxYm;
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white shadow-sm">
      <Link href={href(shiftMonth(ym, -1))} className="p-2 text-slate-500 hover:text-slate-800" aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <span className="min-w-[8.5rem] px-1 text-center text-sm font-semibold text-slate-800">{monthLabel(ym)}</span>
      {canNext ? (
        <Link href={href(next)} className="p-2 text-slate-500 hover:text-slate-800" aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span className="p-2 text-slate-200">
          <ChevronRight className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}
