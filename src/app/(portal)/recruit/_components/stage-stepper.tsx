import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PIPELINE, STAGE_LABEL, type Stage } from "./constants";

/** applied → screening → interview → offer → hired, with a red end-state for rejected. */
export function StageStepper({ stage, className }: { stage: Stage; className?: string }) {
  const rejected = stage === "rejected";
  const current = rejected ? -1 : PIPELINE.indexOf(stage);

  return (
    <ol className={cn("flex w-full items-start", className)} aria-label={`Stage: ${STAGE_LABEL[stage]}`}>
      {PIPELINE.map((s, i) => {
        const done = !rejected && i < current;
        const active = !rejected && i === current;
        const isLast = i === PIPELINE.length - 1;
        return (
          <li key={s} className="relative flex min-w-0 flex-1 flex-col items-center">
            {!isLast && (
              <span
                className={cn("absolute left-1/2 top-3 h-0.5 w-full", done ? "bg-[#8a6cc6]" : "bg-slate-200")}
                aria-hidden
              />
            )}
            <span
              className={cn(
                "relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ring-4 ring-white",
                done && "bg-[#8a6cc6] text-white",
                active && (s === "hired" ? "bg-emerald-600 text-white" : "bg-[#6a4fa3] text-white"),
                !done && !active && "bg-slate-200 text-slate-500",
              )}
            >
              {done || (active && s === "hired") ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                "mt-1.5 truncate px-0.5 text-[10px] sm:text-[11px]",
                active ? "font-semibold text-[#6a4fa3]" : done ? "text-slate-600" : "text-slate-400",
              )}
            >
              {STAGE_LABEL[s]}
            </span>
          </li>
        );
      })}
      {rejected && (
        <li className="flex shrink-0 flex-col items-center pl-2">
          <span className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white ring-4 ring-white">
            <X className="h-3.5 w-3.5" />
          </span>
          <span className="mt-1.5 text-[10px] font-semibold text-red-600 sm:text-[11px]">Rejected</span>
        </li>
      )}
    </ol>
  );
}
