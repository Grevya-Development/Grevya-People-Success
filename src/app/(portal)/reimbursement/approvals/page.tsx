import Link from "next/link";
import { Check, FileText, Inbox, X } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedDocumentUrl } from "@/lib/storage";
import { ActionButton } from "@/components/ui/action-button";
import { LinkTabs } from "@/components/ui/link-tabs";
import { Avatar, Badge, Card, EmptyState, PageHeader, TBody, TD, TH, THead, TR, Table } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { approveClaim, rejectClaim } from "../actions";
import { BulkPayTable } from "../_components/bulk-pay-table";
import { claimNumber } from "../_lib/claims";

export const metadata = { title: "Claim Approvals" };

const TABS = [
  { key: "pending", status: "submitted", label: "Pending" },
  { key: "approved", status: "approved", label: "Approved" },
  { key: "paid", status: "paid", label: "Paid" },
  { key: "rejected", status: "rejected", label: "Rejected" },
] as const;

export default async function ClaimApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireManager();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];

  const supabase = await createClient();
  const countFor = (status: string) =>
    supabase.from("claims").select("id", { count: "exact", head: true }).eq("status", status).neq("employee_id", me.id);

  const [counts, { data }] = await Promise.all([
    Promise.all(TABS.map((t) => countFor(t.status))),
    supabase
      .from("claims")
      .select(
        "id, seq, title, amount, expense_date, description, receipt_path, created_at, actioned_at, paid_at, approver_remarks, category:claim_categories(name, kind), employee:employees!claims_employee_id_fkey(full_name, employee_code, avatar_url), approver:employees!claims_approver_id_fkey(full_name)",
      )
      .eq("status", tab.status)
      .neq("employee_id", me.id)
      .order(tab.key === "pending" ? "created_at" : tab.key === "paid" ? "paid_at" : "actioned_at", { ascending: tab.key === "pending" })
      .limit(300),
  ]);

  // Rows were returned by an RLS-protected select, so the viewer may see these receipts.
  const rows = await Promise.all(
    (data ?? []).map(async (c) => ({ ...c, receiptUrl: await signedDocumentUrl(c.receipt_path) })),
  );
  const total = rows.reduce((t, r) => t + Number(r.amount), 0);

  return (
    <>
      <PageHeader
        title="Claim Approvals"
        description={me.isHR ? "Review claims across the organisation and release payments for approved ones." : "Review reimbursement claims raised by your team."}
        breadcrumbs={[{ label: "Reimbursement", href: "/reimbursement/claims" }, { label: "Claim Approvals" }]}
      />

      <LinkTabs tabs={TABS.map((t, i) => ({ label: t.label, href: `/reimbursement/approvals?tab=${t.key}`, count: counts[i].count ?? 0 }))} />

      <Card className="overflow-hidden">
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-sm">
            <span className="text-slate-600">
              {rows.length} claim{rows.length === 1 ? "" : "s"}
              {(counts[TABS.indexOf(tab)].count ?? 0) > rows.length && <span className="text-slate-400"> (showing latest {rows.length})</span>}
            </span>
            <span className="font-medium text-slate-900">Total {formatCurrency(total, 2)}</span>
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={tab.key === "pending" ? "No claims awaiting your approval" : `No ${tab.label.toLowerCase()} claims`}
            description={tab.key === "pending" ? "You're all caught up. New claims from your team will appear here." : undefined}
          />
        ) : tab.key === "approved" && me.isHR ? (
          <BulkPayTable
            rows={rows.map((r) => ({
              id: r.id,
              number: claimNumber(r.seq),
              title: r.title,
              amount: Number(r.amount),
              expense_date: r.expense_date,
              actioned_at: r.actioned_at,
              category: r.category?.name ?? "—",
              isCtc: r.category?.kind === "ctc",
              employee: r.employee,
              approver: r.approver?.full_name ?? null,
              receiptUrl: r.receiptUrl,
            }))}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Claim #</TH>
                <TH>Employee</TH>
                <TH>Category</TH>
                <TH>Expense date</TH>
                <TH className="text-right">Amount</TH>
                <TH>Receipt</TH>
                <TH>{tab.key === "pending" ? "Raised on" : tab.key === "paid" ? "Paid on" : "Actioned"}</TH>
                {tab.key === "pending" && <TH className="text-right">Actions</TH>}
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap">
                    <Link href={`/reimbursement/claims/${r.id}`} className="font-medium text-primary-600 hover:underline">
                      {claimNumber(r.seq)}
                    </Link>
                    <p className="max-w-[220px] truncate text-xs text-slate-500" title={r.description ?? r.title}>
                      {r.title}
                    </p>
                  </TD>
                  <TD>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <Avatar name={r.employee?.full_name} src={r.employee?.avatar_url} size="sm" />
                      <span>
                        <span className="block text-slate-800">{r.employee?.full_name ?? "—"}</span>
                        <span className="block text-xs text-slate-500">{r.employee?.employee_code}</span>
                      </span>
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap">
                    {r.category?.name ?? "—"}
                    {r.category?.kind === "ctc" && (
                      <Badge tone="green" className="ml-2">
                        CTC
                      </Badge>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap">{formatDate(r.expense_date)}</TD>
                  <TD className="whitespace-nowrap text-right font-medium text-slate-900">{formatCurrency(r.amount, 2)}</TD>
                  <TD>
                    {r.receiptUrl ? (
                      <a href={r.receiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
                        <FileText className="h-3.5 w-3.5" />
                        View
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-slate-500">
                    {tab.key === "pending" ? formatDate(r.created_at) : tab.key === "paid" ? formatDate(r.paid_at) : formatDate(r.actioned_at)}
                    {tab.key !== "pending" && r.approver?.full_name && <span className="block">by {r.approver.full_name}</span>}
                    {tab.key === "rejected" && r.approver_remarks && (
                      <span className="block max-w-[200px] truncate text-red-600" title={r.approver_remarks}>
                        {r.approver_remarks}
                      </span>
                    )}
                  </TD>
                  {tab.key === "pending" && (
                    <TD>
                      <div className="flex justify-end gap-2">
                        <ActionButton action={approveClaim} fields={{ id: r.id }} prompt="Remarks (optional)" variant="success">
                          <Check className="h-3.5 w-3.5" />
                          Approve
                        </ActionButton>
                        <ActionButton action={rejectClaim} fields={{ id: r.id }} prompt="Reason for rejection" promptRequired variant="danger">
                          <X className="h-3.5 w-3.5" />
                          Reject
                        </ActionButton>
                      </div>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {tab.key === "approved" && !me.isHR && rows.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">Approved claims are paid out by HR. They&apos;ll move to the Paid tab once released.</p>
      )}
    </>
  );
}
