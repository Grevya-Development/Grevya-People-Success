import { Gift, Info } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { financialYear, formatCurrency, formatDateTime, orgToday } from "@/lib/utils";
import { recallFbp } from "../actions";
import { FbpForm } from "../_components/fbp-form";
import { DeclarationStatus } from "../_components/declaration-status";
import { FBP_COMPONENTS, parseFbpComponents, toNum } from "../_lib/payroll";

export const metadata = { title: "Flexible Benefit Plan" };

export default async function FbpPage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const fy = financialYear(orgToday());

  const [{ data: s }, { data: decl }] = await Promise.all([
    supabase.from("salary_structures").select("fbp_total").eq("employee_id", me.id).eq("is_current", true).maybeSingle(),
    supabase
      .from("fbp_declarations")
      .select("*, approver:employees!fbp_declarations_approver_id_fkey(full_name)")
      .eq("employee_id", me.id)
      .eq("financial_year", fy)
      .maybeSingle(),
  ]);
  const fbpTotal = toNum(s?.fbp_total);
  const declared = parseFbpComponents(decl?.components);
  const components = FBP_COMPONENTS.map((c) => ({ ...c, declared: declared.find((d) => d.code === c.code)?.declared ?? 0 }));
  const status = decl?.status ?? "draft";

  return (
    <div>
      <PageHeader
        title="Flexible Benefit Plan"
        description={`Restructure part of your CTC into tax-efficient reimbursements for FY ${fy}`}
        breadcrumbs={[{ label: "Payroll", href: "/payroll/slips" }, { label: "FBP" }]}
      />

      {!s || fbpTotal <= 0 ? (
        <Card>
          <EmptyState
            icon={Gift}
            title={!s ? "Salary structure not set up" : "No FBP in your CTC"}
            description={!s ? "HR needs to set up your salary structure before you can declare FBP." : "Your current salary structure doesn't include a Flexible Benefit Plan amount."}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <DeclarationStatus
            status={decl ? status : null}
            submittedAt={decl?.submitted_at}
            actionedAt={decl?.actioned_at}
            approver={decl?.approver?.full_name}
            remarks={decl?.approver_remarks}
            action={
              decl?.status === "submitted" ? (
                <ActionButton action={recallFbp} fields={{ id: decl.id }} confirm="Recall this declaration to edit it?">
                  Recall to edit
                </ActionButton>
              ) : undefined
            }
          />

          <Card>
            <CardHeader
              title={`FBP entitlement: ${formatCurrency(fbpTotal)} a year`}
              description="Declare how much of your FBP goes to each component. Approved components can be claimed under CTC Reimbursement."
            />
            <CardBody>
              <FbpForm key={`${decl?.id}-${status}`} components={components} fbpTotal={fbpTotal} readOnly={status !== "draft"} />
            </CardBody>
          </Card>

          <p className="flex items-start gap-1.5 text-xs text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Declared components are paid monthly with your salary from the next payroll run after HR approval. Last updated{" "}
            {decl ? formatDateTime(decl.submitted_at ?? decl.created_at) : "—"}.
          </p>
        </div>
      )}
    </div>
  );
}
