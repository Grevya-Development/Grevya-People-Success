import Link from "next/link";
import { addDays, eachDayOfInterval, format, isWeekend, parseISO, subDays, differenceInYears } from "date-fns";
import { ChevronRight, Heart, Megaphone, Cake, PartyPopper, ArrowRight, Inbox } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { profileCompletion } from "@/lib/profile";
import { MODULES, findLeaf, moduleFor } from "@/lib/nav";
import { cn, formatDate, greeting, orgToday } from "@/lib/utils";
import { Avatar, Card, CardBody, CardHeader, ProgressRing, WidgetCard, EmptyState } from "@/components/ui";
import { PunchCard } from "../attendance/_components/punch-card";
import { AttendanceWidget, type DayRow } from "./_components/attendance-widget";

export const metadata = { title: "Home" };

const SUGGESTED = ["leave.apply", "attendance.my", "attendance.remote", "reimbursement.new", "performance.home", "payroll.slips", "apps.helpdesk"];

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = orgToday();
  const year = Number(today.slice(0, 4));
  const from = format(subDays(parseISO(today), 34), "yyyy-MM-dd");

  const [priv, edu, exp, reports, peers, favs, holidays, records, leaves, balances, pendingLeaves, announcements, people, myPending] = await Promise.all([
    supabase.from("employee_private").select("*").eq("employee_id", me.id).maybeSingle(),
    supabase.from("employee_education").select("id", { count: "exact", head: true }).eq("employee_id", me.id),
    supabase.from("employee_experience").select("id", { count: "exact", head: true }).eq("employee_id", me.id),
    supabase.from("employees").select("id, full_name, avatar_url, designation:designations(title)").eq("manager_id", me.id).neq("status", "exited").order("full_name").limit(6),
    me.manager_id
      ? supabase.from("employees").select("id, full_name, avatar_url, designation:designations(title)").eq("manager_id", me.manager_id).neq("id", me.id).neq("status", "exited").order("full_name").limit(6)
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("favorites").select("module_key").eq("employee_id", me.id).order("created_at"),
    supabase.from("holidays").select("id, name, date, type").gte("date", today).order("date").limit(5),
    supabase.from("attendance_records").select("date, check_in, check_out, status").eq("employee_id", me.id).gte("date", from).order("date", { ascending: false }),
    supabase.from("leave_requests").select("start_date, end_date").eq("employee_id", me.id).eq("status", "approved").gte("end_date", from),
    supabase.from("leave_balances").select("allocated, used, leave_type:leave_types(id, name, code, color, sort_order, active)").eq("employee_id", me.id).eq("year", year),
    supabase.from("leave_requests").select("leave_type_id, days").eq("employee_id", me.id).eq("status", "pending"),
    supabase.from("announcements").select("id, title, body, pinned, created_at").order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(3),
    supabase.from("employees").select("id, full_name, avatar_url, date_of_birth, date_of_joining").neq("status", "exited"),
    Promise.all([
      supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("employee_id", me.id).eq("status", "pending"),
      supabase.from("regularization_requests").select("id", { count: "exact", head: true }).eq("employee_id", me.id).eq("status", "pending"),
      supabase.from("claims").select("id", { count: "exact", head: true }).eq("employee_id", me.id).in("status", ["submitted", "approved"]),
      supabase.from("helpdesk_tickets").select("id", { count: "exact", head: true }).eq("employee_id", me.id).in("status", ["open", "in_progress"]),
      supabase.from("reviews").select("id", { count: "exact", head: true }).eq("employee_id", me.id).eq("status", "pending_self"),
    ]),
  ]);

  const completion = profileCompletion(me, priv.data, edu.count ?? 0, exp.count ?? 0);
  const team = (reports.data?.length ? reports.data : peers.data) ?? [];
  const teamLabel = reports.data?.length ? "My Team" : "My Peers";
  const todayRecord = (records.data ?? []).find((r) => r.date === today) ?? null;

  // Attendance days for the widget (most recent first)
  const recByDate = new Map((records.data ?? []).map((r) => [r.date, r]));
  const holidaySet = new Set<string>();
  {
    const { data: pastHolidays } = await supabase.from("holidays").select("date").gte("date", from).lte("date", today);
    pastHolidays?.forEach((h) => holidaySet.add(h.date));
  }
  const leaveDates = new Set<string>();
  for (const l of leaves.data ?? []) {
    for (let d = parseISO(l.start_date); d <= parseISO(l.end_date); d = addDays(d, 1)) leaveDates.add(format(d, "yyyy-MM-dd"));
  }
  const joined = me.date_of_joining;
  const days: DayRow[] = eachDayOfInterval({ start: parseISO(from), end: parseISO(today) })
    .reverse()
    .filter((d) => format(d, "yyyy-MM-dd") >= joined)
    .map((d) => {
      const key = format(d, "yyyy-MM-dd");
      const r = recByDate.get(key);
      const hours = r?.check_in ? ((r.check_out ? new Date(r.check_out) : new Date()).getTime() - new Date(r.check_in).getTime()) / 36e5 : null;
      let status: DayRow["status"];
      if (r) status = r.status as DayRow["status"];
      else if (leaveDates.has(key)) status = "leave";
      else if (holidaySet.has(key)) status = "holiday";
      else if (isWeekend(d)) status = "weekend";
      else if (key === today) status = "today";
      else status = "absent";
      return { date: key, status, checkIn: r?.check_in ?? null, checkOut: r?.check_out ?? null, hours: hours && hours > 0 ? Math.round(hours * 10) / 10 : null };
    });

  // Leave balances
  const pendingByType = new Map<string, number>();
  for (const p of pendingLeaves.data ?? []) pendingByType.set(p.leave_type_id, (pendingByType.get(p.leave_type_id) ?? 0) + Number(p.days));
  const balanceRows = (balances.data ?? [])
    .map((b) => {
      const lt = b.leave_type as { id: string; name: string; code: string; color: string; sort_order: number; active: boolean } | null;
      if (!lt || !lt.active) return null;
      const available = Number(b.allocated) - Number(b.used) - (pendingByType.get(lt.id) ?? 0);
      return { ...lt, allocated: Number(b.allocated), available };
    })
    .filter((x): x is NonNullable<typeof x> => !!x && (x.allocated > 0 || x.available !== 0))
    .sort((a, b) => a.sort_order - b.sort_order);

  // Celebrations this month
  const month = today.slice(5, 7);
  const birthdays = (people.data ?? [])
    .filter((p) => p.date_of_birth?.slice(5, 7) === month)
    .sort((a, b) => a.date_of_birth!.slice(8).localeCompare(b.date_of_birth!.slice(8)));
  const anniversaries = (people.data ?? [])
    .filter((p) => p.date_of_joining.slice(5, 7) === month && p.date_of_joining.slice(0, 4) < today.slice(0, 4))
    .sort((a, b) => a.date_of_joining.slice(8).localeCompare(b.date_of_joining.slice(8)));

  const favLeaves = (favs.data ?? []).map((f) => findLeaf(f.module_key)).filter((l): l is NonNullable<typeof l> => !!l);
  const suggested = SUGGESTED.map((k) => findLeaf(k)).filter((l): l is NonNullable<typeof l> => !!l);

  const [pLeave, pReg, pClaims, pTickets, pReview] = myPending;
  const myRequests = [
    { label: "Leave requests pending", count: pLeave.count ?? 0, href: "/leave/details" },
    { label: "Regularizations pending", count: pReg.count ?? 0, href: "/attendance/regularization" },
    { label: "Claims in progress", count: pClaims.count ?? 0, href: "/reimbursement/claims" },
    { label: "Open helpdesk tickets", count: pTickets.count ?? 0, href: "/apps/helpdesk" },
    { label: "Self review due", count: pReview.count ?? 0, href: "/performance/reviews" },
  ];

  return (
    <div className="space-y-6">
      {sp.denied && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">You don&apos;t have access to that page.</div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {greeting()}, {me.first_name}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">{formatDate(today, "EEEE, dd MMMM yyyy")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Profile & Team */}
        <WidgetCard title="Profile & Team" color="bg-[#6a3fd1]" className="lg:col-span-5" bodyClassName="p-0">
          <Link href="/profile" className="flex items-center gap-4 border-b border-slate-100 px-5 py-4 hover:bg-slate-50">
            <ProgressRing value={completion.percent} size={68} stroke={7} color={completion.percent >= 80 ? "#22c55e" : "#ef4444"}>
              <Avatar name={me.full_name} src={me.avatar_url} size="md" className="ring-0" />
            </ProgressRing>
            <div className="min-w-0 flex-1">
              <p className="text-3xl font-light text-slate-800">{completion.percent}%</p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Profile completed</p>
              {completion.missing.length > 0 && <p className="mt-0.5 truncate text-xs text-slate-500">Add: {completion.missing.slice(0, 3).join(", ")}</p>}
            </div>
            <ChevronRight className="h-6 w-6 text-primary-500" />
          </Link>
          <div className="px-5 py-3">
            {me.manager && (
              <div className="mb-2 flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <Avatar name={me.manager.full_name} src={me.manager.avatar_url} size="sm" />
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Reports to</p>
                  <Link href={`/directory/${me.manager.id}`} className="truncate text-sm font-medium text-slate-700 hover:text-primary-600">
                    {me.manager.full_name}
                  </Link>
                </div>
              </div>
            )}
            <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{teamLabel}</p>
            {team.length === 0 ? (
              <p className="py-3 text-sm text-slate-500">No team members yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {team.map((t) => (
                  <li key={t.id}>
                    <Link href={`/directory/${t.id}`} className="flex items-center gap-3 py-2 hover:text-primary-600">
                      <Avatar name={t.full_name} src={t.avatar_url} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-700">{t.full_name}</span>
                        <span className="block truncate text-xs text-slate-400">{(t.designation as { title: string } | null)?.title}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="pt-2 text-right">
              <Link href="/hris/org-chart" className="text-sm font-medium text-primary-600 hover:underline">
                View All
              </Link>
            </div>
          </div>
        </WidgetCard>

        {/* Punch */}
        <div className="lg:col-span-4">
          <PunchCard today={todayRecord} />
        </div>

        {/* Favourites */}
        <Card className="lg:col-span-3">
          <CardHeader title="Favourites" description="Pages you've pinned with ♡" />
          <CardBody className="space-y-2">
            {favLeaves.length === 0 ? (
              <EmptyState icon={Heart} title="No favourites yet" description="Hover a module in the menu and tap the heart next to any page to pin it here." className="py-6" />
            ) : (
              favLeaves.map((l) => {
                const m = moduleFor(l.moduleKey)!;
                return (
                  <Link key={l.key} href={l.href} className={cn("flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-700 transition-colors", m.theme.pill, m.theme.pillHover)}>
                    <span className="truncate">{l.label}</span>
                    <Heart className="h-4 w-4 shrink-0 fill-rose-500 text-rose-500" />
                  </Link>
                );
              })
            )}
          </CardBody>
        </Card>
      </div>

      {/* Suggested */}
      <section>
        <h2 className="mb-3 text-[15px] font-semibold text-slate-800">Suggested for you</h2>
        <div className="flex gap-3 overflow-x-auto pb-1 thin-scroll">
          {suggested.map((l) => {
            const m = MODULES.find((x) => x.key === l.moduleKey)!;
            const Icon = m.icon;
            return (
              <Link key={l.key} href={l.href} className={cn("flex shrink-0 items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition-colors", m.theme.pill, m.theme.pillHover)}>
                <Icon className={cn("h-5 w-5", m.theme.text)} strokeWidth={1.7} />
                {l.label}
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {/* Holidays */}
        <WidgetCard
          title="Upcoming Holidays"
          color="bg-[#ec7a35]"
          action={
            <Link href="/leave/holidays" className="text-xs font-medium text-white/90 hover:underline">
              View
            </Link>
          }
        >
          {(holidays.data ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">No upcoming holidays.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {holidays.data!.map((h) => (
                <li key={h.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-orange-50 text-orange-700">
                    <span className="text-[10px] font-semibold uppercase leading-none">{formatDate(h.date, "MMM")}</span>
                    <span className="text-base font-bold leading-tight">{formatDate(h.date, "dd")}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-700">{h.name}</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(h.date, "EEE, dd MMM")}
                      {h.type === "optional" && " · Optional"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>

        {/* Attendance */}
        <WidgetCard
          title="My Attendance"
          color="bg-[#e3a91a]"
          action={
            <Link href="/attendance/my" className="text-xs font-medium text-white/90 hover:underline">
              View
            </Link>
          }
        >
          <AttendanceWidget days={days} />
        </WidgetCard>

        {/* Leave balance */}
        <WidgetCard
          title="Leave Balance"
          color="bg-[#d9675a]"
          action={
            <Link href="/leave/apply" className="text-xs font-medium text-white/90 hover:underline">
              Apply
            </Link>
          }
        >
          {balanceRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">No leave allocated for {year} yet.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3">
              {balanceRows.map((b) => (
                <li key={b.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                    <span className="truncate text-xs text-slate-500">{b.name}</span>
                  </div>
                  <p className="mt-1 text-xl font-semibold text-slate-800">
                    {b.available}
                    <span className="text-xs font-normal text-slate-400"> / {b.allocated}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>

        {/* Announcements */}
        <Card className="md:col-span-2 xl:col-span-1">
          <CardHeader title="Announcements" action={<Megaphone className="h-4 w-4 text-slate-400" />} />
          <CardBody className="space-y-4">
            {(announcements.data ?? []).length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">No announcements.</p>
            ) : (
              announcements.data!.map((a) => (
                <article key={a.id}>
                  <div className="flex items-center gap-2">
                    {a.pinned && <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary-700">Pinned</span>}
                    <h3 className="text-sm font-semibold text-slate-800">{a.title}</h3>
                  </div>
                  <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-slate-600">{a.body}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{formatDate(a.created_at)}</p>
                </article>
              ))
            )}
          </CardBody>
        </Card>

        {/* Celebrations */}
        <Card>
          <CardHeader title="Celebrations this month" action={<PartyPopper className="h-4 w-4 text-slate-400" />} />
          <CardBody>
            {birthdays.length + anniversaries.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">No celebrations this month.</p>
            ) : (
              <ul className="space-y-2.5">
                {birthdays.map((p) => (
                  <li key={`b-${p.id}`} className="flex items-center gap-3">
                    <Avatar name={p.full_name} src={p.avatar_url} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{p.full_name}</span>
                    <span className="flex items-center gap-1 text-xs text-pink-600">
                      <Cake className="h-3.5 w-3.5" /> {formatDate(p.date_of_birth, "dd MMM")}
                    </span>
                  </li>
                ))}
                {anniversaries.map((p) => (
                  <li key={`a-${p.id}`} className="flex items-center gap-3">
                    <Avatar name={p.full_name} src={p.avatar_url} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{p.full_name}</span>
                    <span className="text-xs text-indigo-600">
                      {differenceInYears(parseISO(`${today.slice(0, 4)}${p.date_of_joining.slice(4)}`), parseISO(p.date_of_joining))} yr · {formatDate(p.date_of_joining, "dd MMM")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* My requests */}
        <Card>
          <CardHeader title="My Requests" action={<Inbox className="h-4 w-4 text-slate-400" />} />
          <CardBody className="p-2">
            <ul>
              {myRequests.map((r) => (
                <li key={r.label}>
                  <Link href={r.href} className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                    {r.label}
                    <span className="flex items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", r.count ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-400")}>{r.count}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
