import Link from "next/link";
import { CalendarCheck2, CalendarDays, ChevronLeft, ChevronRight, MapPin, Plus, Users, Video } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { Dialog } from "@/components/ui/dialog";
import { cn, orgToday } from "@/lib/utils";
import { cancelRegistration, registerForSession } from "../calendar-actions";
import { SessionForm } from "../_components/session-form";
import { istDate, istDayLabel, istDayMonth, istTime, istTimeRange } from "../_lib/time";

export const metadata = { title: "Training Calendar" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function TrainingCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requireEmployee();
  const { month: rawMonth } = await searchParams;
  const today = orgToday();
  const month = rawMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : today.slice(0, 7);
  const next = shiftMonth(month, 1);
  const nowIso = new Date().toISOString();
  const supabase = await createClient();

  const [{ data: monthData }, { data: upcomingData }, { data: seatData }, { data: myRegData }, { data: courseData }] = await Promise.all([
    supabase
      .from("training_sessions")
      .select("id, title, starts_at, ends_at, status, mode")
      .gte("starts_at", `${month}-01T00:00:00+05:30`)
      .lt("starts_at", `${next}-01T00:00:00+05:30`)
      .order("starts_at"),
    supabase
      .from("training_sessions")
      .select("id, title, description, trainer, starts_at, ends_at, mode, location, capacity, status")
      .eq("status", "scheduled")
      .gte("ends_at", nowIso)
      .order("starts_at")
      .limit(30),
    supabase.rpc("training_session_seats"),
    supabase
      .from("training_registrations")
      .select("id, attended, session:training_sessions!training_registrations_session_id_fkey(id, title, starts_at, ends_at, mode, status)")
      .eq("employee_id", me.id),
    me.isHR ? supabase.from("courses").select("id, title").eq("published", true).order("title") : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);

  const seats = new Map((seatData ?? []).map((s) => [s.session_id, s.registered]));
  const myRegs = (myRegData ?? []).filter((r) => r.session);
  const mine = new Set(myRegs.map((r) => r.session!.id));
  const myUpcoming = myRegs.filter((r) => r.session!.ends_at >= nowIso && r.session!.status === "scheduled").sort((a, b) => a.session!.starts_at.localeCompare(b.session!.starts_at));
  const myPast = myRegs.filter((r) => r.session!.ends_at < nowIso).sort((a, b) => b.session!.starts_at.localeCompare(a.session!.starts_at)).slice(0, 5);
  const upcoming = upcomingData ?? [];

  const byDay = new Map<string, NonNullable<typeof monthData>>();
  (monthData ?? []).forEach((s) => {
    const k = istDate(s.starts_at);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  });
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div>
      <PageHeader
        title="Training Calendar"
        description="Instructor-led sessions and webinars. Register to save your seat — all times are IST."
        breadcrumbs={[{ label: "Learning", href: "/learning" }, { label: "Training Calendar" }]}
        actions={
          me.isHR ? (
            <Dialog
              trigger={
                <Button>
                  <Plus className="h-4 w-4" /> Schedule session
                </Button>
              }
              title="Schedule a training session"
              size="lg"
            >
              <SessionForm courses={courseData ?? []} />
            </Dialog>
          ) : undefined
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
            <Link href={`/learning/calendar?month=${shiftMonth(month, -1)}`} className={buttonClass("ghost", "icon")} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <div className="text-center">
              <h2 className="text-[15px] font-semibold text-slate-800">{monthLabel}</h2>
              {month !== today.slice(0, 7) && (
                <Link href="/learning/calendar" className="text-xs text-primary-600 hover:underline">
                  Back to today
                </Link>
              )}
            </div>
            <Link href={`/learning/calendar?month=${next}`} className={buttonClass("ghost", "icon")} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="p-2 sm:p-4">
            <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-[11px]">
              {WEEKDAYS.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <div key={i} className="min-h-14 rounded-lg bg-slate-50/50 sm:min-h-24" />;
                const list = byDay.get(d) ?? [];
                const isToday = d === today;
                return (
                  <div key={d} className={cn("min-h-14 min-w-0 rounded-lg border p-1 sm:min-h-24 sm:p-1.5", isToday ? "border-[#3a95b3] bg-[#d5e9f0]/40" : "border-slate-100")}>
                    <p className={cn("text-[11px] font-medium sm:text-xs", isToday ? "text-[#25708a]" : d < today ? "text-slate-400" : "text-slate-600")}>{Number(d.slice(8))}</p>
                    <div className="mt-0.5 space-y-0.5">
                      {list.slice(0, 3).map((s) => (
                        <Link
                          key={s.id}
                          href={`/learning/calendar/${s.id}`}
                          title={`${s.title} · ${istTime(s.starts_at)}`}
                          className={cn(
                            "block truncate rounded px-1 py-0.5 text-[10px] leading-tight sm:text-[11px]",
                            s.status === "cancelled"
                              ? "bg-slate-100 text-slate-400 line-through"
                              : mine.has(s.id)
                                ? "bg-[#3a95b3] text-white"
                                : "bg-[#d5e9f0] text-[#25708a] hover:bg-[#c0dde8]",
                          )}
                        >
                          <span className="hidden sm:inline">{istTime(s.starts_at).replace(":00", "")} </span>
                          {s.title}
                        </Link>
                      ))}
                      {list.length > 3 && <p className="px-1 text-[10px] text-slate-400">+{list.length - 3}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 px-1 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-[#3a95b3]" /> Registered
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-[#d5e9f0]" /> Open
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-slate-200" /> Cancelled
              </span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="My registrations" description={`${myUpcoming.length} upcoming`} />
          {myUpcoming.length === 0 && myPast.length === 0 ? (
            <EmptyState icon={CalendarCheck2} title="No registrations yet" description="Register for a session below to see it here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {myUpcoming.map((r) => (
                <li key={r.id} className="px-5 py-3">
                  <Link href={`/learning/calendar/${r.session!.id}`} className="block truncate text-sm font-medium text-slate-800 hover:text-[#25708a]">
                    {r.session!.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {istDayLabel(r.session!.starts_at)} · {istTime(r.session!.starts_at)} IST
                  </p>
                </li>
              ))}
              {myPast.map((r) => (
                <li key={r.id} className="px-5 py-3 opacity-70">
                  <Link href={`/learning/calendar/${r.session!.id}`} className="block truncate text-sm text-slate-700 hover:text-[#25708a]">
                    {r.session!.title}
                  </Link>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    {istDayLabel(r.session!.starts_at)}
                    {r.attended === true && <Badge tone="green">Attended</Badge>}
                    {r.attended === false && <Badge tone="red">Absent</Badge>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-slate-800">Upcoming sessions</h2>
        {upcoming.length === 0 ? (
          <Card>
            <EmptyState icon={CalendarDays} title="No sessions scheduled" description={me.isHR ? "Schedule a session to open registrations." : "Check back soon — HR will announce new sessions here."} />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((s) => {
              const taken = seats.get(s.id) ?? 0;
              const left = Math.max(0, s.capacity - taken);
              const registered = mine.has(s.id);
              const started = s.starts_at <= nowIso;
              return (
                <Card key={s.id} className="flex flex-col p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-[#d5e9f0] py-1.5 text-[#25708a]">
                      <span className="text-[10px] font-semibold uppercase">{istDayMonth(s.starts_at).month}</span>
                      <span className="text-lg font-bold leading-none">{istDayMonth(s.starts_at).day}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/learning/calendar/${s.id}`} className="line-clamp-2 text-sm font-semibold text-slate-800 hover:text-[#25708a]">
                        {s.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">{istTimeRange(s.starts_at, s.ends_at)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      {s.mode === "virtual" ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                      {s.mode === "virtual" ? "Virtual" : s.location}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> {s.trainer}
                    </span>
                  </div>
                  {s.description && <p className="mt-2 line-clamp-2 text-xs text-slate-500">{s.description}</p>}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                    <span className={cn("text-xs font-medium", left === 0 ? "text-red-600" : left <= 3 ? "text-amber-700" : "text-slate-600")}>
                      {left === 0 ? "Full" : `${left} of ${s.capacity} seats left`}
                    </span>
                    {registered ? (
                      <div className="flex items-center gap-2">
                        <Badge tone="teal">Registered</Badge>
                        {!started && (
                          <ActionButton action={cancelRegistration} fields={{ session_id: s.id }} confirm={`Cancel your seat in "${s.title}"?`} variant="ghost">
                            Cancel
                          </ActionButton>
                        )}
                      </div>
                    ) : started ? (
                      <Badge tone="gray">In progress</Badge>
                    ) : (
                      <ActionButton action={registerForSession} fields={{ session_id: s.id }} variant="primary" disabled={left === 0}>
                        {left === 0 ? "Full" : "Register"}
                      </ActionButton>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
