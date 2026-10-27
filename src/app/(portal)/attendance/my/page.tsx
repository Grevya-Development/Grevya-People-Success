import Link from "next/link";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, orgToday } from "@/lib/utils";
import { Badge, Card, CardHeader, PageHeader, StatCard, Table, TBody, TD, TH, THead, TR, buttonClass } from "@/components/ui";
import { DOW_SHORT, addDays, dayOfWeek, formatHours, isMonthKey, istTime, longDate, monthBounds, monthLabel } from "../../leave/_lib/dates";
import { getAttendanceDays, summarize } from "../_lib/data";
import { DayStatusBadge } from "../_components/day-bits";
import { MonthNav } from "../_components/month-nav";

export const metadata = { title: "My Attendance" };

export default async function MyAttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const today = orgToday();
  const ym = typeof sp.month === "string" && isMonthKey(sp.month) && sp.month <= today.slice(0, 7) ? sp.month : today.slice(0, 7);
  const { start, end } = monthBounds(ym);
  const supabase = await createClient();
  const [{ shift, days }, { data: pendingRegs }] = await Promise.all([
    getAttendanceDays(supabase, me, start, end, today),
    supabase.from("regularization_requests").select("date").eq("employee_id", me.id).eq("status", "pending").gte("date", start).lte("date", end),
  ]);
  const pendingDates = new Set((pendingRegs ?? []).map((r) => r.date));
  const stats = summarize(days);
  const regWindowStart = addDays(today, -30);

  return (
    <div>
      <PageHeader
        title="My Attendance"
        description={`Shift ${shift.shift_start} – ${shift.shift_end} · late after ${shift.grace_minutes} min grace · full day ${shift.min_full_day_hours}h`}
        breadcrumbs={[{ label: "Attendance", href: "/attendance" }, { label: "My Attendance" }]}
        actions={<MonthNav ym={ym} basePath="/attendance/my" maxYm={today.slice(0, 7)} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Present" value={stats.present} />
        <StatCard label="WFH" value={stats.wfh} />
        <StatCard label="Absent" value={stats.absent} />
        <StatCard label="Leave" value={stats.leave} />
        <StatCard label="Holidays" value={stats.holidays} />
        <StatCard label="Late" value={stats.late} />
        <StatCard label="Avg. hours" value={stats.avgHours === null ? "—" : formatHours(stats.avgHours)} />
      </div>

      <Card>
        <CardHeader title={monthLabel(ym)} description="Status is derived from punches, approved leave, holidays and weekends." />
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Status</TH>
              <TH>Check-in</TH>
              <TH>Check-out</TH>
              <TH className="text-right">Hours</TH>
              <TH>Flags</TH>
              <TH className="text-right">Action</TH>
            </TR>
          </THead>
          <TBody>
            {days.map((d) => {
              const short = d.hours !== null && d.record?.check_out && d.hours < shift.min_full_day_hours;
              const canRegularize = d.needsRegularization && d.date >= regWindowStart && d.date < today && !pendingDates.has(d.date);
              return (
                <TR key={d.date} className={cn(d.weekend && "bg-slate-50/60", d.date === today && "bg-[#f8ebc8]/30", d.future && "opacity-60")}>
                  <TD className="whitespace-nowrap">
                    <span className="font-medium text-slate-800">{longDate(d.date)}</span>
                    <span className="ml-2 text-xs text-slate-400">{DOW_SHORT[dayOfWeek(d.date)]}</span>
                  </TD>
                  <TD>
                    <DayStatusBadge day={d} />
                  </TD>
                  <TD className="whitespace-nowrap">{istTime(d.record?.check_in)}</TD>
                  <TD className="whitespace-nowrap">{istTime(d.record?.check_out)}</TD>
                  <TD className="text-right font-medium whitespace-nowrap">{formatHours(d.hours)}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {d.late && <Badge tone="yellow">Late</Badge>}
                      {short && <Badge tone="orange">Short hours</Badge>}
                      {d.record && d.record.check_in && !d.record.check_out && d.date < today && <Badge tone="red">Missed punch-out</Badge>}
                      {d.record?.source === "regularization" && <Badge tone="teal">Regularized</Badge>}
                      {pendingDates.has(d.date) && <Badge tone="blue">Regularization pending</Badge>}
                    </div>
                  </TD>
                  <TD className="text-right">
                    {canRegularize ? (
                      <Link href={`/attendance/regularization?date=${d.date}`} className={buttonClass("outline", "sm")}>
                        Regularize
                      </Link>
                    ) : null}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
