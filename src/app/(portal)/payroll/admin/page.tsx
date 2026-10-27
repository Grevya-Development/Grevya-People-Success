import { redirect } from "next/navigation";
import { requireHR } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { LinkTabs } from "@/components/ui/link-tabs";
import { orgToday } from "@/lib/utils";
import { RunTab } from "./_components/run-tab";
import { StructuresTab } from "./_components/structures-tab";
import { DeclarationsTab } from "./_components/declarations-tab";
import { PayslipsTab } from "./_components/payslips-tab";

export const metadata = { title: "Payroll Run & Salary" };

type SP = { tab?: string; period?: string; q?: string; type?: string; view?: string };

/** "2026-10" -> { year, month } (falls back to the current month). */
function parsePeriod(period: string | undefined, today: string) {
  const p = /^\d{4}-(0[1-9]|1[0-2])$/.test(period ?? "") ? period! : today.slice(0, 7);
  return { year: Number(p.slice(0, 4)), month: Number(p.slice(5, 7)), period: p };
}

export default async function PayrollAdminPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireHR();
  const sp = await searchParams;
  if (!sp.tab) redirect("/payroll/admin?tab=run");
  const supabase = await createClient();
  const today = orgToday();
  const tab = ["run", "structures", "declarations", "payslips"].includes(sp.tab ?? "") ? sp.tab! : "run";
  const period = parsePeriod(sp.period, today);

  const [vpf, fbp, inv] = await Promise.all([
    supabase.from("vpf_declarations").select("id", { count: "exact", head: true }).eq("status", "pending").neq("employee_id", me.id),
    supabase.from("fbp_declarations").select("id", { count: "exact", head: true }).eq("status", "submitted").neq("employee_id", me.id),
    supabase.from("investment_declarations").select("id", { count: "exact", head: true }).eq("status", "submitted").neq("employee_id", me.id),
  ]);
  const pendingDecl = (vpf.count ?? 0) + (fbp.count ?? 0) + (inv.count ?? 0);

  return (
    <div>
      <PageHeader
        title="Payroll Run & Salary"
        description="Run monthly payroll, manage salary structures and review employee declarations"
        breadcrumbs={[{ label: "HR Admin" }, { label: "Payroll" }]}
      />
      <LinkTabs
        tabs={[
          { label: "Run Payroll", href: "/payroll/admin?tab=run" },
          { label: "Salary Structures", href: "/payroll/admin?tab=structures" },
          { label: "Declarations", href: "/payroll/admin?tab=declarations", count: pendingDecl },
          { label: "Payslips", href: "/payroll/admin?tab=payslips" },
        ]}
      />
      {tab === "run" && <RunTab year={period.year} month={period.month} period={period.period} today={today} />}
      {tab === "structures" && <StructuresTab q={sp.q} today={today} />}
      {tab === "declarations" && <DeclarationsTab type={sp.type} view={sp.view} meId={me.id} />}
      {tab === "payslips" && <PayslipsTab year={period.year} month={period.month} period={period.period} today={today} />}
    </div>
  );
}
