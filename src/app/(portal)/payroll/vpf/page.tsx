import { PiggyBank, Wallet, Landmark } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { formatCurrency, formatDate, orgToday } from "@/lib/utils";
import { cancelVpf } from "../actions";
import { VpfForm } from "../_components/vpf-form";
import { PAYROLL_THEME, toNum } from "../_lib/payroll";

export const metadata = { title: "VPF Declaration" };

export default async function VpfPage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const today = orgToday();
  const thisMonth = today.slice(0, 7);

  const [{ data: s }, { data: history }] = await Promise.all([
    supabase.from("salary_structures").select("basic").eq("employee_id", me.id).eq("is_current", true).maybeSingle(),
    supabase
      .from("vpf_declarations")
      .select("*, approver:employees!vpf_declarations_approver_id_fkey(full_name)")
      .eq("employee_id", me.id)
      .order("created_at", { ascending: false }),
  ]);
  const rows = history ?? [];
  const monthlyBasic = toNum(s?.basic) / 12;
  const active = rows
    .filter((r) => r.status === "approved" && r.effective_month <= `${thisMonth}-01`)
    .sort((a, b) => (a.effective_month < b.effective_month ? 1 : a.effective_month > b.effective_month ? -1 : a.created_at < b.created_at ? 1 : -1))[0];
  const pending = rows.find((r) => r.status === "pending");
  const activePct = toNum(active?.percentage);

  return (
    <div>
      <PageHeader
        title="VPF Declaration"
        description="Contribute more than the mandatory 12% to your provident fund through Voluntary PF"
        breadcrumbs={[{ label: "Payroll", href: "/payroll/slips" }, { label: "VPF Declaration" }]}
      />

      {!s ? (
        <Card>
          <EmptyState icon={PiggyBank} title="Salary structure not set up" description="VPF is calculated on your basic salary. HR needs to set up your salary structure first." />
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Monthly basic" value={formatCurrency(monthlyBasic)} icon={Wallet} tone={PAYROLL_THEME.stat} />
            <StatCard label="Mandatory EPF (12%)" value={formatCurrency(monthlyBasic * 0.12)} icon={Landmark} tone="bg-slate-100 text-slate-600" hint="Matched by Grevya" />
            <StatCard
              label="Current VPF"
              value={activePct > 0 ? `${activePct}%` : "None"}
              icon={PiggyBank}
              tone="bg-emerald-50 text-emerald-600"
              hint={activePct > 0 && active ? `${formatCurrency((monthlyBasic * activePct) / 100)}/month since ${formatDate(active.effective_month, "MMM yyyy")}` : "Only the mandatory 12% is deducted"}
            />
          </div>

          <Card>
            <CardHeader title="New declaration" description="Your request goes to HR for approval. VPF earns the same interest as EPF." />
            <CardBody>
              {pending && (
                <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
                  Your request for {toNum(pending.percentage)}% from {formatDate(pending.effective_month, "MMM yyyy")} is awaiting approval. Cancel it below to raise a new one.
                </p>
              )}
              <VpfForm monthlyBasic={monthlyBasic} minMonth={thisMonth} disabled={!!pending} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="History" />
            {rows.length === 0 ? (
              <EmptyState title="No VPF declarations yet" description="Declarations you raise will be listed here." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Requested on</TH>
                    <TH>FY</TH>
                    <TH className="text-right">VPF %</TH>
                    <TH className="text-right">Monthly amount</TH>
                    <TH>Effective from</TH>
                    <TH>Status</TH>
                    <TH>HR remarks</TH>
                    <TH />
                  </tr>
                </THead>
                <TBody>
                  {rows.map((r) => (
                    <TR key={r.id}>
                      <TD className="whitespace-nowrap">{formatDate(r.created_at)}</TD>
                      <TD>{r.financial_year}</TD>
                      <TD className="text-right font-medium">{toNum(r.percentage)}%</TD>
                      <TD className="text-right tabular-nums">{formatCurrency((monthlyBasic * toNum(r.percentage)) / 100)}</TD>
                      <TD className="whitespace-nowrap">{formatDate(r.effective_month, "MMM yyyy")}</TD>
                      <TD>
                        <StatusBadge status={r.status} />
                      </TD>
                      <TD className="max-w-xs text-xs text-slate-500">
                        {r.approver_remarks || "—"}
                        {r.approver?.full_name && r.actioned_at && <span className="block text-slate-400">{r.approver.full_name} · {formatDate(r.actioned_at)}</span>}
                      </TD>
                      <TD className="text-right">
                        {r.status === "pending" && (
                          <ActionButton action={cancelVpf} fields={{ id: r.id }} confirm="Cancel this VPF request?" variant="danger">
                            Cancel
                          </ActionButton>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
