import { Check, X, Undo2, Circle } from "lucide-react";
import type { Tables } from "@/lib/database.types";
import { cn, formatDate } from "@/lib/utils";

type StepState = "done" | "current" | "failed" | "withdrawn" | "upcoming";
type Step = { label: string; state: StepState; date?: string | null; note?: string | null; detail?: string | null };

/** Submitted → Manager approval → HR approval → Clearance → Completed */
export function buildSteps(r: Tables<"resignations">, cleared: number, totalClearances: number): Step[] {
  const s = r.status;
  // index of the step where the workflow currently sits (or ended)
  let at: number;
  let endState: StepState = "current";
  if (s === "pending_manager") at = 1;
  else if (s === "pending_hr") at = 2;
  else if (s === "approved") at = 3;
  else if (s === "completed") at = 5;
  else if (s === "rejected") {
    at = r.hr_action_at ? 2 : 1;
    endState = "failed";
  } else {
    // withdrawn
    at = r.hr_action_at ? 3 : r.manager_action_at ? 2 : 1;
    endState = "withdrawn";
  }
  const state = (i: number): StepState => (i < at ? "done" : i === at ? endState : "upcoming");

  return [
    { label: "Submitted", state: "done", date: r.created_at, detail: `${r.reason_category} · requested last day ${formatDate(r.requested_last_day)}` },
    {
      label: "Manager approval",
      state: state(1),
      date: r.manager_action_at,
      note: r.manager_remarks,
      detail: s === "rejected" && at === 1 ? "Rejected by manager" : at === 1 && endState === "withdrawn" ? "Withdrawn by you" : null,
    },
    {
      label: "HR approval",
      state: state(2),
      date: r.hr_action_at,
      note: r.hr_remarks,
      detail: r.approved_last_day
        ? `Last working day ${formatDate(r.approved_last_day)}`
        : s === "rejected" && at === 2
          ? "Rejected by HR"
          : at === 2 && endState === "withdrawn"
            ? "Withdrawn by you"
            : null,
    },
    {
      label: "Clearance",
      state: state(3),
      detail: totalClearances > 0 ? `${cleared} of ${totalClearances} departments cleared` : null,
    },
    {
      label: "Completed",
      state: s === "completed" ? "done" : "upcoming",
      date: s === "completed" ? r.approved_last_day : null,
      detail: s === "completed" ? "Exit completed" : null,
    },
  ];
}

const dot: Record<StepState, string> = {
  done: "bg-emerald-500 text-white ring-emerald-100",
  current: "bg-[#d9675a] text-white ring-[#f7dcd8]",
  failed: "bg-red-600 text-white ring-red-100",
  withdrawn: "bg-slate-500 text-white ring-slate-200",
  upcoming: "bg-white text-slate-300 ring-slate-200 border border-slate-200",
};

const caption: Record<StepState, string> = {
  done: "Done",
  current: "In progress",
  failed: "Rejected",
  withdrawn: "Withdrawn",
  upcoming: "Upcoming",
};

function StepIcon({ state, n }: { state: StepState; n: number }) {
  const cls = "h-4 w-4";
  if (state === "done") return <Check className={cls} />;
  if (state === "failed") return <X className={cls} />;
  if (state === "withdrawn") return <Undo2 className={cls} />;
  if (state === "current") return <Circle className="h-2.5 w-2.5 fill-current" />;
  return <span className="text-xs font-semibold">{n}</span>;
}

export function ExitStepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid grid-cols-1 gap-0 md:grid-cols-5 md:gap-3">
      {steps.map((st, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={st.label} className="relative flex gap-3 pb-6 md:block md:pb-0">
            {/* connector */}
            {!last && (
              <span
                className={cn(
                  "absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 md:left-10 md:top-[15px] md:h-0.5 md:w-[calc(100%-1.75rem)]",
                  st.state === "done" ? "bg-emerald-300" : "bg-slate-200",
                )}
              />
            )}
            <span className={cn("relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4", dot[st.state])}>
              <StepIcon state={st.state} n={i + 1} />
            </span>
            <div className="min-w-0 md:mt-3">
              <p className={cn("text-sm font-semibold", st.state === "upcoming" ? "text-slate-400" : "text-slate-800")}>{st.label}</p>
              <p
                className={cn(
                  "text-[11px] font-medium uppercase tracking-wide",
                  st.state === "failed" ? "text-red-600" : st.state === "current" ? "text-[#b2463a]" : "text-slate-400",
                )}
              >
                {caption[st.state]}
                {st.date ? ` · ${formatDate(st.date)}` : ""}
              </p>
              {st.detail && <p className="mt-1 text-xs text-slate-600">{st.detail}</p>}
              {st.note && <p className="mt-1.5 rounded-md bg-slate-50 px-2 py-1.5 text-xs italic text-slate-600">“{st.note}”</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
