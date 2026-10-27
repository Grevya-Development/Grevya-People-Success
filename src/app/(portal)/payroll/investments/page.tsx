import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { financialYear, orgToday } from "@/lib/utils";
import { recallInvestments } from "../actions";
import { InvestmentForm } from "../_components/investment-form";
import { DeclarationStatus } from "../_components/declaration-status";
import { annualEpf, annualGross, isRegime, parseInvestmentItems, toNum } from "../_lib/payroll";

export const metadata = { title: "Investment Details" };

export default async function InvestmentsPage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const fy = financialYear(orgToday());

  const [{ data: s }, { data: decl }] = await Promise.all([
    supabase.from("salary_structures").select("*").eq("employee_id", me.id).eq("is_current", true).maybeSingle(),
    supabase
      .from("investment_declarations")
      .select("*, approver:employees!investment_declarations_approver_id_fkey(full_name)")
      .eq("employee_id", me.id)
      .eq("financial_year", fy)
      .maybeSingle(),
  ]);
  const status = decl?.status ?? "draft";
  const salary = s ? { basic: toNum(s.basic), hra: toNum(s.hra), gross: annualGross(s) } : null;

  return (
    <div>
      <PageHeader
        title="Investment Details"
        description={`Declare your tax-saving investments for FY ${fy} so the right TDS is deducted from your salary`}
        breadcrumbs={[{ label: "Payroll", href: "/payroll/slips" }, { label: "Investment Details" }]}
      />
      <div className="space-y-5">
        <DeclarationStatus
          status={decl ? status : null}
          submittedAt={decl?.submitted_at}
          actionedAt={decl?.actioned_at}
          approver={decl?.approver?.full_name}
          remarks={decl?.approver_remarks}
          action={
            decl?.status === "submitted" ? (
              <ActionButton action={recallInvestments} fields={{ id: decl.id }} confirm="Recall this declaration to edit it?">
                Recall to edit
              </ActionButton>
            ) : undefined
          }
        />
        <InvestmentForm
          items={parseInvestmentItems(decl?.items)}
          regime={decl && isRegime(decl.regime) ? decl.regime : "new"}
          salary={salary}
          epfAnnual={s ? annualEpf(toNum(s.basic)) : 0}
          readOnly={status !== "draft"}
        />
      </div>
    </div>
  );
}
