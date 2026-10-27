import { CheckCircle2 } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { humanize } from "@/lib/utils";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { LinkTabs } from "@/components/ui/link-tabs";
import { ActionButton } from "@/components/ui/action-button";
import { DOW_SHORT, dayOfWeek, fmtNum, formatHours, hoursBetween, istTime, isWeekend, longDate } from "../../leave/_lib/dates";
import { one, type EmbeddedEmployee } from "../../leave/_lib/data";
import { BulkSelectList } from "../../leave/_components/bulk-select";
import { EmployeeCell } from "../../leave/_components/shared";
import { decideCompoffs, decideRegularizations } from "../actions";

export const metadata = { title: "Attendance Bulk Approval" };

const REG_TONE: Record<string, "blue" | "purple" | "teal" | "orange"> = { missed_punch: "blue", wrong_punch: "orange", wfh: "purple", on_duty: "teal" };

export default async function BulkApprovalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireManager();
  const sp = await searchParams;
  const tab = sp.tab === "compoff" ? "compoff" : "regularization";
  const supabase = await createClient();

  const [{ data: regs }, { data: comps }] = await Promise.all([
    supabase
      .from("regularization_requests")
      .select("*, employee:employees!regularization_requests_employee_id_fkey(id, full_name, employee_code, avatar_url)")
      .eq("status", "pending")
      .neq("employee_id", me.id)
      .order("date")
      .limit(300),
    supabase
      .from("compoff_requests")
      .select("*, employee:employees!compoff_requests_employee_id_fkey(id, full_name, employee_code, avatar_url)")
      .eq("status", "pending")
      .neq("employee_id", me.id)
      .order("worked_date")
      .limit(300),
  ]);

  // Existing punches for the regularization dates, to show what is being corrected
  const regEmp = [...new Set((regs ?? []).map((r) => r.employee_id))];
  const regDates = [...new Set((regs ?? []).map((r) => r.date))];
  const compEmp = [...new Set((comps ?? []).map((c) => c.employee_id))];
  const compDates = [...new Set((comps ?? []).map((c) => c.worked_date))];
  const { data: punches } =
    regEmp.length || compEmp.length
      ? await supabase
          .from("attendance_records")
          .select("employee_id, date, check_in, check_out")
          .in("employee_id", [...new Set([...regEmp, ...compEmp])])
          .in("date", [...new Set([...regDates, ...compDates])])
      : { data: [] as { employee_id: string; date: string; check_in: string | null; check_out: string | null }[] };
  const punchFor = (emp: string, date: string) => punches?.find((p) => p.employee_id === emp && p.date === date) ?? null;

  const regItems = (regs ?? []).map((r) => {
    const emp = one(r.employee as EmbeddedEmployee);
    const p = punchFor(r.employee_id, r.date);
    return {
      id: r.id,
      node: (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] lg:items-start">
          <div className="space-y-1">
            <EmployeeCell name={emp?.full_name} code={emp?.employee_code} avatar={emp?.avatar_url} size="md" />
            <p className="text-xs text-slate-400">Applied {longDate(r.created_at)}</p>
          </div>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">
                {DOW_SHORT[dayOfWeek(r.date)]}, {longDate(r.date)}
              </span>
              <Badge tone={REG_TONE[r.request_type] ?? "blue"}>{r.request_type === "wfh" ? "WFH" : humanize(r.request_type)}</Badge>
            </div>
            <p className="text-xs text-slate-600">
              Requested: <b>{istTime(r.check_in)}</b> – <b>{istTime(r.check_out)}</b> ({formatHours(hoursBetween(r.check_in, r.check_out))})
              <span className="text-slate-400">
                {" · "}Recorded: {p ? `${istTime(p.check_in)} – ${istTime(p.check_out)}` : "no punches"}
              </span>
            </p>
            <p className="text-sm text-slate-600">{r.reason}</p>
          </div>
          <div className="flex gap-2 lg:justify-end">
            <ActionButton action={decideRegularizations} fields={{ id: r.id, decision: "approve" }} prompt="Remarks (optional)" variant="success" successMessage="Approved">
              Approve
            </ActionButton>
            <ActionButton action={decideRegularizations} fields={{ id: r.id, decision: "reject" }} prompt="Reason for rejection" promptRequired variant="danger" successMessage="Rejected">
              Reject
            </ActionButton>
          </div>
        </div>
      ),
    };
  });

  const compItems = (comps ?? []).map((c) => {
    const emp = one(c.employee as EmbeddedEmployee);
    const p = punchFor(c.employee_id, c.worked_date);
    return {
      id: c.id,
      node: (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] lg:items-start">
          <div className="space-y-1">
            <EmployeeCell name={emp?.full_name} code={emp?.employee_code} avatar={emp?.avatar_url} size="md" />
            <p className="text-xs text-slate-400">Applied {longDate(c.created_at)}</p>
          </div>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">
                {DOW_SHORT[dayOfWeek(c.worked_date)]}, {longDate(c.worked_date)}
              </span>
              <Badge tone="yellow">{fmtNum(c.days)} day</Badge>
              <Badge tone={isWeekend(c.worked_date) ? "gray" : "blue"}>{isWeekend(c.worked_date) ? "Weekend" : "Holiday"}</Badge>
            </div>
            <p className="text-xs text-slate-500">
              Punches that day: {p?.check_in ? `${istTime(p.check_in)} – ${istTime(p.check_out)} (${formatHours(hoursBetween(p.check_in, p.check_out))})` : <span className="font-medium text-amber-700">no attendance recorded</span>}
            </p>
            <p className="text-sm text-slate-600">{c.reason}</p>
          </div>
          <div className="flex gap-2 lg:justify-end">
            <ActionButton action={decideCompoffs} fields={{ id: c.id, decision: "approve" }} prompt="Remarks (optional)" variant="success" successMessage="Approved">
              Approve
            </ActionButton>
            <ActionButton action={decideCompoffs} fields={{ id: c.id, decision: "reject" }} prompt="Reason for rejection" promptRequired variant="danger" successMessage="Rejected">
              Reject
            </ActionButton>
          </div>
        </div>
      ),
    };
  });

  const items = tab === "compoff" ? compItems : regItems;

  return (
    <div>
      <PageHeader
        title="Attendance Bulk Approval"
        description="Approve regularization and comp-off requests from your team."
        breadcrumbs={[{ label: "Attendance", href: "/attendance" }, { label: "Attendance Bulk Approval" }]}
      />
      <LinkTabs
        tabs={[
          { label: "Regularizations", href: "/attendance/bulk-approval", count: regItems.length },
          { label: "Comp-offs", href: "/attendance/bulk-approval?tab=compoff", count: compItems.length },
        ]}
      />
      <Card className="overflow-hidden">
        <CardHeader
          title={tab === "compoff" ? "Pending comp-off requests" : "Pending regularizations"}
          description={tab === "compoff" ? "Approving credits the employee's Comp-off leave balance." : "Approving updates the employee's attendance for that day."}
        />
        {items.length ? (
          <BulkSelectList
            key={tab}
            items={items}
            action={tab === "compoff" ? decideCompoffs : decideRegularizations}
            noun={tab === "compoff" ? "comp-off request" : "regularization"}
          />
        ) : (
          <EmptyState icon={CheckCircle2} title="All caught up" description={`No pending ${tab === "compoff" ? "comp-off requests" : "regularizations"} from your team.`} />
        )}
      </Card>
    </div>
  );
}
