import Link from "next/link";
import { FileText, Plus, Receipt, Wallet } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, CardHeader, EmptyState, PageHeader, ProgressBar, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { Dialog } from "@/components/ui/dialog";
import { financialYear, formatCurrency, formatDate, orgToday } from "@/lib/utils";
import { cancelClaim } from "../../reimbursement/actions";
import { claimNumber } from "../../reimbursement/_lib/claims";
import { CtcClaimForm, type CtcOption } from "../_components/ctc-claim-form";
import { PAYROLL_THEME, fyRange, parseFbpComponents, round2, toNum } from "../_lib/payroll";

export const metadata = { title: "CTC Reimbursement" };

const COUNTED = ["submitted", "approved", "paid"];

export default async function CtcReimbursementPage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const today = orgToday();
  const fy = financialYear(today);
  const { start, end } = fyRange(fy);

  const [{ data: decl }, { data: cats }, { data: claims }] = await Promise.all([
    supabase.from("fbp_declarations").select("components, status").eq("employee_id", me.id).eq("financial_year", fy).maybeSingle(),
    supabase.from("claim_categories").select("id, name, max_amount, requires_receipt, active").eq("kind", "ctc"),
    supabase
      .from("claims")
      .select("id, seq, title, expense_date, amount, status, created_at, approver_remarks, category:claim_categories!inner(id, name, kind)")
      .eq("employee_id", me.id)
      .eq("category.kind", "ctc")
      .order("created_at", { ascending: false }),
  ]);

  const approved = decl?.status === "approved";
  const components = approved ? parseFbpComponents(decl.components).filter((c) => c.declared > 0) : [];
  const allClaims = claims ?? [];
  const fyClaims = allClaims.filter((c) => c.expense_date >= start && c.expense_date <= end);

  const rows = components.map((c) => {
    const cat = (cats ?? []).find((k) => k.name.trim().toLowerCase() === c.label.toLowerCase());
    const mine = cat ? fyClaims.filter((x) => x.category?.id === cat.id) : [];
    const claimed = round2(mine.filter((x) => COUNTED.includes(x.status)).reduce((a, x) => a + toNum(x.amount), 0));
    const paid = round2(mine.filter((x) => x.status === "paid").reduce((a, x) => a + toNum(x.amount), 0));
    return { ...c, cat, claimed, paid, balance: round2(c.declared - claimed) };
  });
  const options: CtcOption[] = rows
    .filter((r) => r.cat?.active && r.balance > 0)
    .map((r) => ({ code: r.code, label: r.label, balance: r.balance, maxAmount: r.cat!.max_amount === null ? null : toNum(r.cat!.max_amount), requiresReceipt: r.cat!.requires_receipt }));
  const missing = rows.filter((r) => !r.cat || !r.cat.active);
  const totals = rows.reduce((a, r) => ({ declared: a.declared + r.declared, claimed: a.claimed + r.claimed, paid: a.paid + r.paid }), { declared: 0, claimed: 0, paid: 0 });

  const raise = (code?: string, label = "Raise claim", variant: "primary" | "outline" = "primary") =>
    options.length > 0 && (
      <Dialog
        title="Raise CTC reimbursement claim"
        description={`Claims are paid against your approved FBP for FY ${fy}`}
        trigger={
          <Button variant={variant} size={code ? "sm" : "md"}>
            <Plus className="h-4 w-4" />
            {label}
          </Button>
        }
      >
        <CtcClaimForm options={options} today={today} fyStart={start} defaultCode={code} />
      </Dialog>
    );

  return (
    <div>
      <PageHeader
        title="CTC Reimbursement"
        description={`Claim your Flexible Benefit Plan components against bills — FY ${fy}`}
        breadcrumbs={[{ label: "Payroll", href: "/payroll/slips" }, { label: "CTC Reimbursement" }]}
        actions={raise()}
      />

      {!approved ? (
        <Card>
          <EmptyState
            icon={Receipt}
            title="No approved FBP declaration"
            description={decl ? `Your FBP declaration for FY ${fy} is ${decl.status}. Once HR approves it, you can claim reimbursements here.` : `Declare your Flexible Benefit Plan for FY ${fy} first. Once HR approves it, you can claim reimbursements here.`}
            action={
              <Link href="/payroll/fbp" className={buttonClass("primary")}>
                Go to FBP
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Declared (FBP)" value={formatCurrency(totals.declared)} icon={Wallet} tone={PAYROLL_THEME.stat} />
            <StatCard label="Claimed" value={formatCurrency(totals.claimed)} icon={FileText} tone="bg-blue-50 text-blue-600" hint={`${formatCurrency(totals.paid)} paid`} />
            <StatCard label="Balance" value={formatCurrency(totals.declared - totals.claimed)} icon={Receipt} tone="bg-emerald-50 text-emerald-600" />
          </div>

          {missing.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              Claims for {missing.map((m) => m.label).join(", ")} aren&apos;t open yet — HR still needs to enable {missing.length === 1 ? "this category" : "these categories"}. Please check back later or raise a helpdesk ticket.
            </p>
          )}

          <Card>
            <CardHeader title="Components" description="Declared vs claimed (pending + approved + paid) for this financial year" />
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((r) => (
                <div key={r.code} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-800">{r.label}</p>
                    {r.cat?.active && r.balance > 0 ? raise(r.code, "Claim", "outline") : <span className="text-xs text-slate-400">{r.cat?.active ? "Fully claimed" : "Not enabled"}</span>}
                  </div>
                  <ProgressBar value={r.declared > 0 ? (r.claimed / r.declared) * 100 : 0} className="mt-3" barClassName="bg-[#78a83a]" />
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-slate-500">Declared</dt>
                      <dd className="font-semibold tabular-nums text-slate-800">{formatCurrency(r.declared)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Claimed</dt>
                      <dd className="font-semibold tabular-nums text-slate-800">{formatCurrency(r.claimed)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Balance</dt>
                      <dd className="font-semibold tabular-nums text-[#4f7a1f]">{formatCurrency(r.balance)}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Card className="mt-5">
        <CardHeader title="My CTC claims" description="All years" />
        {allClaims.length === 0 ? (
          <EmptyState title="No CTC claims yet" description="Claims you raise against your FBP components will appear here." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Claim no.</TH>
                <TH>Component</TH>
                <TH>Title</TH>
                <TH>Bill date</TH>
                <TH className="text-right">Amount</TH>
                <TH>Status</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {allClaims.map((c) => (
                <TR key={c.id}>
                  <TD className="whitespace-nowrap">
                    <Link href={`/reimbursement/claims/${c.id}`} className="font-medium text-primary-600 hover:underline">
                      {claimNumber(c.seq)}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap">{c.category?.name}</TD>
                  <TD className="max-w-xs truncate">{c.title}</TD>
                  <TD className="whitespace-nowrap">{formatDate(c.expense_date)}</TD>
                  <TD className="text-right tabular-nums">{formatCurrency(c.amount, 2)}</TD>
                  <TD>
                    <StatusBadge status={c.status} />
                  </TD>
                  <TD className="text-right">
                    {(c.status === "submitted" || c.status === "draft") && (
                      <ActionButton action={cancelClaim} fields={{ id: c.id }} confirm="Cancel this claim?" variant="danger">
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
  );
}
