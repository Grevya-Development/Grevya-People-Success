import Link from "next/link";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { orgToday } from "@/lib/utils";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { addDays, formatHours, hoursBetween, isISODate, isWeekend, istTime, longDate, shortDay } from "../../leave/_lib/dates";
import { getTeam, one } from "../../leave/_lib/data";
import { AutoSubmitInput } from "../../leave/_components/auto-submit";
import { EmployeeCell } from "../../leave/_components/shared";
import { getShiftSettings } from "../_lib/data";
import { isLate } from "../_lib/shift";

export const metadata = { title: "Team Attendance Status" };

type Row = {
  key: "present" | "wfh" | "on_duty" | "half_day" | "leave" | "holiday" | "weekend" | "absent" | "not_in" | "upcoming";
  label: string;
};

export default async function TeamAttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireManager();
  const sp = await searchParams;
  const today = orgToday();
  const maxDate = addDays(today, 30);
  const date = typeof sp.date === "string" && isISODate(sp.date) && sp.date <= maxDate ? sp.date : today;
  const supabase = await createClient();

  const team = await getTeam(supabase, me);
  const ids = team.map((t) => t.id);

  const [shift, { data: records }, { data: leaves }, { data: holidays }] = await Promise.all([
    getShiftSettings(supabase),
    supabase.from("attendance_records").select("employee_id, check_in, check_out, status, work_mode").in("employee_id", ids).eq("date", date),
    supabase
      .from("leave_requests")
      .select("employee_id, half_day, half_day_session, type:leave_types(name, color)")
      .in("employee_id", ids)
      .eq("status", "approved")
      .lte("start_date", date)
      .gte("end_date", date),
    supabase.from("holidays").select("name, location_id").eq("date", date),
  ]);

  const rows = team.map((e) => {
    const rec = records?.find((r) => r.employee_id === e.id) ?? null;
    const leave = leaves?.find((l) => l.employee_id === e.id) ?? null;
    const holiday = holidays?.find((h) => !h.location_id || h.location_id === e.location_id) ?? null;
    let status: Row;
    if (rec) status = { key: rec.status as Row["key"], label: rec.status === "wfh" ? "WFH" : "" };
    else if (leave) status = { key: "leave", label: "On leave" };
    else if (holiday) status = { key: "holiday", label: "Holiday" };
    else if (isWeekend(date)) status = { key: "weekend", label: "Weekend" };
    else if (date < today) status = { key: "absent", label: "Absent" };
    else if (date === today) status = { key: "not_in", label: "Not checked in" };
    else status = { key: "upcoming", label: "—" };
    const lt = leave ? one(leave.type as { name: string; color: string } | null) : null;
    return { e, rec, leave, lt, holiday, status, late: !!rec && rec.status !== "wfh" && isLate(rec.check_in, shift) };
  });

  const count = (k: Row["key"][]) => rows.filter((r) => k.includes(r.status.key)).length;
  const summary = {
    present: count(["present", "on_duty", "half_day"]),
    wfh: count(["wfh"]),
    leave: rows.filter((r) => r.leave).length,
    absent: count(["absent", "not_in"]),
    late: rows.filter((r) => r.late).length,
  };

  return (
    <div>
      <PageHeader
        title="Team Attendance Status"
        description={`${me.isHR ? "All employees" : "Your direct reports"} · ${shortDay(date)}${date === today ? " (today)" : ""}`}
        breadcrumbs={[{ label: "Attendance", href: "/attendance" }, { label: "Team Attendance Status" }]}
        actions={
          <form method="get" className="flex items-center gap-1">
            <Link href={`/attendance/team?date=${addDays(date, -1)}`} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-800" aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <AutoSubmitInput type="date" name="date" defaultValue={date} max={maxDate} className="w-40" aria-label="Date" />
            <Link href={`/attendance/team?date=${addDays(date, 1)}`} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-800" aria-label="Next day">
              <ChevronRight className="h-4 w-4" />
            </Link>
            {date !== today && (
              <Link href="/attendance/team" className="ml-1 text-xs font-medium text-primary-600 hover:underline">
                Today
              </Link>
            )}
          </form>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Team size" value={team.length} icon={Users} tone="bg-[#f8ebc8] text-[#a87a0c]" />
        <StatCard label="Present" value={summary.present} tone="bg-emerald-50 text-emerald-600" />
        <StatCard label="WFH" value={summary.wfh} />
        <StatCard label="On leave" value={summary.leave} />
        <StatCard label={date === today ? "Not in / absent" : "Absent"} value={summary.absent} />
        <StatCard label="Late" value={summary.late} hint={`after ${shift.shift_start} + ${shift.grace_minutes}m`} />
      </div>

      <Card>
        <CardHeader title={longDate(date)} description={holidays?.length ? `Holiday: ${holidays.map((h) => h.name).join(", ")}` : isWeekend(date) ? "Weekend" : undefined} />
        {rows.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Employee</TH>
                <TH>Status</TH>
                <TH>Check-in</TH>
                <TH>Check-out</TH>
                <TH className="text-right">Hours</TH>
                <TH>Mode / notes</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ e, rec, lt, leave, status, late }) => (
                <TR key={e.id}>
                  <TD>
                    <EmployeeCell name={e.full_name} code={e.employee_code} avatar={e.avatar_url} sub={e.designation} />
                  </TD>
                  <TD>
                    <div className="flex flex-wrap items-center gap-1">
                      {status.key === "not_in" ? (
                        <Badge tone="gray">Not checked in</Badge>
                      ) : status.key === "upcoming" ? (
                        <span className="text-xs text-slate-300">—</span>
                      ) : status.key === "weekend" ? (
                        <Badge tone="gray">Weekend</Badge>
                      ) : (
                        <StatusBadge status={status.key} label={status.label || undefined} />
                      )}
                      {late && <Badge tone="yellow">Late</Badge>}
                      {leave && rec && <Badge tone="orange">On leave{leave.half_day ? " (half)" : ""}</Badge>}
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap">{istTime(rec?.check_in)}</TD>
                  <TD className="whitespace-nowrap">{istTime(rec?.check_out)}</TD>
                  <TD className="text-right whitespace-nowrap">{formatHours(rec ? hoursBetween(rec.check_in, rec.check_out) : null)}</TD>
                  <TD className="text-xs text-slate-500">
                    {rec ? (rec.work_mode === "remote" ? "Remote" : "Office") : null}
                    {lt && (
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: lt.color }} />
                        {lt.name}
                        {leave?.half_day ? ` · ${leave.half_day_session === "second" ? "2nd" : "1st"} half` : ""}
                      </span>
                    )}
                    {!rec && !lt && "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={Users} title="No team members" description="You don't have any direct reports yet." />
        )}
      </Card>
    </div>
  );
}
