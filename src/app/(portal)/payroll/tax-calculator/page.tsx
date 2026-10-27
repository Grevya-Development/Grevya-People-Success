import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { financialYear, orgToday } from "@/lib/utils";
import { TaxCalculator, type TaxCalcDefaults } from "../_components/tax-calculator";
import { annualEpf, annualGross, parseInvestmentItems, toNum } from "../_lib/payroll";

export const metadata = { title: "Tax Calculator" };

export default async function TaxCalculatorPage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const fy = financialYear(orgToday());

  const [{ data: s }, { data: inv }] = await Promise.all([
    supabase.from("salary_structures").select("*").eq("employee_id", me.id).eq("is_current", true).maybeSingle(),
    supabase.from("investment_declarations").select("items").eq("employee_id", me.id).eq("financial_year", fy).maybeSingle(),
  ]);

  const items = parseInvestmentItems(inv?.items);
  const sum = (section: string) => items.filter((i) => i.section === section).reduce((a, i) => a + i.declared, 0);
  const hraItem = items.find((i) => i.code === "hra");

  const defaults: TaxCalcDefaults = {
    grossSalary: s ? annualGross(s) : 0,
    otherIncome: 0,
    basic: toNum(s?.basic),
    hraReceived: toNum(s?.hra),
    monthlyRent: toNum(hraItem?.monthly_rent),
    metro: !!hraItem?.metro,
    sec80C: sum("80C") + (s ? annualEpf(toNum(s.basic)) : 0),
    sec80D: sum("80D"),
    sec24b: sum("24(b)"),
    sec80CCD1B: sum("80CCD(1B)"),
    sec80E: sum("80E"),
    sec80G: sum("80G"),
  };
  const source = [s && "your salary structure", inv && "your investment declaration"].filter((x): x is string => !!x);

  return (
    <div>
      <PageHeader
        title="Tax Calculator"
        description={`Compare the old and new tax regimes for FY ${fy}. Changes here are not saved.`}
        breadcrumbs={[{ label: "Payroll", href: "/payroll/slips" }, { label: "Tax Calculator" }]}
      />
      <TaxCalculator defaults={defaults} source={source} />
    </div>
  );
}
