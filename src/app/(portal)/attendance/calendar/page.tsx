import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { orgToday } from "@/lib/utils";
import { Card, CardBody, CardHeader, Label, PageHeader } from "@/components/ui";
import { addDays, dayOfWeek, formatHours, isMonthKey, istTime, longDate, monthBounds, monthLabel, DOW_SHORT } from "../../leave/_lib/dates";
import { getTeam } from "../../leave/_lib/data";
import { AutoSubmitSelect } from "../../leave/_components/auto-submit";
import { getAttendanceDays, summarize } from "../_lib/data";
import { CalendarGrid, type CalendarDay } from "../_components/calendar-grid";
import { MonthNav } from "../_components/month-nav";

export const metadata = { title: "Calendar View" };

export default async function AttendanceCalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const today = orgToday();
  const ym = typeof sp.month === "string" && isMonthKey(sp.month) ? sp.month : today.slice(0, 7);
  const { start, end } = monthBounds(ym);
  const supabase = await createClient();

  const team = me.isManager ? await getTeam(supabase, me) : [];
  const empParam = typeof sp.emp === "string" ? sp.emp : "";
  const member = empParam && empParam !== me.id ? team.find((t) => t.id === empParam) : undefined;

  let subject = { id: me.id, location_id: me.location_id, date_of_joining: me.date_of_joining, full_name: me.full_name ?? "", employee_code: me.employee_code, avatar_url: me.avatar_url };
  if (member) {
    const { data: emp } = await supabase.from("employees").select("id, location_id, date_of_joining, full_name, employee_code, avatar_url").eq("id", member.id).maybeSingle();
    if (emp) subject = { ...emp, full_name: emp.full_name ?? "" };
  }
  const viewingOther = subject.id !== me.id;

  const [{ days }, { data: pendingRegs }] = await Promise.all([
    getAttendanceDays(supabase, subject, start, end, today),
    supabase.from("regularization_requests").select("date").eq("employee_id", subject.id).eq("status", "pending").gte("date", start).lte("date", end),
  ]);
  const pendingDates = new Set((pendingRegs ?? []).map((r) => r.date));
  const stats = summarize(days);
  const regStart = addDays(today, -30);

  const cal: CalendarDay[] = days.map((d) => ({
    date: d.date,
    day: Number(d.date.slice(8, 10)),
    dow: dayOfWeek(d.date),
    status: d.status,
    title: `${DOW_SHORT[dayOfWeek(d.date)]}, ${longDate(d.date)}`,
    checkIn: istTime(d.record?.check_in),
    checkOut: istTime(d.record?.check_out),
    hours: formatHours(d.hours),
    late: d.late,
    note: d.holiday
      ? d.holiday.name
      : d.leave
        ? `${d.leave.type_name ?? "Leave"}${d.leave.half_day ? " (half day)" : ""}`
        : pendingDates.has(d.date)
          ? "Regularization pending approval"
          : (d.record?.notes ?? null),
    regularizeHref:
      !viewingOther && d.needsRegularization && !pendingDates.has(d.date) && d.date >= regStart && d.date < today ? `/attendance/regularization?date=${d.date}` : null,
    isToday: d.date === today,
    future: d.future,
  }));
  const initial = ym === today.slice(0, 7) ? today : start;
  const navParams: Record<string, string> = viewingOther ? { emp: subject.id } : {};

  return (
    <div>
      <PageHeader
        title="Calendar View"
        breadcrumbs={[{ label: "Attendance", href: "/attendance" }, { label: "Calendar View" }]}
        actions={<MonthNav ym={ym} basePath="/attendance/calendar" params={navParams} />}
      />
      <Card>
        <CardHeader
          title={viewingOther ? `${subject.full_name} (${subject.employee_code})` : "My calendar"}
          description={`${monthLabel(ym)} · ${stats.present} present · ${stats.wfh} WFH · ${stats.leave} leave · ${stats.absent} absent · ${stats.late} late`}
          action={
            team.length ? (
              <form method="get" className="w-56">
                <input type="hidden" name="month" value={ym} />
                <Label className="sr-only">Team member</Label>
                <AutoSubmitSelect name="emp" defaultValue={viewingOther ? subject.id : ""} aria-label="Team member">
                  <option value="">My calendar</option>
                  {team.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name} ({t.employee_code})
                    </option>
                  ))}
                </AutoSubmitSelect>
              </form>
            ) : undefined
          }
        />
        <CardBody>
          <CalendarGrid key={`${subject.id}-${ym}`} days={cal} initial={initial} />
        </CardBody>
      </Card>
    </div>
  );
}
