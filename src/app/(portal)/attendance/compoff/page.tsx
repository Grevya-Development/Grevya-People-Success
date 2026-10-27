import Link from "next/link";
import { Plane } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { orgToday } from "@/lib/utils";
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select, StatusBadge, Table, TBody, TD, TH, THead, TR, Textarea, buttonClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ActionButton } from "@/components/ui/action-button";
import { addDays, fmtNum, formatHours, hoursBetween, isWeekend, longDate, shortDay } from "../../leave/_lib/dates";
import { getBalances, getHolidays, one } from "../../leave/_lib/data";
import { BalanceCard } from "../../leave/_components/shared";
import { applyCompoff, cancelCompoff } from "../actions";

export const metadata = { title: "Apply Compoff" };

export default async function CompoffPage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const today = orgToday();
  const minDate = addDays(today, -60);
  const year = Number(today.slice(0, 4));

  const [{ data: compType }, { data: rows }, { data: worked }, holidays] = await Promise.all([
    supabase.from("leave_types").select("*").eq("code", "COMP").maybeSingle(),
    supabase
      .from("compoff_requests")
      .select("*, approver:employees!compoff_requests_approver_id_fkey(full_name)")
      .eq("employee_id", me.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("attendance_records").select("date, check_in, check_out, status").eq("employee_id", me.id).gte("date", minDate).lte("date", today).order("date", { ascending: false }),
    getHolidays(supabase, minDate, today, me.location_id),
  ]);
  const balance = compType ? (await getBalances(supabase, me.id, year, [compType]))[0] : null;

  const holidayMap = new Map(holidays.map((h) => [h.date, h.name]));
  const claimed = new Set((rows ?? []).filter((r) => r.status === "pending" || r.status === "approved").map((r) => r.worked_date));
  const eligible = (worked ?? []).filter((w) => w.check_in && (isWeekend(w.date) || holidayMap.has(w.date)) && !claimed.has(w.date));

  return (
    <div>
      <PageHeader
        title="Apply Compoff"
        description="Worked on a weekend or holiday? Claim compensatory leave within 60 days."
        breadcrumbs={[{ label: "Attendance", href: "/attendance" }, { label: "Apply Compoff" }]}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-6">
          {balance ? (
            <BalanceCard b={balance} />
          ) : (
            <Card>
              <CardBody className="text-xs text-slate-500">The Comp-off leave type (code COMP) isn&apos;t configured yet, so approved comp-offs won&apos;t add to a leave balance. Please contact HR.</CardBody>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="h-1.5 bg-[#e3a91a]" />
            <CardHeader title="Claim comp-off" />
            <CardBody>
              <ActionForm action={applyCompoff} successMessage="Comp-off requested">
                <div className="space-y-4">
                  <Field label="Date worked" htmlFor="worked_date" required hint="Must be a weekend or holiday in the last 60 days">
                    <Input id="worked_date" name="worked_date" type="date" min={minDate} max={today} required />
                  </Field>
                  <Field label="Days" htmlFor="days" required>
                    <Select id="days" name="days" defaultValue="1">
                      <option value="1">Full day (1)</option>
                      <option value="0.5">Half day (0.5)</option>
                    </Select>
                  </Field>
                  <Field label="Reason / work done" htmlFor="reason" required>
                    <Textarea id="reason" name="reason" rows={3} maxLength={500} placeholder="e.g. Production release support" required />
                  </Field>
                  <div className="flex justify-end">
                    <SubmitButton>Submit</SubmitButton>
                  </div>
                </div>
              </ActionForm>
              {eligible.length > 0 && (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <p className="mb-2 text-xs font-medium text-slate-600">Days you worked that qualify</p>
                  <ul className="space-y-1.5">
                    {eligible.slice(0, 6).map((w) => (
                      <li key={w.date} className="flex items-center justify-between gap-2 rounded-lg bg-[#f8ebc8]/50 px-3 py-1.5 text-xs">
                        <span className="font-medium text-slate-700">{shortDay(w.date)}</span>
                        <span className="text-slate-500">{holidayMap.get(w.date) ?? "Weekend"}</span>
                        <span className="text-slate-500">{formatHours(hoursBetween(w.check_in, w.check_out))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="My comp-off requests"
            description={`${rows?.length ?? 0} request(s)`}
            action={
              balance && balance.available > 0 ? (
                <Link href="/leave/apply" className={buttonClass("secondary", "sm")}>
                  Use comp-off
                </Link>
              ) : undefined
            }
          />
          {rows?.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Worked on</TH>
                  <TH className="text-right">Days</TH>
                  <TH>Reason</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const approver = one(r.approver as { full_name: string | null } | null);
                  return (
                    <TR key={r.id}>
                      <TD className="whitespace-nowrap">
                        <span className="font-medium text-slate-800">{longDate(r.worked_date)}</span>
                        <span className="block text-xs text-slate-400">
                          {holidayMap.get(r.worked_date) ?? (isWeekend(r.worked_date) ? "Weekend" : "")}
                          {" · "}Applied {longDate(r.created_at)}
                        </span>
                      </TD>
                      <TD className="text-right">
                        <Badge tone="yellow">{fmtNum(r.days)}</Badge>
                      </TD>
                      <TD className="max-w-[16rem]">
                        <p className="line-clamp-2 text-slate-600">{r.reason}</p>
                      </TD>
                      <TD>
                        <StatusBadge status={r.status} />
                        {r.approver_remarks && <p className="mt-1 max-w-[12rem] text-xs text-slate-500">“{r.approver_remarks}”</p>}
                        {approver?.full_name && r.status !== "pending" && r.status !== "cancelled" && <p className="text-[11px] text-slate-400">by {approver.full_name}</p>}
                      </TD>
                      <TD className="text-right">
                        {r.status === "pending" ? (
                          <ActionButton action={cancelCompoff} fields={{ id: r.id }} confirm="Cancel this comp-off request?" variant="danger">
                            Cancel
                          </ActionButton>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          ) : (
            <EmptyState icon={Plane} title="No comp-off requests" description="Requests you raise will be listed here with their approval status." />
          )}
        </Card>
      </div>
    </div>
  );
}
