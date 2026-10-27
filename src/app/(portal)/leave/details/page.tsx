import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarX2, Plus, Users } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { orgToday } from "@/lib/utils";
import { Card, CardHeader, EmptyState, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR, Button, buttonClass, Label, Badge } from "@/components/ui";
import { LinkTabs } from "@/components/ui/link-tabs";
import { ActionButton } from "@/components/ui/action-button";
import { cancelLeave } from "../actions";
import { getBalances, getLeaveTypes, getTeam, one, type EmbeddedEmployee } from "../_lib/data";
import { dateRange, fmtNum, longDate } from "../_lib/dates";
import { BalanceCard, EmployeeCell, LeaveTypeLabel } from "../_components/shared";
import { AutoSubmitSelect } from "../_components/auto-submit";

export const metadata = { title: "Employee Leave Details" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const STATUSES = ["pending", "approved", "rejected", "cancelled"];

function param(sp: Record<string, string | string[] | undefined>, k: string) {
  const v = sp[k];
  return typeof v === "string" ? v : undefined;
}

export default async function LeaveDetailsPage({ searchParams }: { searchParams: SP }) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = orgToday();
  const thisYear = Number(today.slice(0, 4));

  const tab = param(sp, "tab") === "team" && me.isManager ? "team" : "my";
  const yearParam = Number(param(sp, "year"));
  const year = Number.isInteger(yearParam) && yearParam > 2000 && yearParam < 2100 ? yearParam : thisYear;
  const status = STATUSES.includes(param(sp, "status") ?? "") ? param(sp, "status")! : "";
  const typeFilter = param(sp, "type") ?? "";
  const empFilter = param(sp, "emp") ?? "";

  const types = await getLeaveTypes(supabase, { activeOnly: false });
  const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2];

  const filterForm = (extra?: ReactNode) => (
    <form method="get" className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-3">
      {tab === "team" && <input type="hidden" name="tab" value="team" />}
      <div className="w-28">
        <Label>Year</Label>
        <AutoSubmitSelect name="year" defaultValue={String(year)}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </AutoSubmitSelect>
      </div>
      <div className="w-36">
        <Label>Status</Label>
        <AutoSubmitSelect name="status" defaultValue={status}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </AutoSubmitSelect>
      </div>
      <div className="w-44">
        <Label>Leave type</Label>
        <AutoSubmitSelect name="type" defaultValue={typeFilter}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </AutoSubmitSelect>
      </div>
      {extra}
      <noscript>
        <Button type="submit" size="sm">
          Apply
        </Button>
      </noscript>
    </form>
  );

  return (
    <div>
      <PageHeader
        title="Employee Leave Details"
        breadcrumbs={[{ label: "Leave", href: "/leave/apply" }, { label: "Employee Leave Details" }]}
        actions={
          <Link href="/leave/apply" className={buttonClass("primary", "sm")}>
            <Plus className="h-3.5 w-3.5" /> Apply Leave
          </Link>
        }
      />
      {me.isManager && (
        <LinkTabs
          tabs={[
            { label: "My Leave", href: "/leave/details" },
            { label: "Team", href: "/leave/details?tab=team" },
          ]}
        />
      )}
      {tab === "my" ? (
        <MyLeave meId={me.id} year={year} status={status} typeFilter={typeFilter} today={today} filterForm={filterForm()} types={types} />
      ) : (
        <TeamLeave me={me} year={year} status={status} typeFilter={typeFilter} empFilter={empFilter} filterForm={filterForm} types={types} />
      )}
    </div>
  );
}

async function MyLeave({
  meId,
  year,
  status,
  typeFilter,
  today,
  filterForm,
  types,
}: {
  meId: string;
  year: number;
  status: string;
  typeFilter: string;
  today: string;
  filterForm: ReactNode;
  types: Awaited<ReturnType<typeof getLeaveTypes>>;
}) {
  const supabase = await createClient();
  let q = supabase
    .from("leave_requests")
    .select("*, type:leave_types(name, code, color), approver:employees!leave_requests_approver_id_fkey(full_name)")
    .eq("employee_id", meId)
    .gte("start_date", `${year}-01-01`)
    .lte("start_date", `${year}-12-31`)
    .order("start_date", { ascending: false });
  if (status) q = q.eq("status", status);
  if (typeFilter) q = q.eq("leave_type_id", typeFilter);
  const [{ data: rows }, balances] = await Promise.all([q, getBalances(supabase, meId, year, types.filter((t) => t.active))]);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Balance summary · {year}</h2>
        {balances.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {balances.map((b) => (
              <BalanceCard key={b.type.id} b={b} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState title="No leave types configured" className="py-8" />
          </Card>
        )}
      </section>

      <Card>
        <CardHeader title="Leave history" description={`${rows?.length ?? 0} request(s) in ${year}`} />
        {filterForm}
        {rows?.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Leave type</TH>
                <TH>Dates</TH>
                <TH className="text-right">Days</TH>
                <TH>Reason</TH>
                <TH>Applied on</TH>
                <TH>Status</TH>
                <TH>Remarks</TH>
                <TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => {
                const t = one(r.type as { name: string; code: string; color: string } | null);
                const approver = one(r.approver as { full_name: string | null } | null);
                const cancellable = r.status === "pending" || (r.status === "approved" && r.start_date > today);
                return (
                  <TR key={r.id}>
                    <TD>{t ? <LeaveTypeLabel name={t.name} color={t.color} /> : "—"}</TD>
                    <TD className="whitespace-nowrap">
                      {dateRange(r.start_date, r.end_date)}
                      {r.half_day && (
                        <Badge tone="orange" className="ml-2">
                          {r.half_day_session === "second" ? "2nd half" : "1st half"}
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-right font-medium">{fmtNum(r.days)}</TD>
                    <TD className="max-w-[16rem]">
                      <p className="line-clamp-2 text-slate-600" title={r.reason}>
                        {r.reason}
                      </p>
                    </TD>
                    <TD className="whitespace-nowrap text-slate-500">{longDate(r.created_at.slice(0, 10))}</TD>
                    <TD>
                      <StatusBadge status={r.status} />
                    </TD>
                    <TD className="max-w-[14rem] text-xs text-slate-500">
                      {r.approver_remarks ? <p className="line-clamp-2">{r.approver_remarks}</p> : null}
                      {approver?.full_name && r.status !== "pending" && r.status !== "cancelled" ? <p className="text-slate-400">by {approver.full_name}</p> : null}
                      {!r.approver_remarks && !(approver?.full_name && r.status !== "pending") ? "—" : null}
                    </TD>
                    <TD className="text-right">
                      {cancellable ? (
                        <ActionButton action={cancelLeave} fields={{ id: r.id }} confirm="Cancel this leave request?" variant="danger" successMessage="Leave cancelled">
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
          <EmptyState
            icon={CalendarX2}
            title="No leave requests found"
            description="Try a different year or filter, or apply for leave."
            action={
              <Link href="/leave/apply" className={buttonClass("secondary", "sm")}>
                Apply Leave
              </Link>
            }
          />
        )}
      </Card>
    </div>
  );
}

async function TeamLeave({
  me,
  year,
  status,
  typeFilter,
  empFilter,
  filterForm,
  types,
}: {
  me: { id: string; isHR: boolean };
  year: number;
  status: string;
  typeFilter: string;
  empFilter: string;
  filterForm: (extra?: ReactNode) => ReactNode;
  types: Awaited<ReturnType<typeof getLeaveTypes>>;
}) {
  const supabase = await createClient();
  const team = await getTeam(supabase, me);
  const teamIds = team.map((t) => t.id);
  const selected = empFilter && teamIds.includes(empFilter) ? [empFilter] : teamIds;
  const activeTypes = types.filter((t) => t.active);

  if (!team.length) {
    return (
      <Card>
        <EmptyState icon={Users} title="No team members" description="You don't have any direct reports yet." />
      </Card>
    );
  }

  let q = supabase
    .from("leave_requests")
    .select("*, type:leave_types(name, code, color), employee:employees!leave_requests_employee_id_fkey(id, full_name, employee_code, avatar_url)")
    .in("employee_id", selected)
    .gte("start_date", `${year}-01-01`)
    .lte("start_date", `${year}-12-31`)
    .order("start_date", { ascending: false })
    .limit(300);
  if (status) q = q.eq("status", status);
  if (typeFilter) q = q.eq("leave_type_id", typeFilter);
  const [{ data: rows }, { data: balances }] = await Promise.all([
    q,
    supabase.from("leave_balances").select("employee_id, leave_type_id, allocated, used").in("employee_id", selected).eq("year", year),
  ]);

  const shown = team.filter((t) => selected.includes(t.id));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={`Team balances · ${year}`} description="Available = allocated − used (pending requests not deducted)" />
        <Table>
          <THead>
            <TR>
              <TH>Employee</TH>
              {activeTypes.map((t) => (
                <TH key={t.id} className="text-center">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.code}
                  </span>
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {shown.map((e) => (
              <TR key={e.id}>
                <TD>
                  <EmployeeCell name={e.full_name} code={e.employee_code} avatar={e.avatar_url} sub={e.designation} />
                </TD>
                {activeTypes.map((t) => {
                  const b = balances?.find((x) => x.employee_id === e.id && x.leave_type_id === t.id);
                  const alloc = Number(b?.allocated ?? 0);
                  const used = Number(b?.used ?? 0);
                  return (
                    <TD key={t.id} className="text-center">
                      {t.is_paid ? (
                        <>
                          <span className="font-semibold text-slate-800">{fmtNum(alloc - used)}</span>
                          <span className="block text-[11px] text-slate-400">
                            {fmtNum(used)} / {fmtNum(alloc)} used
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold text-slate-800">{fmtNum(used)}</span>
                          <span className="block text-[11px] text-slate-400">taken</span>
                        </>
                      )}
                    </TD>
                  );
                })}
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Team leave requests" description={`${rows?.length ?? 0} request(s)`} />
        {filterForm(
          <div className="w-56">
            <Label>Employee</Label>
            <AutoSubmitSelect name="emp" defaultValue={empFilter}>
              <option value="">Everyone</option>
              {team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name} ({t.employee_code})
                </option>
              ))}
            </AutoSubmitSelect>
          </div>,
        )}
        {rows?.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Employee</TH>
                <TH>Leave type</TH>
                <TH>Dates</TH>
                <TH className="text-right">Days</TH>
                <TH>Reason</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => {
                const t = one(r.type as { name: string; code: string; color: string } | null);
                const emp = one(r.employee as EmbeddedEmployee);
                return (
                  <TR key={r.id}>
                    <TD>
                      <EmployeeCell name={emp?.full_name} code={emp?.employee_code} avatar={emp?.avatar_url} />
                    </TD>
                    <TD>{t ? <LeaveTypeLabel name={t.name} color={t.color} /> : "—"}</TD>
                    <TD className="whitespace-nowrap">
                      {dateRange(r.start_date, r.end_date)}
                      {r.half_day && (
                        <Badge tone="orange" className="ml-2">
                          Half
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-right font-medium">{fmtNum(r.days)}</TD>
                    <TD className="max-w-[16rem]">
                      <p className="line-clamp-2 text-slate-600">{r.reason}</p>
                    </TD>
                    <TD>
                      <StatusBadge status={r.status} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={CalendarX2} title="No team leave found" description="No requests match these filters." />
        )}
      </Card>
    </div>
  );
}
