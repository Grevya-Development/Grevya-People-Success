import { Star } from "lucide-react";
import { Avatar, ProgressBar } from "@/components/ui";
import { cn, humanize } from "@/lib/utils";
import { CATEGORY_TONE, PERF_THEME, progressColor, type Person } from "./shared";

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", CATEGORY_TONE[category] ?? "bg-slate-100 text-slate-600 ring-slate-200")}>
      {humanize(category)}
    </span>
  );
}

export function GoalProgress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ProgressBar value={value} className="h-1.5" barClassName={progressColor(value)} />
      <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">{value}%</span>
    </div>
  );
}

export function Stars({ value, size = "sm" }: { value: number | string | null | undefined; size?: "sm" | "md" }) {
  const v = value === null || value === undefined || value === "" ? 0 : Number(value);
  const cls = size === "md" ? "h-5 w-5" : "h-3.5 w-3.5";
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={v ? `${v} out of 5` : "Not rated"}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn(cls, n <= Math.round(v) ? "fill-amber-400 text-amber-400" : "fill-slate-100 text-slate-300")} />
      ))}
    </span>
  );
}

export function PersonCell({ person, sub }: { person: Person | null | undefined; sub?: React.ReactNode }) {
  if (!person) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={person.full_name} src={person.avatar_url} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{person.full_name}</p>
        <p className="truncate text-xs text-slate-500">
          {person.employee_code}
          {sub ? <> · {sub}</> : null}
        </p>
      </div>
    </div>
  );
}

/** Small pastel chip in the Performance accent. */
export function PerfChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", PERF_THEME.pill, PERF_THEME.text, className)}>{children}</span>;
}
