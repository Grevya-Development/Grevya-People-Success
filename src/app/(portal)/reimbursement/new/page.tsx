import Link from "next/link";
import { FolderX, ReceiptText } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, WidgetCard, buttonClass } from "@/components/ui";
import { formatCurrency, orgToday } from "@/lib/utils";
import { ClaimForm } from "../_components/claim-form";
import { REIMB_THEME } from "../_lib/claims";

export const metadata = { title: "Raise New Claim" };

export default async function NewClaimPage() {
  await requireEmployee();
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("claim_categories")
    .select("id, name, max_amount, requires_receipt")
    .eq("kind", "expense")
    .eq("active", true)
    .order("name");
  const cats = categories ?? [];

  return (
    <>
      <PageHeader
        title="Raise New Claim"
        description="Claim back business expenses you've paid for out of pocket."
        breadcrumbs={[{ label: "Reimbursement", href: "/reimbursement/claims" }, { label: "Raise New Claim" }]}
        actions={
          <Link href="/reimbursement/claims" className={buttonClass("outline")}>
            My Claims
          </Link>
        }
      />

      {cats.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderX}
            title="No expense categories are set up yet"
            description="HR needs to configure reimbursement categories before claims can be raised. Please reach out to the HR team."
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader title="Claim details" description="Save as a draft to finish later, or submit it for your manager's approval." />
            <CardBody>
              <ClaimForm categories={cats} today={orgToday()} cancelHref="/reimbursement/claims" />
            </CardBody>
          </Card>

          <div className="space-y-6">
            <WidgetCard title="Expense categories" color={REIMB_THEME.solid} bodyClassName="p-0">
              <ul className="divide-y divide-slate-100">
                {cats.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <ReceiptText className={`h-4 w-4 shrink-0 ${REIMB_THEME.text}`} />
                      <span className="truncate text-slate-700">{c.name}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-slate-500">
                      {c.max_amount != null ? `up to ${formatCurrency(c.max_amount)}` : "no limit"}
                      {c.requires_receipt && <span className="block text-[11px] text-[#7c7a17]">receipt required</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </WidgetCard>
            <div className={`rounded-xl border border-[#e2e3b5] px-5 py-4 ${REIMB_THEME.pill}`}>
              <div className="space-y-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-700">Before you submit</p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>One claim per bill — keep the original receipt until it&apos;s paid.</li>
                  <li>Expense date must be today or earlier.</li>
                  <li>Submitted claims go to your reporting manager; approved claims are paid by HR with payroll.</li>
                  <li>You can cancel a claim any time before it&apos;s approved.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
