import Link from "next/link";
import { CheckCircle2, Clock, Plus, Receipt, Wallet, XCircle } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Select,
  StatCard,
  StatusBadge,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  buttonClass,
} from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CLAIM_STATUSES, REIMB_THEME, STATUS_LABEL, claimNumber, isUuid } from "../_lib/claims";

export const metadata = { title: "My Claims" };

export default async function MyClaimsPage({ searchParams }: { searchParams: Promise<{ status?: string; category?: string }> }) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const status = CLAIM_STATUSES.includes(sp.status as (typeof CLAIM_STATUSES)[number]) ? sp.status! : "";
  const category = isUuid(sp.category) ? sp.category : "";

  const supabase = await createClient();
  const [{ data: claimsData }, { data: categoriesData }] = await Promise.all([
    supabase
      .from("claims")
      .select("id, seq, title, amount, expense_date, status, created_at, category_id, category:claim_categories(name, kind)")
      .eq("employee_id", me.id)
      .order("created_at", { ascending: false }),
    supabase.from("claim_categories").select("id, name, kind").order("name"),
  ]);
  const all = claimsData ?? [];
  const claims = all.filter((c) => (!status || c.status === status) && (!category || c.category_id === category));

  const sum = (s: string) => all.filter((c) => c.status === s).reduce((t, c) => t + Number(c.amount), 0);
  const count = (s: string) => all.filter((c) => c.status === s).length;
  const filtered = Boolean(status || category);

  return (
    <>
      <PageHeader
        title="My Claims"
        description="Track your reimbursement claims from submission to payment."
        breadcrumbs={[{ label: "Reimbursement", href: "/reimbursement/claims" }, { label: "My Claims" }]}
        actions={
          <Link href="/reimbursement/new" className={buttonClass("primary")}>
            <Plus className="h-4 w-4" />
            Raise New Claim
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pending approval" value={formatCurrency(sum("submitted"))} hint={`${count("submitted")} claim(s)`} icon={Clock} tone="bg-amber-50 text-amber-600" />
        <StatCard label="Approved · awaiting payment" value={formatCurrency(sum("approved"))} hint={`${count("approved")} claim(s)`} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" />
        <StatCard label="Paid" value={formatCurrency(sum("paid"))} hint={`${count("paid")} claim(s)`} icon={Wallet} tone={REIMB_THEME.stat} />
        <StatCard label="Rejected" value={formatCurrency(sum("rejected"))} hint={`${count("rejected")} claim(s) · ${count("draft")} draft(s)`} icon={XCircle} tone="bg-red-50 text-red-600" />
      </div>

      <Card>
        <CardHeader
          title="Claims"
          description={filtered ? `${claims.length} of ${all.length} claims` : `${all.length} claim${all.length === 1 ? "" : "s"}`}
          action={
            <form method="get" className="flex flex-wrap items-center gap-2">
              <Select name="status" defaultValue={status} className="h-8 w-40 text-xs" aria-label="Status">
                <option value="">All statuses</option>
                {CLAIM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
              <Select name="category" defaultValue={category} className="h-8 w-44 text-xs" aria-label="Category">
                <option value="">All categories</option>
                {(categoriesData ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.kind === "ctc" ? " (CTC)" : ""}
                  </option>
                ))}
              </Select>
              <button type="submit" className={buttonClass("secondary", "sm")}>
                Apply
              </button>
              {filtered && (
                <Link href="/reimbursement/claims" className={buttonClass("ghost", "sm")}>
                  Clear
                </Link>
              )}
            </form>
          }
          className="flex-col sm:flex-row"
        />
        {claims.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={filtered ? "No claims match these filters" : "You haven't raised any claims yet"}
            description={filtered ? "Try a different status or category." : "Spent money on official work? Raise a claim to get reimbursed."}
            action={
              !filtered && (
                <Link href="/reimbursement/new" className={buttonClass("primary", "sm")}>
                  Raise New Claim
                </Link>
              )
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Claim #</TH>
                <TH>Title</TH>
                <TH>Category</TH>
                <TH>Expense date</TH>
                <TH className="text-right">Amount</TH>
                <TH>Status</TH>
                <TH>Raised on</TH>
              </tr>
            </THead>
            <TBody>
              {claims.map((c) => (
                <TR key={c.id}>
                  <TD className="whitespace-nowrap">
                    <Link href={`/reimbursement/claims/${c.id}`} className="font-medium text-primary-600 hover:underline">
                      {claimNumber(c.seq)}
                    </Link>
                  </TD>
                  <TD className="max-w-[240px]">
                    <Link href={`/reimbursement/claims/${c.id}`} className="block truncate hover:text-primary-700">
                      {c.title}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap">
                    {c.category?.name ?? "—"}
                    {c.category?.kind === "ctc" && (
                      <Badge tone="green" className="ml-2">
                        CTC
                      </Badge>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap">{formatDate(c.expense_date)}</TD>
                  <TD className="whitespace-nowrap text-right font-medium text-slate-900">{formatCurrency(c.amount, 2)}</TD>
                  <TD>
                    <StatusBadge status={c.status} label={STATUS_LABEL[c.status]} />
                  </TD>
                  <TD className="whitespace-nowrap text-slate-500">{formatDate(c.created_at)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
