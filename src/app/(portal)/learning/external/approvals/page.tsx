import { CheckCircle2, Clock, IndianRupee, Inbox } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedDocumentUrl } from "@/lib/storage";
import { Avatar, Card, EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { LinkTabs } from "@/components/ui/link-tabs";
import { formatCurrency, formatDate, orgToday } from "@/lib/utils";
import { decideExternalTraining } from "../../external-actions";
import { TrainingMeta, type ExternalRow } from "../../_components/external-ui";
import { fyRange } from "../../_lib/time";

export const metadata = { title: "Training Approvals" };

export default async function ExternalApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireManager();
  const { tab } = await searchParams;
  const history = tab === "history";
  const supabase = await createClient();
  const fy = fyRange(orgToday());
  const { data } = await supabase
    .from("external_trainings")
    .select(
      "*, employee:employees!external_trainings_employee_id_fkey(full_name, avatar_url, employee_code, designation:designations(title)), approver:employees!external_trainings_approver_id_fkey(full_name)",
    )
    .neq("employee_id", me.id)
    .order("created_at", { ascending: false });
  const all = data ?? [];
  const pending = all.filter((r) => r.status === "pending");
  const decided = all.filter((r) => r.status !== "pending");
  const rows = history ? decided : pending;
  const spend = all
    .filter((r) => (r.status === "approved" || r.status === "completed") && r.start_date >= fy.from && r.start_date <= fy.to)
    .reduce((s, r) => s + Number(r.cost), 0);
  const certUrls = new Map(
    await Promise.all(rows.filter((r) => r.certificate_path).map(async (r) => [r.id, await signedDocumentUrl(r.certificate_path)] as const)),
  );

  return (
    <div>
      <PageHeader
        title="Training Approvals"
        description={me.isHR ? "External training requests from across the organisation." : "External training requests from your team."}
        breadcrumbs={[{ label: "Learning", href: "/learning" }, { label: "External Training", href: "/learning/external" }, { label: "Approvals" }]}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Awaiting decision" value={pending.length} icon={Clock} tone="bg-amber-50 text-amber-600" />
        <StatCard label="Approved / completed" value={all.filter((r) => r.status === "approved" || r.status === "completed").length} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" />
        <StatCard label={`Approved spend · ${fy.label}`} value={formatCurrency(spend)} icon={IndianRupee} tone="bg-[#d5e9f0] text-[#25708a]" className="col-span-2 lg:col-span-1" />
      </div>
      <LinkTabs
        tabs={[
          { label: "Pending", href: "/learning/external/approvals", count: pending.length },
          { label: "History", href: "/learning/external/approvals?tab=history", count: decided.length },
        ]}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={Inbox} title={history ? "No decisions yet" : "You're all caught up"} description={history ? "Approved and rejected requests will show here." : "No external training requests are waiting for you."} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                <div className="flex min-w-0 flex-1 gap-3">
                  <Avatar name={t.employee?.full_name} src={t.employee?.avatar_url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{t.employee?.full_name}</span> · {t.employee?.designation?.title ?? t.employee?.employee_code} · requested {formatDate(t.created_at)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">{t.title}</p>
                      {history && <StatusBadge status={t.status} />}
                    </div>
                    <TrainingMeta t={t as unknown as ExternalRow} certUrl={certUrls.get(t.id)} />
                    <p className="mt-2 whitespace-pre-line text-xs text-slate-600">{t.justification}</p>
                    {history && t.decided_at && (
                      <p className="mt-2 text-xs text-slate-500">
                        {t.status === "rejected" ? "Rejected" : "Approved"} by {t.approver?.full_name ?? "—"} on {formatDate(t.decided_at)}
                        {t.approver_remarks && ` — “${t.approver_remarks}”`}
                      </p>
                    )}
                  </div>
                </div>
                {!history && (
                  <div className="flex shrink-0 gap-2 pl-11 sm:pl-0">
                    <ActionButton action={decideExternalTraining} fields={{ id: t.id, decision: "approved" }} variant="success" prompt="Remarks (optional)">
                      Approve
                    </ActionButton>
                    <ActionButton action={decideExternalTraining} fields={{ id: t.id, decision: "rejected" }} variant="danger" prompt="Reason for rejection" promptRequired>
                      Reject
                    </ActionButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
