import Link from "next/link";
import { CalendarDays, Umbrella } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { orgToday } from "@/lib/utils";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, WidgetCard, Badge, buttonClass } from "@/components/ui";
import { getBalances, getHolidays, getLeaveTypes } from "../_lib/data";
import { addDays, shortDay } from "../_lib/dates";
import { ApplyLeaveForm, type ApplyType } from "../_components/apply-leave-form";
import { BalanceCard } from "../_components/shared";

export const metadata = { title: "Apply Leave" };

export default async function ApplyLeavePage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const today = orgToday();
  const year = Number(today.slice(0, 4));

  const types = await getLeaveTypes(supabase);
  const [thisYear, nextYear, holidays] = await Promise.all([
    getBalances(supabase, me.id, year, types),
    getBalances(supabase, me.id, year + 1, types),
    getHolidays(supabase, `${year}-01-01`, `${year + 1}-12-31`, me.location_id),
  ]);

  const applyTypes: ApplyType[] = types.map((t) => ({
    id: t.id,
    name: t.name,
    code: t.code,
    color: t.color,
    is_paid: t.is_paid,
    allow_half_day: t.allow_half_day,
    available: {
      [year]: thisYear.find((b) => b.type.id === t.id)?.available ?? 0,
      [year + 1]: nextYear.find((b) => b.type.id === t.id)?.available ?? 0,
    },
  }));

  const upcoming = holidays.filter((h) => h.date >= today).slice(0, 6);

  return (
    <div>
      <PageHeader
        title="Apply Leave"
        breadcrumbs={[{ label: "Leave", href: "/leave/apply" }, { label: "Apply Leave" }]}
        actions={
          <Link href="/leave/details" className={buttonClass("outline", "sm")}>
            My leave history
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-[#ec7a35]" />
          <CardHeader title="Leave request" description="Weekends and holidays inside the range are not counted." />
          <CardBody>
            {applyTypes.length ? (
              <ApplyLeaveForm types={applyTypes} holidays={holidays.map((h) => ({ date: h.date, name: h.name }))} today={today} minDate={addDays(today, -30)} />
            ) : (
              <EmptyState icon={Umbrella} title="No leave types configured" description="HR hasn't set up any leave types yet. Please check back later." />
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <WidgetCard title={`Leave Balance · ${year}`} color="bg-[#ec7a35]" bodyClassName="p-3">
            {thisYear.length ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
                {thisYear.map((b) => (
                  <BalanceCard key={b.type.id} b={b} compact />
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-slate-500">No balances yet.</p>
            )}
          </WidgetCard>

          <WidgetCard
            title="Upcoming Holidays"
            color="bg-[#ec7a35]"
            action={
              <Link href="/leave/holidays" className="text-xs font-medium text-white/90 hover:text-white">
                View all
              </Link>
            }
            bodyClassName="p-0"
          >
            {upcoming.length ? (
              <ul className="divide-y divide-slate-100">
                {upcoming.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">{h.name}</p>
                      {h.type === "optional" && <Badge tone="purple" className="mt-0.5">Optional</Badge>}
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">{shortDay(h.date)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={CalendarDays} title="No upcoming holidays" className="py-8" />
            )}
          </WidgetCard>
        </div>
      </div>
    </div>
  );
}
