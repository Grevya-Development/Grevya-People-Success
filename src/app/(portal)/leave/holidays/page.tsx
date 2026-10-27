import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, orgToday } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader, StatCard, buttonClass } from "@/components/ui";
import { getHolidays } from "../_lib/data";
import { DOW_SHORT, MONTHS, dayOfWeek, isWeekend } from "../_lib/dates";

export const metadata = { title: "Holiday Calendar" };

export default async function HolidaysPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const today = orgToday();
  const thisYear = Number(today.slice(0, 4));
  const yp = Number(sp.year);
  const year = Number.isInteger(yp) && yp > 2000 && yp < 2100 ? yp : thisYear;

  const supabase = await createClient();
  const holidays = await getHolidays(supabase, `${year}-01-01`, `${year}-12-31`, me.location_id);

  const byMonth = MONTHS.map((name, i) => ({
    name,
    items: holidays.filter((h) => Number(h.date.slice(5, 7)) === i + 1),
  })).filter((m) => m.items.length);

  const publicCount = holidays.filter((h) => h.type === "public").length;
  const optionalCount = holidays.length - publicCount;
  const upcoming = holidays.filter((h) => h.date >= today).length;
  const onWeekdays = holidays.filter((h) => !isWeekend(h.date)).length;

  return (
    <div>
      <PageHeader
        title="Holiday Calendar"
        breadcrumbs={[{ label: "Leave", href: "/leave/apply" }, { label: "Holiday Calendar" }]}
        actions={
          <>
            {me.isHR && (
              <Link href="/leave/admin?tab=holidays" className={buttonClass("outline", "sm")}>
                <Settings2 className="h-3.5 w-3.5" /> Manage
              </Link>
            )}
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white">
              <Link href={`/leave/holidays?year=${year - 1}`} className="p-2 text-slate-500 hover:text-slate-800" aria-label="Previous year">
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <span className="px-2 text-sm font-semibold text-slate-800">{year}</span>
              <Link href={`/leave/holidays?year=${year + 1}`} className="p-2 text-slate-500 hover:text-slate-800" aria-label="Next year">
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total holidays" value={holidays.length} icon={CalendarDays} tone="bg-[#fbe2d2] text-[#c2581c]" />
        <StatCard label="Public" value={publicCount} tone="bg-blue-50 text-blue-600" />
        <StatCard label="Optional" value={optionalCount} tone="bg-violet-50 text-violet-600" />
        <StatCard label={year === thisYear ? "Upcoming" : "On weekdays"} value={year === thisYear ? upcoming : onWeekdays} />
      </div>

      {byMonth.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {byMonth.map((m) => (
            <Card key={m.name} className="overflow-hidden">
              <div className="flex items-center justify-between bg-[#fbe2d2] px-4 py-2">
                <h3 className="text-sm font-semibold text-[#c2581c]">
                  {m.name} {year}
                </h3>
                <span className="text-xs text-[#c2581c]/80">{m.items.length}</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {m.items.map((h) => {
                  const past = h.date < today;
                  const isToday = h.date === today;
                  return (
                    <li key={h.id} className={cn("flex items-center gap-3 px-4 py-3", past && "opacity-50")}>
                      <div className={cn("flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg", isToday ? "bg-[#ec7a35] text-white" : "bg-slate-50 text-slate-700")}>
                        <span className="text-base font-semibold leading-none">{Number(h.date.slice(8, 10))}</span>
                        <span className="text-[10px] uppercase">{DOW_SHORT[dayOfWeek(h.date)]}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-sm font-medium text-slate-800", past && "line-through decoration-slate-300")}>{h.name}</p>
                        <p className="text-xs text-slate-500">{isWeekend(h.date) ? "Falls on a weekend" : isToday ? "Today" : past ? "Passed" : "Upcoming"}</p>
                      </div>
                      <Badge tone={h.type === "optional" ? "purple" : "blue"}>{h.type === "optional" ? "Optional" : "Public"}</Badge>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={CalendarDays} title={`No holidays published for ${year}`} description="HR hasn't published the holiday list for this year yet." />
        </Card>
      )}
    </div>
  );
}
