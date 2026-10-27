import { CheckCircle2, Clock, GraduationCap, IndianRupee, Plus, Upload } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedDocumentUrl } from "@/lib/storage";
import { Button, Card, CardHeader, EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { Dialog } from "@/components/ui/dialog";
import { formatCurrency, formatDate, orgToday } from "@/lib/utils";
import { cancelExternalTraining } from "../external-actions";
import { CompleteTrainingForm, ExternalRequestForm, TrainingMeta, type ExternalRow } from "../_components/external-ui";
import { fyRange } from "../_lib/time";

export const metadata = { title: "External Training" };

export default async function ExternalTrainingPage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const today = orgToday();
  const fy = fyRange(today);
  const { data } = await supabase
    .from("external_trainings")
    .select("*, approver:employees!external_trainings_approver_id_fkey(full_name)")
    .eq("employee_id", me.id)
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  const certUrls = new Map(await Promise.all(rows.filter((r) => r.certificate_path).map(async (r) => [r.id, await signedDocumentUrl(r.certificate_path)] as const)));

  const inFy = (r: (typeof rows)[number]) => r.start_date >= fy.from && r.start_date <= fy.to;
  const spend = rows.filter((r) => (r.status === "approved" || r.status === "completed") && inFy(r)).reduce((s, r) => s + Number(r.cost), 0);
  const pending = rows.filter((r) => r.status === "pending");
  const completed = rows.filter((r) => r.status === "completed");

  return (
    <div>
      <PageHeader
        title="External Training"
        description="Request approval for outside courses, certifications, conferences and workshops — and record them when you finish."
        breadcrumbs={[{ label: "Learning", href: "/learning" }, { label: "External Training" }]}
        actions={
          <Dialog
            trigger={
              <Button>
                <Plus className="h-4 w-4" /> New request
              </Button>
            }
            title="Request external training"
            description={me.manager ? `Goes to ${me.manager.full_name} for approval` : "Goes to HR for approval"}
            size="lg"
          >
            <ExternalRequestForm today={today} />
          </Dialog>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Approved spend · ${fy.label}`} value={formatCurrency(spend)} icon={IndianRupee} tone="bg-[#d5e9f0] text-[#25708a]" hint="Approved + completed" />
        <StatCard label="Pending approval" value={pending.length} icon={Clock} tone="bg-amber-50 text-amber-600" />
        <StatCard label="Completed" value={completed.length} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" />
        <StatCard label="Total requests" value={rows.length} icon={GraduationCap} tone="bg-violet-50 text-violet-600" />
      </div>

      <Card>
        <CardHeader title="My requests" />
        {rows.length === 0 ? (
          <EmptyState icon={GraduationCap} title="No external training yet" description="Found a course or conference worth attending? Raise a request and your manager will review it." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">{t.title}</p>
                    <StatusBadge status={t.status} />
                  </div>
                  <TrainingMeta t={t as unknown as ExternalRow} certUrl={certUrls.get(t.id)} />
                  <p className="mt-2 line-clamp-2 text-xs text-slate-500">{t.justification}</p>
                  {(t.status === "approved" || t.status === "rejected" || t.status === "completed") && t.decided_at && (
                    <p className={`mt-2 rounded-lg px-3 py-2 text-xs ring-1 ring-inset ${t.status === "rejected" ? "bg-red-50 text-red-700 ring-red-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"}`}>
                      {t.status === "rejected" ? "Rejected" : "Approved"} by {t.approver?.full_name ?? "approver"} on {formatDate(t.decided_at)}
                      {t.approver_remarks && ` — “${t.approver_remarks}”`}
                    </p>
                  )}
                  {t.status === "completed" && (
                    <p className="mt-2 text-xs text-slate-500">
                      Completed {formatDate(t.completed_at)}
                      {t.completion_notes && ` · ${t.completion_notes}`}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {(t.status === "approved" || (t.status === "completed" && !t.certificate_path)) && (
                    <Dialog
                      trigger={
                        <Button size="sm" variant={t.status === "approved" ? "success" : "secondary"}>
                          {t.status === "approved" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                          {t.status === "approved" ? "Mark completed" : "Add certificate"}
                        </Button>
                      }
                      title={t.status === "approved" ? "Mark training completed" : "Upload certificate"}
                      description={t.title}
                      size="sm"
                    >
                      <CompleteTrainingForm id={t.id} completed={t.status === "completed"} />
                    </Dialog>
                  )}
                  {(t.status === "pending" || t.status === "approved") && (
                    <ActionButton action={cancelExternalTraining} fields={{ id: t.id }} confirm={`Cancel "${t.title}"?`}>
                      Cancel
                    </ActionButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
