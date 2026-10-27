import Link from "next/link";
import { CalendarDays, Clock, Laptop, Timer, ChevronDown } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime } from "@/lib/utils";
import { Card, EmptyState, PageHeader, StatCard, buttonClass } from "@/components/ui";
import { SessionCard } from "../_components/session-card";
import { RangeFilter } from "../_components/range-filter";
import { formatMinutes, sessionMinutes, signPhotos, requestTime } from "../_lib";
import { readRange } from "../_range";

export const metadata = { title: "Remote Work Log" };

export default async function RemoteHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireEmployee();
  const { from, to } = readRange(await searchParams);
  const supabase = await createClient();
  const { data } = await supabase
    .from("remote_work_sessions")
    .select("*")
    .eq("employee_id", me.id)
    .gte("work_date", from)
    .lte("work_date", to)
    .order("check_in_at", { ascending: false })
    .limit(1000);

  const sessions = data ?? [];
  const now = requestTime();
  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) byDay.set(s.work_date, [...(byDay.get(s.work_date) ?? []), s]);
  const days = [...byDay.entries()].map(([date, list]) => {
    const sorted = [...list].sort((a, b) => a.check_in_at.localeCompare(b.check_in_at));
    return {
      date,
      list: sorted,
      minutes: list.reduce((t, s) => t + sessionMinutes(s, now), 0),
      firstIn: sorted[0].check_in_at,
      lastOut: sorted.every((s) => s.check_out_at) ? sorted.reduce((m, s) => (s.check_out_at! > m ? s.check_out_at! : m), sorted[0].check_out_at!) : null,
    };
  });
  const total = days.reduce((t, d) => t + d.minutes, 0);
  const photos = await signPhotos(sessions.slice(0, 150).flatMap((s) => [s.check_in_photo, s.check_out_photo]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Remote Work Log"
        description="Your remote check-ins with photos and the hours you worked."
        breadcrumbs={[{ label: "Attendance", href: "/attendance" }, { label: "Remote Check-In", href: "/attendance/remote" }, { label: "Remote Work Log" }]}
        actions={
          <Link href="/attendance/remote" className={buttonClass("primary")}>
            <Laptop className="h-4 w-4" /> Remote check-in
          </Link>
        }
      />
      <RangeFilter from={from} to={to} action="/attendance/remote/history" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total hours worked" value={formatMinutes(total)} hint={`${formatDate(from, "dd MMM")} – ${formatDate(to, "dd MMM yyyy")}`} icon={Clock} tone="bg-amber-50 text-amber-600" />
        <StatCard label="Remote days" value={days.length} icon={CalendarDays} tone="bg-sky-50 text-sky-600" />
        <StatCard label="Average per day" value={days.length ? formatMinutes(total / days.length) : "—"} icon={Timer} tone="bg-emerald-50 text-emerald-600" />
        <StatCard label="Sessions" value={sessions.length} icon={Laptop} tone="bg-violet-50 text-violet-600" />
      </div>

      <Card className="overflow-hidden">
        {days.length === 0 ? (
          <EmptyState icon={Laptop} title="No remote sessions in this period" description="Try a different date range." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {days.map((d) => (
              <li key={d.date}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4 hover:bg-slate-50">
                    <span className="w-36 font-medium text-slate-800">{formatDate(d.date, "EEE, dd MMM yyyy")}</span>
                    <span className="text-sm text-slate-500">
                      In {formatTime(d.firstIn)} · Out {d.lastOut ? formatTime(d.lastOut) : "—"}
                    </span>
                    <span className="text-sm text-slate-500">
                      {d.list.length} session{d.list.length === 1 ? "" : "s"}
                    </span>
                    <span className="ml-auto rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">{formatMinutes(d.minutes)}</span>
                    <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
                  </summary>
                  <div className="grid gap-4 bg-slate-50/60 px-5 py-4 lg:grid-cols-2">
                    {d.list.map((s) => (
                      <SessionCard key={s.id} s={s} photos={photos} />
                    ))}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
