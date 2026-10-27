import { cn } from "@/lib/utils";

/** Learning-tinted progress bar (teal; green when complete). */
export function CourseProgress({ value, className, size = "md" }: { value: number; className?: string; size?: "sm" | "md" }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("w-full overflow-hidden rounded-full bg-slate-100", size === "sm" ? "h-1.5" : "h-2", className)}
    >
      <div className={cn("h-full rounded-full transition-all", v >= 100 ? "bg-emerald-500" : "bg-[#3a95b3]")} style={{ width: `${v}%` }} />
    </div>
  );
}
