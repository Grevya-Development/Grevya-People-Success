import { CalendarClock, CheckCircle2, Users } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { LinkTabs } from "@/components/ui/link-tabs";
import { ActionButton } from "@/components/ui/action-button";
import { decideLeaves } from "../actions";
import { one } from "../_lib/data";
import { dateRange, fmtNum, longDate, shortDay } from "../_lib/dates";
import { BulkSelectList } from "../_components/bulk-select";
import { EmployeeCell, LeaveTypeLabel } from "../_components/shared";

export const metadata = { title: "Leave Approvals" };

type Emp = { id: string; full_name: string | null; employee_code: string; avatar_url: string | null; manager_id: string | null };
type LType = { name: string; code: string; color: string; is_paid: boolean };

export default async function LeaveApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireManager();
  const sp = await searchParams;
  const tab = sp.tab === "history" ? "history" : "pending";
  const supabase = await createClient();

  const { count: pendingCount } = await supabase
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .neq("employee_id", me.id);

  return (
    <div>
      <PageHeader
        title="Leave Approvals"
        description="Review leave requests from your team."
        breadcrumbs={[{ label: "Leave", href: "/leave/apply" }, { label: "Leave Approvals" }]}
      />
      <LinkTabs
        tabs={[
          { label: "Pending", href: "/leave/approvals", count: pendingCount ?? 0 },
          { label: "History", href: "/leave/approvals?tab=history" },
        ]}
      />
      {tab === "pending" ? <Pending meId={me.id} /> : <History meId={me.id} />}
    </div>
  );
}

async function Pending({ meId }: { meId: string }) {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("leave_requests")
    .select(
      "*, type:leave_types(name, code, color, is_paid), employee:employees!leave_requests_employee_id_fkey(id, full_name, employee_code, avatar_url, manager_id)",
    )
    .eq("status", "pending")
    .neq("employee_id", meId)
    .order("start_date")
    .limit(200);

  if (!rows?.length) {
    return (
      <Card>
        <EmptyState icon={CheckCircle2} title="All caught up" description="There are no leave requests waiting for your approval." />
      </Card>
    );
  }

  const empIds = [...new Set(rows.map((r) => r.employee_id))];
  const years = [...new Set(rows.map((r) => Number(r.start_date.slice(0, 4))))];
  const minStart = rows.reduce((m, r) => (r.start_date < m ? r.start_date : m), rows[0].start_date);
  const maxEnd = rows.reduce((m, r) => (r.end_date > m ? r.end_date : m), rows[0].end_date);

  const [{ data: balances }, { data: others }] = await Promise.all([
    supabase.from("leave_balances").select("employee_id, leave_type_id, year, allocated, used").in("employee_id", empIds).in("year", years),
    supabase
      .from("leave_requests")
      .select("id, employee_id, start_date, end_date, status, employee:employees!leave_requests_employee_id_fkey(full_name, manager_id)")
      .in("status", ["pending", "approved"])
      .lte("start_date", maxEnd)
      .gte("end_date", minStart)
      .limit(1000),
  ]);

  const items = rows.map((r) => {
    const emp = one(r.employee as Emp | Emp[] | null);
    const t = one(r.type as LType | LType[] | null);
    const bal = balances?.find((b) => b.employee_id === r.employee_id && b.leave_type_id === r.leave_type_id && b.year === Number(r.start_date.slice(0, 4)));
    const available = Number(bal?.allocated ?? 0) - Number(bal?.used ?? 0);
    const short = !!t?.is_paid && Number(r.days) > available;
    const overlapping = (others ?? []).filter((o) => {
      const oe = one(o.employee as { full_name: string | null; manager_id: string | null } | null);
      return o.employee_id !== r.employee_id && o.start_date <= r.end_date && o.end_date >= r.start_date && !!emp && oe?.manager_id === emp.manager_id;
    });

    return {
      id: r.id,
      node: (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto] lg:items-start">
          <div className="space-y-2">
            <EmployeeCell name={emp?.full_name} code={emp?.employee_code} avatar={emp?.avatar_url} size="md" />
            <p className="text-xs text-slate-400">Applied {longDate(r.created_at)}</p>
          </div>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {t && <LeaveTypeLabel name={t.name} color={t.color} />}
              <span className="text-sm font-semibold text-slate-800">{dateRange(r.start_date, r.end_date)}</span>
              <Badge tone="orange">
                {fmtNum(r.days)} day{Number(r.days) === 1 ? "" : "s"}
                {r.half_day ? ` · ${r.half_day_session === "second" ? "2nd" : "1st"} half` : ""}
              </Badge>
            </div>
            <p className="text-sm text-slate-600">{r.reason}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className={short ? "font-medium text-red-600" : "text-slate-500"}>
                {t?.is_paid ? (
                  <>
                    Balance: <b>{fmtNum(available)}</b> available{short ? " — insufficient" : ""}
                  </>
                ) : (
                  "Unpaid leave"
                )}
              </span>
              {overlapping.length > 0 ? (
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <Users className="h-3.5 w-3.5" />
                  Also off:{" "}
                  {overlapping
                    .slice(0, 4)
                    .map((o) => {
                      const oe = one(o.employee as { full_name: string | null } | null);
                      return `${oe?.full_name ?? "Someone"} (${o.start_date === o.end_date ? shortDay(o.start_date) : `${shortDay(o.start_date)}–${shortDay(o.end_date)}`}${o.status === "pending" ? ", pending" : ""})`;
                    })
                    .join(", ")}
                  {overlapping.length > 4 ? ` +${overlapping.length - 4} more` : ""}
                </span>
              ) : (
                <span className="text-slate-400">No team overlap</span>
              )}
            </div>
          </div>
          <div className="flex gap-2 lg:justify-end">
            <ActionButton action={decideLeaves} fields={{ id: r.id, decision: "approve" }} prompt="Remarks (optional)" variant="success" successMessage="Leave approved">
              Approve
            </ActionButton>
            <ActionButton action={decideLeaves} fields={{ id: r.id, decision: "reject" }} prompt="Reason for rejection" promptRequired variant="danger" successMessage="Leave rejected">
              Reject
            </ActionButton>
          </div>
        </div>
      ),
    };
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Pending requests" description={`${rows.length} awaiting action · oldest start date first`} />
      <BulkSelectList items={items} action={decideLeaves} noun="leave request" />
    </Card>
  );
}

async function History({ meId }: { meId: string }) {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("leave_requests")
    .select(
      "*, type:leave_types(name, code, color), employee:employees!leave_requests_employee_id_fkey(full_name, employee_code, avatar_url), approver:employees!leave_requests_approver_id_fkey(full_name)",
    )
    .in("status", ["approved", "rejected"])
    .neq("employee_id", meId)
    .not("actioned_at", "is", null)
    .order("actioned_at", { ascending: false })
    .limit(100);

  return (
    <Card>
      <CardHeader title="Actioned requests" description="The 100 most recent decisions" />
      {rows?.length ? (
        <Table>
          <THead>
            <TR>
              <TH>Employee</TH>
              <TH>Leave type</TH>
              <TH>Dates</TH>
              <TH className="text-right">Days</TH>
              <TH>Status</TH>
              <TH>Actioned</TH>
              <TH>Remarks</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => {
              const emp = one(r.employee as Emp | null);
              const t = one(r.type as LType | null);
              const approver = one(r.approver as { full_name: string | null } | null);
              return (
                <TR key={r.id}>
                  <TD>
                    <EmployeeCell name={emp?.full_name} code={emp?.employee_code} avatar={emp?.avatar_url} />
                  </TD>
                  <TD>{t ? <LeaveTypeLabel name={t.name} color={t.color} /> : "—"}</TD>
                  <TD className="whitespace-nowrap">{dateRange(r.start_date, r.end_date)}</TD>
                  <TD className="text-right">{fmtNum(r.days)}</TD>
                  <TD>
                    <StatusBadge status={r.status} />
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-slate-500">
                    {longDate(r.actioned_at)}
                    {approver?.full_name && <span className="block text-slate-400">by {approver.full_name}</span>}
                  </TD>
                  <TD className="max-w-[16rem] text-xs text-slate-500">{r.approver_remarks || "—"}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      ) : (
        <EmptyState icon={CalendarClock} title="No history yet" description="Approved and rejected requests will appear here." />
      )}
    </Card>
  );
}
