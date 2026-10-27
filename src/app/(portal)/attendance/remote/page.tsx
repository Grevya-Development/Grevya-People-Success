import Link from "next/link";
import { format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { CalendarClock, CalendarDays, Clock, Laptop, History } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { orgToday } from "@/lib/utils";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, StatCard, buttonClass } from "@/components/ui";
import { RemoteCapture } from "./_components/remote-capture";
import { SessionCard } from "./_components/session-card";
import { formatMinutes, sessionMinutes, signPhotos, requestTime } from "./_lib";

export const metadata = { title: "Remote Check-In" };

export default async function RemoteCheckInPage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const today = orgToday();
  const todayDate = parseISO(today);
  const monthStart = format(startOfMonth(todayDate), "yyyy-MM-dd");
  const weekStart = format(startOfWeek(todayDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const from = weekStart < monthStart ? weekStart : monthStart;

  const [{ data: sessions }, { data: open }] = await Promise.all([
    supabase.from("remote_work_sessions").select("*").eq("employee_id", me.id).gte("work_date", from).order("check_in_at", { ascending: false }),
    supabase.from("remote_work_sessions").select("*").eq("employee_id", me.id).is("check_out_at", null).maybeSingle(),
  ]);

  const all = sessions ?? [];
  const now = requestTime();
  const sum = (rows: typeof all) => rows.reduce((t, s) => t + sessionMinutes(s, now), 0);
  const todays = all.filter((s) => s.work_date === today);
  const week = all.filter((s) => s.work_date >= weekStart);
  const month = all.filter((s) => s.work_date >= monthStart);
  const monthDays = new Set(month.map((s) => s.work_date)).size;

  const photos = await signPhotos(todays.flatMap((s) => [s.check_in_photo, s.check_out_photo]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Remote Check-In"
        description="Working away from the office? Check in and out with a selfie — time, date, location and device are recorded automatically."
        breadcrumbs={[{ label: "Attendance", href: "/attendance" }, { label: "Remote Check-In" }]}
        actions={
          <Link href="/attendance/remote/history" className={buttonClass("outline")}>
            <History className="h-4 w-4" /> My remote log
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Today" value={formatMinutes(sum(todays))} hint={`${todays.length} session${todays.length === 1 ? "" : "s"}${open ? " · in progress" : ""}`} icon={Clock} tone="bg-amber-50 text-amber-600" />
        <StatCard label="This week" value={formatMinutes(sum(week))} hint={`Since ${format(parseISO(weekStart), "dd MMM")}`} icon={CalendarClock} tone="bg-emerald-50 text-emerald-600" />
        <StatCard label="This month" value={formatMinutes(sum(month))} hint={format(todayDate, "MMMM yyyy")} icon={CalendarDays} tone="bg-sky-50 text-sky-600" />
        <StatCard label="Remote days this month" value={monthDays} hint={monthDays ? `Avg ${formatMinutes(sum(month) / monthDays)} / day` : "No remote days yet"} icon={Laptop} tone="bg-violet-50 text-violet-600" />
      </div>

      {open && open.work_date !== today && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You checked in on {format(parseISO(open.work_date), "dd MMM")} and never checked out. Check out now to close that session.
        </div>
      )}

      <RemoteCapture
        key={open ? `out-${open.id}` : "in"}
        mode={open ? "out" : "in"}
        employeeName={me.full_name ?? me.first_name}
        employeeCode={me.employee_code}
        openSince={open?.check_in_at ?? null}
      />

      <Card>
        <CardHeader title="Today's sessions" description={`Total ${formatMinutes(sum(todays))}`} />
        <CardBody>
          {todays.length === 0 ? (
            <EmptyState icon={Laptop} title="No remote sessions today" description="Take a selfie above and check in to start your day." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {todays.map((s) => (
                <SessionCard key={s.id} s={s} photos={photos} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
