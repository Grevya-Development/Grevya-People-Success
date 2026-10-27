import Link from "next/link";
import { CalendarClock, FileText, IndianRupee, MinusCircle, Wallet } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { cn, financialYear, formatCurrency, formatDate, orgToday } from "@/lib/utils";
import { PAYROLL_THEME, annualGross, fyMonths, fyOf, fyStartYear, MONTHS_SHORT, toNum, ym } from "../_lib/payroll";

export const metadata = { title: "My Slips" };

export default async function MySlipsPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = orgToday();
  const currentFy = financialYear(today);

  const [{ data: slips }, { data: structure }] = await Promise.all([
    supabase
      .from("payslips")
      .select("id, year, month, gross, total_deductions, net_pay, paid_days, lop_days, status, published_at")
      .eq("employee_id", me.id)
      .eq("status", "published")
      .order("year", { ascending: false })
      .order("month", { ascending: false }),
    supabase.from("salary_structures").select("*").eq("employee_id", me.id).eq("is_current", true).maybeSingle(),
  ]);
  const all = slips ?? [];

  const fys = Array.from(new Set([currentFy, ...all.map((s) => fyOf(s.year, s.month))])).sort().reverse();
  const requested = typeof sp.fy === "string" ? sp.fy : undefined;
  const fy = requested && fyStartYear(requested) !== null && fys.includes(requested) ? requested : fys[0];

  const inFy = all.filter((s) => fyOf(s.year, s.month) === fy);
  const bySlot = new Map(inFy.map((s) => [ym(s.year, s.month), s]));
  const ytd = inFy.reduce(
    (a, s) => ({ gross: a.gross + toNum(s.gross), deductions: a.deductions + toNum(s.total_deductions), net: a.net + toNum(s.net_pay) }),
    { gross: 0, deductions: 0, net: 0 },
  );
  const thisMonth = today.slice(0, 7);

  return (
    <div>
      <PageHeader
        title="My Slips"
        description="Your monthly payslips and year-to-date earnings"
        breadcrumbs={[{ label: "Payroll", href: "/payroll/slips" }, { label: "My Slips" }]}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium text-slate-500">Financial year</span>
        {fys.map((f) => (
          <Link
            key={f}
            href={`/payroll/slips?fy=${f}`}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
              f === fy ? cn(PAYROLL_THEME.solid, "text-white shadow-sm") : cn(PAYROLL_THEME.pill, PAYROLL_THEME.text, "hover:brightness-95"),
            )}
          >
            FY {f}
          </Link>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="YTD gross earnings" value={formatCurrency(ytd.gross)} icon={IndianRupee} tone={PAYROLL_THEME.stat} hint={`FY ${fy}`} />
        <StatCard label="YTD deductions" value={formatCurrency(ytd.deductions)} icon={MinusCircle} tone="bg-red-50 text-red-600" />
        <StatCard label="YTD net pay" value={formatCurrency(ytd.net)} icon={Wallet} tone="bg-emerald-50 text-emerald-600" />
        <StatCard
          label="Annual CTC"
          value={structure ? formatCurrency(structure.annual_ctc) : "—"}
          icon={FileText}
          tone="bg-slate-100 text-slate-600"
          hint={structure ? `Monthly gross ≈ ${formatCurrency(annualGross(structure) / 12)}` : "Not set up yet"}
        />
      </div>

      <Card>
        <CardHeader title={`Payslips — FY ${fy}`} description={`${inFy.length} of 12 months published`} />
        <CardBody>
          {all.length === 0 && (
            <EmptyState
              icon={FileText}
              title="No payslips yet"
              description="Your payslips will appear here once HR publishes payroll for a month."
              className="py-6"
            />
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {fyMonths(fy).map(({ year, month }) => {
              const key = ym(year, month);
              const s = bySlot.get(key);
              const future = key > thisMonth;
              if (s) {
                return (
                  <Link
                    key={key}
                    href={`/payroll/slips/${s.id}`}
                    className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-[#78a83a] hover:shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", PAYROLL_THEME.pill, PAYROLL_THEME.text)}>
                        {MONTHS_SHORT[month - 1]} {year}
                      </span>
                      <StatusBadge status={s.status} />
                    </div>
                    <p className="mt-3 text-xs text-slate-500">Net pay</p>
                    <p className="text-xl font-semibold text-slate-900">{formatCurrency(s.net_pay)}</p>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
                      <span>Gross {formatCurrency(s.gross)}</span>
                      <span>
                        {toNum(s.paid_days)} paid{toNum(s.lop_days) > 0 && <span className="text-red-600"> · {toNum(s.lop_days)} LOP</span>}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-medium text-primary-600 group-hover:underline">View payslip →</p>
                  </Link>
                );
              }
              return (
                <div key={key} className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                      {MONTHS_SHORT[month - 1]} {year}
                    </span>
                    <CalendarClock className="h-4 w-4 text-slate-300" />
                  </div>
                  <p className="mt-6 text-sm font-medium text-slate-400">{future ? "Upcoming" : "Not processed"}</p>
                  <p className="text-xs text-slate-400">{future ? `Payroll for ${formatDate(`${key}-01`, "MMMM")}` : "No payslip published"}</p>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
