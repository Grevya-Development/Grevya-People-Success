import Link from "next/link";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MODULES } from "@/lib/nav";
import type { BalanceRow } from "../_lib/data";
import { fmtNum } from "../_lib/dates";

export const leaveTheme = MODULES.find((m) => m.key === "leave")!.theme;
export const attendanceTheme = MODULES.find((m) => m.key === "attendance")!.theme;

/** Avatar + name + employee code */
export function EmployeeCell({
  name,
  code,
  avatar,
  sub,
  size = "sm",
}: {
  name: string | null | undefined;
  code?: string | null;
  avatar?: string | null;
  sub?: string | null;
  size?: "xs" | "sm" | "md";
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={name} src={avatar} size={size} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{name ?? "—"}</p>
        <p className="truncate text-xs text-slate-500">
          {code}
          {sub ? <span className="text-slate-400">{code ? " · " : ""}{sub}</span> : null}
        </p>
      </div>
    </div>
  );
}

/** Coloured leave type dot + name */
export function LeaveTypeLabel({ name, color, code }: { name: string; color: string; code?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-sm text-slate-700">{name}</span>
      {code && <span className="text-[11px] text-slate-400">({code})</span>}
    </span>
  );
}

/** Balance card, tinted with the leave type's colour. */
export function BalanceCard({ b, compact = false }: { b: BalanceRow; compact?: boolean }) {
  const color = b.type.color;
  const unlimited = !b.type.is_paid;
  const pct = b.allocated > 0 ? Math.min(100, ((b.used + b.pending) / b.allocated) * 100) : 0;
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-3.5" style={{ backgroundColor: `${color}0f` }}>
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color }} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-700">{b.type.name}</p>
          <p className="text-[11px] text-slate-400">{b.type.code}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold leading-none" style={{ color }}>
            {unlimited ? "∞" : fmtNum(b.available)}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">available</p>
        </div>
      </div>
      {!compact && !unlimited && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/80 ring-1 ring-inset ring-slate-200/60">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
      )}
      <div className={cn("mt-2 grid grid-cols-3 gap-1 text-center text-[11px]", compact && "mt-2")}>
        <div>
          <p className="font-semibold text-slate-700">{unlimited ? "—" : fmtNum(b.allocated)}</p>
          <p className="text-slate-400">Allocated</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700">{fmtNum(b.used)}</p>
          <p className="text-slate-400">Used</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700">{fmtNum(b.pending)}</p>
          <p className="text-slate-400">Pending</p>
        </div>
      </div>
    </div>
  );
}

/** Pastel module pill link (like the sidebar flyout pills). */
export function PillLink({ href, label, theme, icon }: { href: string; label: string; theme: { pill: string; pillHover: string; text: string }; icon?: React.ReactNode }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors", theme.pill, theme.pillHover, theme.text)}>
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}

/** Segmented filter link group */
export function SegmentLinks({ items, active }: { items: { label: string; href: string; value: string }[]; active: string }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {items.map((i) => (
        <Link
          key={i.value}
          href={i.href}
          className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition", i.value === active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}
