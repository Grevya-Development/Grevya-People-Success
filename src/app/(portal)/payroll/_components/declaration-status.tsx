import type { ReactNode } from "react";
import { CheckCircle2, Clock, FilePen, MessageSquare, XCircle } from "lucide-react";
import { StatusBadge } from "@/components/ui";
import { cn, formatDateTime } from "@/lib/utils";

const COPY: Record<string, { title: string; body: string; icon: typeof Clock; tone: string }> = {
  none: { title: "Not declared yet", body: "Fill in the form below, save a draft and submit it to HR when ready.", icon: FilePen, tone: "bg-slate-50 ring-slate-200 text-slate-700" },
  draft: { title: "Draft", body: "Your declaration is saved but not yet submitted to HR.", icon: FilePen, tone: "bg-slate-50 ring-slate-200 text-slate-700" },
  submitted: { title: "Submitted — awaiting HR review", body: "You can recall it if you need to make changes.", icon: Clock, tone: "bg-blue-50 ring-blue-200 text-blue-800" },
  approved: { title: "Approved", body: "Your declaration has been approved by HR. Contact HR if you need to revise it.", icon: CheckCircle2, tone: "bg-emerald-50 ring-emerald-200 text-emerald-800" },
  rejected: { title: "Rejected", body: "HR has rejected this declaration. Contact HR to reopen it for changes.", icon: XCircle, tone: "bg-red-50 ring-red-200 text-red-800" },
};

/** Status banner for FBP / investment declarations, with HR remarks. */
export function DeclarationStatus({
  status,
  submittedAt,
  actionedAt,
  approver,
  remarks,
  action,
}: {
  status: string | null;
  submittedAt?: string | null;
  actionedAt?: string | null;
  approver?: string | null;
  remarks?: string | null;
  action?: ReactNode;
}) {
  const c = COPY[status ?? "none"] ?? COPY.none;
  const Icon = c.icon;
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl px-4 py-3 ring-1 sm:flex-row sm:items-start sm:justify-between", c.tone)}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {c.title}
            {status && <StatusBadge status={status} />}
          </p>
          <p className="mt-0.5 opacity-90">{c.body}</p>
          {submittedAt && status === "submitted" && <p className="mt-1 text-xs opacity-75">Submitted {formatDateTime(submittedAt)}</p>}
          {remarks && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-700">
              <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <b>HR remarks{approver ? ` (${approver}${actionedAt ? `, ${formatDateTime(actionedAt)}` : ""})` : ""}:</b> {remarks}
              </span>
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
