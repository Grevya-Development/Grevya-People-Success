import Link from "next/link";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { CalendarClock, CheckCircle2, ClipboardList, FileCheck2, Settings2 } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, StatCard, buttonClass } from "@/components/ui";
import { cn, formatDate, orgToday } from "@/lib/utils";
import { parseFields } from "./_lib/fields";

export const metadata = { title: "Declaration App" };

export default async function DeclarationsPage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const [{ data: forms }, { data: mine }] = await Promise.all([
    supabase.from("declaration_forms").select("id, title, description, due_date, fields, created_at").eq("active", true).order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("declaration_responses").select("form_id, submitted_at").eq("employee_id", me.id),
  ]);

  const today = orgToday();
  const submitted = new Map((mine ?? []).map((r) => [r.form_id, r.submitted_at]));
  const rows = (forms ?? []).map((f) => {
    const at = submitted.get(f.id);
    const closed = !!f.due_date && today > f.due_date;
    const daysLeft = f.due_date ? differenceInCalendarDays(parseISO(f.due_date), parseISO(today)) : null;
    return { ...f, submittedAt: at ?? null, closed, daysLeft, fieldCount: parseFields(f.fields).length };
  });
  const pending = rows.filter((r) => !r.submittedAt && !r.closed);
  const done = rows.filter((r) => r.submittedAt);
  const missed = rows.filter((r) => !r.submittedAt && r.closed);

  return (
    <div>
      <PageHeader
        title="Declaration App"
        description="Complete the declarations HR needs from you before their due dates."
        breadcrumbs={[{ label: "More Apps", href: "/apps" }, { label: "Declaration App" }]}
        actions={
          me.isHR && (
            <Link href="/apps/declarations/admin" className={buttonClass("outline")}>
              <Settings2 className="h-4 w-4" /> Manage forms
            </Link>
          )
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Pending" value={pending.length} icon={CalendarClock} tone="bg-amber-50 text-amber-600" />
        <StatCard label="Submitted" value={done.length} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" />
        <StatCard label="Missed" value={missed.length} icon={ClipboardList} tone="bg-red-50 text-red-600" />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={FileCheck2} title="No declarations right now" description="When HR publishes a declaration form for you, it will appear here." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const urgent = !r.submittedAt && !r.closed && r.daysLeft !== null && r.daysLeft <= 3;
            return (
              <Link
                key={r.id}
                href={`/apps/declarations/${r.id}`}
                className="group flex flex-col rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className={cn("h-1.5 rounded-t-xl", r.submittedAt ? "bg-emerald-500" : r.closed ? "bg-slate-300" : urgent ? "bg-orange-500" : "bg-primary-500")} />
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[15px] font-semibold text-slate-800 group-hover:text-primary-700">{r.title}</h3>
                    {r.submittedAt ? <Badge tone="green">Submitted</Badge> : r.closed ? <Badge tone="red">Missed</Badge> : <Badge tone={urgent ? "orange" : "yellow"}>Pending</Badge>}
                  </div>
                  {r.description && <p className="mt-1.5 line-clamp-2 text-sm text-slate-500">{r.description}</p>}
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-xs text-slate-500">
                    <span>{r.fieldCount} {r.fieldCount === 1 ? "question" : "questions"}</span>
                    {r.submittedAt ? (
                      <span>Submitted {formatDate(r.submittedAt)}</span>
                    ) : r.due_date ? (
                      <span className={cn(urgent && "font-medium text-orange-600", r.closed && "text-red-600")}>
                        {r.closed ? `Closed ${formatDate(r.due_date)}` : r.daysLeft === 0 ? "Due today" : `Due ${formatDate(r.due_date)} · ${r.daysLeft}d left`}
                      </span>
                    ) : (
                      <span>No due date</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
