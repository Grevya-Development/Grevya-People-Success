import Link from "next/link";
import { AlarmClock, CalendarCheck2, CalendarDays, CalendarRange, CalendarX2, ClipboardCheck, Clock, House, Plane, RefreshCcw, TreePalm, Users } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, orgToday } from "@/lib/utils";
import { Card, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { addDays, formatHours, istTime, monthBounds, monthLabel, shortDay } from "../leave/_lib/dates";
import { attendanceTheme, PillLink } from "../leave/_components/shared";
import { getAttendanceDays, summarize } from "./_lib/data";
import { PunchCard } from "./_components/punch-card";
import { DayStatusBadge } from "./_components/day-bits";

export const metadata = { title: "Attendance Home" };

export default async function AttendanceHomePage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const today = orgToday();
  const ym = today.slice(0, 7);
  const { start } = monthBounds(ym);
  const weekStart = addDays(today, -6);
  const from = weekStart < start ? weekStart : start;

  const [{ data: todayRecord }, { shift, days }, { count: pendingReg }, { count: pendingComp }] = await Promise.all([
    supabase.from("attendance_records").select("*").eq("employee_id", me.id).eq("date", today).maybeSingle(),
    getAttendanceDays(supabase, me, from, today, today),
    supabase.from("regularization_requests").select("id", { count: "exact", head: true }).eq("employee_id", me.id).eq("status", "pending"),
    supabase.from("compoff_requests").select("id", { count: "exact", head: true }).eq("employee_id", me.id).eq("status", "pending"),
  ]);

  const monthDays = days.filter((d) => d.date >= start);
  const stats = summarize(monthDays);
  const last7 = days.filter((d) => d.date >= weekStart).reverse();

  const links = [
    { href: "/attendance/my", label: "My Attendance", icon: <CalendarCheck2 className="h-4 w-4" /> },
    { href: "/attendance/calendar", label: "Calendar View", icon: <CalendarRange className="h-4 w-4" /> },
    { href: "/attendance/regularization", label: `My Regularization${pendingReg ? ` (${pendingReg})` : ""}`, icon: <RefreshCcw className="h-4 w-4" /> },
    { href: "/attendance/compoff", label: `Apply Compoff${pendingComp ? ` (${pendingComp})` : ""}`, icon: <Plane className="h-4 w-4" /> },
    { href: "/leave/apply", label: "Apply Leave", icon: <TreePalm className="h-4 w-4" /> },
    ...(me.isManager
      ? [
          { href: "/attendance/team", label: "Team Attendance", icon: <Users className="h-4 w-4" /> },
          { href: "/attendance/bulk-approval", label: "Bulk Approval", icon: <ClipboardCheck className="h-4 w-4" /> },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="Attendance Home"
        description={`Shift ${shift.shift_start} – ${shift.shift_end} · ${shift.grace_minutes} min grace`}
        breadcrumbs={[{ label: "Attendance", href: "/attendance" }, { label: "Attendance Home" }]}
      />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-6">
          <PunchCard today={todayRecord} />
          <Card>
            <CardHeader title="Quick links" />
            <div className="grid gap-2 p-4">
              {links.map((l) => (
                <PillLink key={l.href} href={l.href} label={l.label} theme={attendanceTheme} icon={l.icon} />
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">{monthLabel(ym)} so far</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              <StatCard label="Present" value={stats.present} icon={CalendarCheck2} tone="bg-emerald-50 text-emerald-600" />
              <StatCard label="Absent" value={stats.absent} icon={CalendarX2} tone="bg-red-50 text-red-600" hint={stats.absent ? <Link href="/attendance/my" className="text-primary-600 hover:underline">Regularize</Link> : undefined} />
              <StatCard label="On leave" value={stats.leave} icon={TreePalm} tone="bg-orange-50 text-orange-600" />
              <StatCard label="WFH" value={stats.wfh} icon={House} tone="bg-violet-50 text-violet-600" />
              <StatCard label="Holidays" value={stats.holidays} icon={CalendarDays} tone="bg-blue-50 text-blue-600" />
              <StatCard label="Avg. hours" value={stats.avgHours === null ? "—" : formatHours(stats.avgHours)} icon={Clock} tone="bg-[#f8ebc8] text-[#a87a0c]" />
              <StatCard label="Late check-ins" value={stats.late} icon={AlarmClock} tone="bg-amber-50 text-amber-600" hint={`after ${shift.shift_start} + ${shift.grace_minutes}m`} />
              <StatCard label="Working days" value={stats.workingDays} hint="so far this month" />
            </div>
          </section>

          <Card>
            <CardHeader
              title="Last 7 days"
              action={
                <Link href="/attendance/my" className="text-xs font-medium text-primary-600 hover:underline">
                  View month
                </Link>
              }
            />
            <ul className="divide-y divide-slate-100">
              {last7.map((d) => (
                <li key={d.date} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3", d.date === today && "bg-[#f8ebc8]/30")}>
                  <div className="w-28 shrink-0">
                    <p className="text-sm font-medium text-slate-800">{shortDay(d.date)}</p>
                    {d.date === today && <p className="text-[11px] font-medium text-[#a87a0c]">Today</p>}
                  </div>
                  <div className="min-w-[7rem] flex-1">
                    <DayStatusBadge day={d} />
                    {d.late && <span className="ml-2 text-[11px] font-medium text-amber-600">Late</span>}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>
                      In <b className="text-slate-700">{istTime(d.record?.check_in)}</b>
                    </span>
                    <span>
                      Out <b className="text-slate-700">{istTime(d.record?.check_out)}</b>
                    </span>
                    <span className="w-16 text-right font-medium text-slate-700">{formatHours(d.hours)}</span>
                  </div>
                  {d.needsRegularization && d.date !== today && (
                    <Link href={`/attendance/regularization?date=${d.date}`} className="text-xs font-medium text-primary-600 hover:underline">
                      Regularize
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
