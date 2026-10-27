import { CheckCircle2, Clock } from "lucide-react";
import { StatusBadge } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { formatDateTime } from "@/lib/utils";
import { markClearanceCleared, reopenClearance } from "../actions";
import { sortClearances, type ClearanceRow } from "./shared";

/**
 * Exit clearance checklist. Pass `canClear` to show sign-off buttons
 * (approvers), `canReopen` for HR.
 */
export function ClearanceList({
  items,
  canClear,
  canReopen = false,
}: {
  items: ClearanceRow[];
  canClear?: (department: string) => boolean;
  canReopen?: boolean;
}) {
  if (items.length === 0) {
    return <p className="py-4 text-center text-xs text-slate-500">The clearance checklist will appear once HR approves the resignation.</p>;
  }
  return (
    <ul className="divide-y divide-slate-100">
      {sortClearances(items).map((c) => {
        const cleared = c.status === "cleared";
        return (
          <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              {cleared ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
              ) : (
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{c.department}</p>
                {cleared ? (
                  <p className="text-xs text-slate-500">
                    Cleared by {c.cleared_by_emp?.full_name ?? "—"} · {formatDateTime(c.cleared_at)}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">Awaiting sign-off</p>
                )}
                {c.remarks && <p className="mt-1 text-xs italic text-slate-600">“{c.remarks}”</p>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 pl-8 sm:pl-0">
              <StatusBadge status={c.status} />
              {!cleared && canClear?.(c.department) && (
                <ActionButton action={markClearanceCleared} fields={{ id: c.id }} prompt="Clearance remarks (optional)" variant="success">
                  Mark cleared
                </ActionButton>
              )}
              {cleared && canReopen && (
                <ActionButton action={reopenClearance} fields={{ id: c.id }} prompt="Why is this being reopened?" promptRequired variant="ghost">
                  Reopen
                </ActionButton>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
