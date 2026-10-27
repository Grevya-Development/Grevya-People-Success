import Link from "next/link";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, EmptyState, StatusBadge, Table, TBody, TD, TH, THead, TR, buttonClass } from "@/components/ui";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { PeriodPicker } from "./period-picker";
import { monthLabel, round2, toNum } from "../../_lib/payroll";

export async function PayslipsTab({ year, month, period, today }: { year: number; month: number; period: string; today: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payslips")
    .select("id, gross, total_deductions, net_pay, working_days, paid_days, lop_days, status, published_at, employee:employees!payslips_employee_id_fkey(full_name, employee_code)")
    .eq("year", year)
    .eq("month", month)
    .limit(1000);
  const rows = (data ?? []).sort((a, b) => (a.employee?.employee_code ?? "").localeCompare(b.employee?.employee_code ?? ""));
  const totals = rows.reduce(
    (a, r) => ({ gross: a.gross + toNum(r.gross), ded: a.ded + toNum(r.total_deductions), net: a.net + toNum(r.net_pay), lop: a.lop + toNum(r.lop_days) }),
    { gross: 0, ded: 0, net: 0, lop: 0 },
  );
  const label = monthLabel(year, month);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <PeriodPicker tab="payslips" period={period} max={today.slice(0, 7)} />
      </Card>
      <Card>
        <CardHeader
          title={`Payslips — ${label}`}
          description={rows.length ? `${rows.length} payslip${rows.length === 1 ? "" : "s"} · net payout ${formatCurrency(totals.net)}` : undefined}
          action={
            <Link href={`/payroll/admin?tab=run&period=${period}`} className={buttonClass("outline", "sm")}>
              {rows.length ? "Re-run payroll" : "Run payroll"}
            </Link>
          }
        />
        {rows.length === 0 ? (
          <EmptyState icon={FileText} title={`No payslips for ${label}`} description="Run payroll for this month to generate and publish payslips." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Employee</TH>
                <TH className="text-right">Paid / working</TH>
                <TH className="text-right">LOP</TH>
                <TH className="text-right">Gross</TH>
                <TH className="text-right">Deductions</TH>
                <TH className="text-right">Net pay</TH>
                <TH>Status</TH>
                <TH>Published</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <p className="font-medium text-slate-800">{r.employee?.full_name}</p>
                    <p className="text-xs text-slate-500">{r.employee?.employee_code}</p>
                  </TD>
                  <TD className="text-right tabular-nums">
                    {toNum(r.paid_days)} / {toNum(r.working_days)}
                  </TD>
                  <TD className={`text-right tabular-nums ${toNum(r.lop_days) > 0 ? "text-red-600" : ""}`}>{toNum(r.lop_days)}</TD>
                  <TD className="text-right tabular-nums">{formatCurrency(r.gross)}</TD>
                  <TD className="text-right tabular-nums">{formatCurrency(r.total_deductions)}</TD>
                  <TD className="text-right font-semibold tabular-nums">{formatCurrency(r.net_pay)}</TD>
                  <TD>
                    <StatusBadge status={r.status} />
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-slate-500">{r.published_at ? formatDateTime(r.published_at) : "—"}</TD>
                  <TD className="text-right">
                    <Link href={`/payroll/slips/${r.id}`} className={buttonClass("ghost", "sm")}>
                      View
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 text-sm font-semibold text-slate-900">
                <td className="px-4 py-3">Total</td>
                <td />
                <td className="px-4 py-3 text-right tabular-nums">{round2(totals.lop)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.gross)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.ded)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.net)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </Table>
        )}
      </Card>
    </div>
  );
}
