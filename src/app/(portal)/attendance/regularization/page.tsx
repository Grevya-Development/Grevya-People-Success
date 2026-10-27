import { ClipboardList } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { humanize, orgToday } from "@/lib/utils";
import { Card, CardBody, CardHeader, EmptyState, Field, FormGrid, Input, PageHeader, Select, StatusBadge, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ActionButton } from "@/components/ui/action-button";
import { addDays, isISODate, istHHmm, istTime, longDate, DOW_SHORT, dayOfWeek } from "../../leave/_lib/dates";
import { one } from "../../leave/_lib/data";
import { cancelRegularization, submitRegularization } from "../actions";
import { getShiftSettings } from "../_lib/data";

export const metadata = { title: "My Regularization" };

const TYPES = [
  { v: "missed_punch", l: "Missed punch" },
  { v: "wrong_punch", l: "Wrong punch" },
  { v: "wfh", l: "Work from home" },
  { v: "on_duty", l: "On duty (client visit / travel)" },
];

export default async function RegularizationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const today = orgToday();
  const minDate = addDays(today, -30);
  const prefill = typeof sp.date === "string" && isISODate(sp.date) && sp.date >= minDate && sp.date <= today ? sp.date : "";

  const supabase = await createClient();
  const [shift, { data: record }, { data: rows }] = await Promise.all([
    getShiftSettings(supabase),
    prefill
      ? supabase.from("attendance_records").select("check_in, check_out").eq("employee_id", me.id).eq("date", prefill).maybeSingle()
      : Promise.resolve({ data: null as { check_in: string | null; check_out: string | null } | null }),
    supabase
      .from("regularization_requests")
      .select("*, approver:employees!regularization_requests_approver_id_fkey(full_name)")
      .eq("employee_id", me.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const defaultIn = istHHmm(record?.check_in) || shift.shift_start;
  const defaultOut = istHHmm(record?.check_out) || shift.shift_end;
  const pending = rows?.filter((r) => r.status === "pending").length ?? 0;

  return (
    <div>
      <PageHeader
        title="My Regularization"
        description="Fix missed or wrong punches, or record WFH / on-duty days from the last 30 days."
        breadcrumbs={[{ label: "Attendance", href: "/attendance" }, { label: "My Regularization" }]}
      />
      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="h-fit overflow-hidden">
          <div className="h-1.5 bg-[#e3a91a]" />
          <CardHeader title="New request" description={prefill ? `For ${DOW_SHORT[dayOfWeek(prefill)]}, ${longDate(prefill)}` : "Goes to your manager for approval"} />
          <CardBody>
            <ActionForm action={submitRegularization} successMessage="Regularization submitted">
              <div className="space-y-4">
                <Field label="Date" htmlFor="date" required hint={`Between ${longDate(minDate)} and today`}>
                  <Input id="date" name="date" type="date" min={minDate} max={today} defaultValue={prefill} required />
                </Field>
                <Field label="Request type" htmlFor="request_type" required>
                  <Select id="request_type" name="request_type" defaultValue="missed_punch" required>
                    {TYPES.map((t) => (
                      <option key={t.v} value={t.v}>
                        {t.l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <FormGrid className="grid-cols-2">
                  <Field label="Check-in" htmlFor="check_in" required>
                    <Input id="check_in" name="check_in" type="time" defaultValue={defaultIn} required />
                  </Field>
                  <Field label="Check-out" htmlFor="check_out" required>
                    <Input id="check_out" name="check_out" type="time" defaultValue={defaultOut} required />
                  </Field>
                </FormGrid>
                {record?.check_in && (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    Recorded punches: in {istTime(record.check_in)}, out {istTime(record.check_out)}
                  </p>
                )}
                <Field label="Reason" htmlFor="reason" required>
                  <Textarea id="reason" name="reason" rows={3} maxLength={500} placeholder="e.g. Forgot to punch out after the client call" required />
                </Field>
                <div className="flex justify-end">
                  <SubmitButton>Submit request</SubmitButton>
                </div>
              </div>
            </ActionForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="My requests" description={`${rows?.length ?? 0} total · ${pending} pending`} />
          {rows?.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Type</TH>
                  <TH>Timings</TH>
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
                        <span className="font-medium text-slate-800">{longDate(r.date)}</span>
                        <span className="block text-xs text-slate-400">Applied {longDate(r.created_at.slice(0, 10))}</span>
                      </TD>
                      <TD className="whitespace-nowrap">{humanize(r.request_type)}</TD>
                      <TD className="whitespace-nowrap text-xs">
                        {istTime(r.check_in)} – {istTime(r.check_out)}
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
                          <ActionButton action={cancelRegularization} fields={{ id: r.id }} confirm="Cancel this regularization request?" variant="danger">
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
            <EmptyState icon={ClipboardList} title="No regularization requests" description="Missed a punch? Pick the date on the left and submit a request." />
          )}
        </Card>
      </div>
    </div>
  );
}
