import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, StatusBadge, buttonClass } from "@/components/ui";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { PrintButton } from "../../_components/print-button";
import { amountInWords, maskAccount, maskPan, monthLabel, parseLines, toNum } from "../../_lib/payroll";

export const metadata = { title: "Payslip" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Print only the payslip, whatever the surrounding shell renders. */
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 12mm; }
  body * { visibility: hidden !important; }
  #payslip, #payslip * { visibility: visible !important; }
  #payslip { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none !important; border: 0 !important; }
}`;

export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireEmployee();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();

  // RLS: the employee's own slips, or any slip for HR.
  const { data: slip } = await supabase.from("payslips").select("*").eq("id", id).maybeSingle();
  if (!slip || (slip.status !== "published" && !me.isHR)) notFound();

  const [{ data: emp }, { data: priv }] = await Promise.all([
    supabase
      .from("employees")
      .select("full_name, employee_code, date_of_joining, email, department:departments(name), designation:designations(title), location:locations(name)")
      .eq("id", slip.employee_id)
      .maybeSingle(),
    supabase.from("employee_private").select("pan_number, bank_name, bank_account, uan").eq("employee_id", slip.employee_id).maybeSingle(),
  ]);
  if (!emp) notFound();

  const earnings = parseLines(slip.earnings);
  const deductions = parseLines(slip.deductions);
  const rows = Math.max(earnings.length, deductions.length);
  const period = monthLabel(slip.year, slip.month);
  const own = slip.employee_id === me.id;

  const details: [string, string][] = [
    ["Employee name", emp.full_name ?? "—"],
    ["Employee code", emp.employee_code],
    ["Designation", emp.designation?.title ?? "—"],
    ["Department", emp.department?.name ?? "—"],
    ["Date of joining", formatDate(emp.date_of_joining)],
    ["Location", emp.location?.name ?? "—"],
    ["PAN", maskPan(priv?.pan_number)],
    ["UAN", priv?.uan || "—"],
    ["Bank", priv?.bank_name || "—"],
    ["Account no.", maskAccount(priv?.bank_account)],
  ];

  return (
    <div>
      <style>{PRINT_CSS}</style>
      <div className="no-print">
        <PageHeader
          title={`Payslip — ${period}`}
          breadcrumbs={[{ label: "Payroll", href: "/payroll/slips" }, { label: own ? "My Slips" : "Payslips", href: own ? "/payroll/slips" : "/payroll/admin?tab=payslips" }, { label: period }]}
          actions={
            <>
              <Link href={own ? "/payroll/slips" : `/payroll/admin?tab=payslips&period=${slip.year}-${String(slip.month).padStart(2, "0")}`} className={buttonClass("ghost")}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
              <PrintButton />
            </>
          }
        />
      </div>

      <Card id="payslip" className="mx-auto max-w-4xl overflow-hidden">
        {/* Letterhead */}
        <div className="flex flex-col gap-3 border-b-4 border-[#78a83a] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/grevya-logo.png" alt="Grevya" className="-my-3 -ml-3 h-20 w-auto self-start object-contain" />
          <div className="sm:text-right">
            <p className="text-base font-semibold text-slate-900">Grevya</p>
            <p className="text-xs text-slate-500">People Success · India</p>
            <p className="mt-1 text-sm font-medium text-[#4f7a1f]">Payslip for the month of {period}</p>
          </div>
        </div>

        <div className="px-5 py-5 sm:px-8">
          {/* Employee details */}
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {details.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-dashed border-slate-100 py-1">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-medium text-slate-800">{v}</dd>
              </div>
            ))}
          </dl>

          {/* Days */}
          <div className="mt-5 grid grid-cols-3 overflow-hidden rounded-lg border border-slate-200 text-center text-sm">
            {[
              ["Working days", toNum(slip.working_days)],
              ["Paid days", toNum(slip.paid_days)],
              ["LOP days", toNum(slip.lop_days)],
            ].map(([k, v], i) => (
              <div key={k} className={i ? "border-l border-slate-200 py-2.5" : "py-2.5"}>
                <p className="text-xs text-slate-500">{k}</p>
                <p className={`text-base font-semibold ${k === "LOP days" && Number(v) > 0 ? "text-red-600" : "text-slate-900"}`}>{v}</p>
              </div>
            ))}
          </div>

          {/* Earnings & deductions */}
          <div className="mt-5 overflow-x-auto thin-scroll">
            <table className="w-full min-w-[520px] border border-slate-200 text-sm">
              <thead>
                <tr className="bg-[#e2eed4] text-left text-xs font-semibold uppercase tracking-wide text-[#4f7a1f]">
                  <th className="px-3 py-2">Earnings</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="border-l border-slate-200 px-3 py-2">Deductions</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from({ length: rows }, (_, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-slate-700">{earnings[i]?.label ?? ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">{earnings[i] ? formatCurrency(earnings[i].amount, 2) : ""}</td>
                    <td className="border-l border-slate-200 px-3 py-2 text-slate-700">{deductions[i]?.label ?? ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">{deductions[i] ? formatCurrency(deductions[i].amount, 2) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                  <td className="px-3 py-2">Gross earnings</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(slip.gross, 2)}</td>
                  <td className="border-l border-slate-200 px-3 py-2">Total deductions</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(slip.total_deductions, 2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Net pay */}
          <div className="mt-5 flex flex-col gap-1 rounded-xl border border-[#78a83a]/40 bg-[#f3f8ec] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#4f7a1f]">Net pay</p>
              <p className="text-sm text-slate-600">{amountInWords(toNum(slip.net_pay))}</p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-slate-900">{formatCurrency(slip.net_pay, 2)}</p>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-400">
            <span>This is a system-generated payslip and does not require a signature.</span>
            <span className="flex items-center gap-2">
              {me.isHR && <StatusBadge status={slip.status} />}
              {slip.published_at && `Published ${formatDateTime(slip.published_at)}`}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
