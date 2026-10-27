import Link from "next/link";
import { AlertTriangle, Banknote, CalendarCheck, Calculator, Send, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, CardHeader, EmptyState, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { Dialog } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { publishPayroll } from "../actions";
import { PeriodPicker } from "./period-picker";
import { computePayroll, isRunnableMonth, type PayrollPreview } from "../../_lib/run";
import { PAYROLL_THEME, monthLabel } from "../../_lib/payroll";

export async function RunTab({ year, month, period, today }: { year: number; month: number; period: string; today: string }) {
  const supabase = await createClient();
  const runnable = isRunnableMonth(year, month, today);
  let preview: PayrollPreview | null = null;
  let error: string | null = null;
  if (runnable) {
    try {
      preview = await computePayroll(supabase, year, month, today);
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not compute payroll";
    }
  }
  const label = monthLabel(year, month);
  const isCurrentMonth = period === today.slice(0, 7);

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PeriodPicker tab="run" period={period} max={today.slice(0, 7)} label="Preview" />
          {preview && preview.rows.length > 0 && (
            <ActionButton
              action={publishPayroll}
              fields={{ year, month }}
              variant={preview.existingCount > 0 ? "danger" : "success"}
              size="md"
              confirm={
                preview.existingCount > 0
                  ? `Payslips already exist for ${preview.existingCount} employee(s) in ${label}. Re-run and overwrite them?`
                  : `Publish ${preview.rows.length} payslip(s) for ${label}? Employees will be notified.`
              }
            >
              <Send className="h-4 w-4" />
              {preview.existingCount > 0 ? "Re-run & overwrite" : "Publish payslips"}
            </ActionButton>
          )}
        </div>
        {isCurrentMonth && runnable && (
          <p className="mt-3 text-xs text-slate-500">
            {label} is still in progress — LOP is counted from attendance up to yesterday; today and later working days are assumed paid (unless covered by unpaid leave).
          </p>
        )}
      </Card>

      {!runnable && (
        <Card>
          <EmptyState icon={CalendarCheck} title="Month not available" description="Payroll can be run for the current month or any earlier month." />
        </Card>
      )}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      {preview && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Employees" value={preview.rows.length} icon={Users} tone={PAYROLL_THEME.stat} hint={preview.existingCount > 0 ? `${preview.existingCount} already published` : "Not yet published"} />
            <StatCard label="Gross pay" value={formatCurrency(preview.totals.gross)} icon={Banknote} tone="bg-blue-50 text-blue-600" />
            <StatCard label="Deductions" value={formatCurrency(preview.totals.deductions)} icon={Calculator} tone="bg-red-50 text-red-600" />
            <StatCard label="Net payout" value={formatCurrency(preview.totals.net)} icon={Banknote} tone="bg-emerald-50 text-emerald-600" />
          </div>

          {preview.skipped.length > 0 && (
            <div className="flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">
                  {preview.skipped.length} employee{preview.skipped.length === 1 ? "" : "s"} skipped — no salary structure effective for {label}
                </p>
                <p className="mt-0.5 text-xs">
                  {preview.skipped.slice(0, 8).map((s) => `${s.full_name} (${s.employee_code})`).join(", ")}
                  {preview.skipped.length > 8 && ` and ${preview.skipped.length - 8} more`} ·{" "}
                  <Link href="/payroll/admin?tab=structures" className="font-medium underline">
                    Set up structures
                  </Link>
                </p>
              </div>
            </div>
          )}

          <Card>
            <CardHeader title={`Preview — ${label}`} description="One row per active employee. Earnings are prorated by paid days." />
            {preview.rows.length === 0 ? (
              <EmptyState icon={Users} title="Nobody to pay" description="No active employees have a salary structure for this month." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Employee</TH>
                    <TH className="text-right">Working</TH>
                    <TH className="text-right">LOP</TH>
                    <TH className="text-right">Paid days</TH>
                    <TH className="text-right">Gross</TH>
                    <TH className="text-right">Deductions</TH>
                    <TH className="text-right">Net pay</TH>
                    <TH>Regime</TH>
                    <TH>Payslip</TH>
                    <TH />
                  </tr>
                </THead>
                <TBody>
                  {preview.rows.map((r) => (
                    <TR key={r.employee.id}>
                      <TD>
                        <p className="font-medium text-slate-800">{r.employee.full_name}</p>
                        <p className="text-xs text-slate-500">
                          {r.employee.employee_code}
                          {r.employee.department && ` · ${r.employee.department}`}
                        </p>
                      </TD>
                      <TD className="text-right tabular-nums">{r.workingDays}</TD>
                      <TD className={`text-right tabular-nums ${r.lopDays > 0 ? "font-medium text-red-600" : ""}`}>
                        {r.lopDays}
                        {r.notJoinedDays > 0 && <span className="block text-[11px] font-normal text-slate-400">+{r.notJoinedDays} pre-joining</span>}
                      </TD>
                      <TD className="text-right tabular-nums">{r.paidDays}</TD>
                      <TD className="text-right tabular-nums">{formatCurrency(r.gross)}</TD>
                      <TD className="text-right tabular-nums text-red-600">{formatCurrency(r.totalDeductions)}</TD>
                      <TD className="text-right font-semibold tabular-nums">{formatCurrency(r.netPay)}</TD>
                      <TD className="capitalize">{r.regime}</TD>
                      <TD>{r.existingStatus ? <StatusBadge status={r.existingStatus} /> : <span className="text-xs text-slate-400">New</span>}</TD>
                      <TD className="text-right">
                        <Dialog
                          title={`${r.employee.full_name} — ${label}`}
                          description={`CTC ${formatCurrency(r.annualCtc)} · ${r.paidDays}/${r.workingDays} days paid${r.vpfPercent ? ` · VPF ${r.vpfPercent}%` : ""}`}
                          trigger={
                            <Button variant="ghost" size="sm">
                              Breakup
                            </Button>
                          }
                        >
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {[
                              { title: "Earnings", lines: r.earnings, total: r.gross },
                              { title: "Deductions", lines: r.deductions, total: r.totalDeductions },
                            ].map((g) => (
                              <div key={g.title}>
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.title}</p>
                                <ul className="divide-y divide-slate-100 text-sm">
                                  {g.lines.map((l) => (
                                    <li key={l.label} className="flex justify-between gap-3 py-1.5">
                                      <span className="text-slate-600">{l.label}</span>
                                      <span className="tabular-nums">{formatCurrency(l.amount, 2)}</span>
                                    </li>
                                  ))}
                                  <li className="flex justify-between gap-3 py-1.5 font-semibold">
                                    <span>Total</span>
                                    <span className="tabular-nums">{formatCurrency(g.total, 2)}</span>
                                  </li>
                                </ul>
                              </div>
                            ))}
                          </div>
                          <p className="mt-4 rounded-lg bg-[#f3f8ec] px-3 py-2 text-right text-sm font-semibold">Net pay {formatCurrency(r.netPay, 2)}</p>
                        </Dialog>
                      </TD>
                    </TR>
                  ))}
                </TBody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 text-sm font-semibold text-slate-900">
                    <td className="px-4 py-3" colSpan={4}>
                      Total ({preview.rows.length})
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(preview.totals.gross)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(preview.totals.deductions)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(preview.totals.net)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </Table>
            )}
          </Card>
          {preview.existingCount > 0 && (
            <p className="text-right text-xs text-slate-500">
              <Link href={`/payroll/admin?tab=payslips&period=${period}`} className={buttonClass("ghost", "sm")}>
                View published payslips for {label} →
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
