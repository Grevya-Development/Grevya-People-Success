import Link from "next/link";
import { ArrowUpRight, FileCheck2, LifeBuoy, ListChecks, Puzzle, Settings2, type LucideIcon } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { moduleFor } from "@/lib/nav";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { cn, orgToday } from "@/lib/utils";

export const metadata = { title: "More Apps" };

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** Internal portal path like "/recruit/jobs" (not protocol-relative "//host"). */
const isInternal = (u: string) => /^\/(?![\/\\])/.test(u);
const safeUrl = (u: string) => {
  if (isInternal(u)) return u;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};
const hostOf = (u: string) => {
  if (isInternal(u)) return "People Success";
  try {
    return new URL(u).host.replace(/^www\./, "");
  } catch {
    return u;
  }
};

export default async function MoreAppsPage() {
  const me = await requireEmployee();
  const theme = moduleFor("apps")?.theme;
  const supabase = await createClient();
  const today = orgToday();

  const [{ data: addons }, { count: openTickets }, { data: forms }, { data: mine }] = await Promise.all([
    supabase.from("addons").select("id, name, description, url, color").eq("active", true).order("sort_order").order("name"),
    supabase.from("helpdesk_tickets").select("id", { count: "exact", head: true }).eq("employee_id", me.id).in("status", ["open", "in_progress"]),
    supabase.from("declaration_forms").select("id, due_date").eq("active", true),
    supabase.from("declaration_responses").select("form_id").eq("employee_id", me.id),
  ]);
  const done = new Set((mine ?? []).map((r) => r.form_id));
  const pendingDeclarations = (forms ?? []).filter((f) => !done.has(f.id) && (!f.due_date || f.due_date >= today)).length;

  const builderApps: { name: string; description: string; href: string; icon: LucideIcon; color: string; tint: string; badge: string; adminHref?: string; adminLabel?: string }[] = [
    {
      name: "Declaration App",
      description: "Submit conflict-of-interest, asset and other declarations requested by HR.",
      href: "/apps/declarations",
      icon: FileCheck2,
      color: "bg-[#2f9e8f]",
      tint: "bg-[#e0f2ef]",
      badge: pendingDeclarations ? `${pendingDeclarations} pending` : "All caught up",
      adminHref: "/apps/declarations/admin",
      adminLabel: "Manage forms",
    },
    {
      name: "HR Helpdesk",
      description: "Raise and track queries about payroll, leave, access, policies and letters.",
      href: "/apps/helpdesk",
      icon: LifeBuoy,
      color: "bg-[#5b74d6]",
      tint: "bg-[#e4e9fa]",
      badge: openTickets ? `${openTickets} open ${openTickets === 1 ? "ticket" : "tickets"}` : "No open tickets",
      adminHref: "/apps/helpdesk/queue",
      adminLabel: "Helpdesk queue",
    },
  ];

  return (
    <div>
      <PageHeader title="More Apps" description="Builder apps and add-on tools available to everyone at Grevya." breadcrumbs={[{ label: "Home", href: "/home" }, { label: "More Apps" }]} />

      <section className="mb-8">
        <SectionTitle className={theme?.text}>Builder Apps</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {builderApps.map((a) => (
            <Card key={a.name} className="group relative flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
              <Link href={a.href} className="flex flex-1 gap-4 p-5">
                <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm", a.color)}>
                  <a.icon className="h-6 w-6" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-slate-800 group-hover:text-primary-700">{a.name}</span>
                  <span className="mt-1 block text-sm text-slate-500">{a.description}</span>
                  <span className={cn("mt-3 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium text-slate-700", a.tint)}>{a.badge}</span>
                </span>
              </Link>
              {me.isHR && a.adminHref && (
                <Link href={a.adminHref} className={cn("flex items-center gap-1.5 border-t border-slate-100 px-5 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50", theme?.text)}>
                  {a.adminHref.endsWith("queue") ? <ListChecks className="h-3.5 w-3.5" /> : <Settings2 className="h-3.5 w-3.5" />}
                  {a.adminLabel}
                </Link>
              )}
            </Card>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <SectionTitle className={theme?.text}>Add-ons</SectionTitle>
          {me.isHR && (
            <Link href="/admin/addons" className="mb-3 text-xs font-medium text-primary-600 hover:underline">
              Manage add-ons
            </Link>
          )}
        </div>
        {!addons || addons.length === 0 ? (
          <Card>
            <EmptyState icon={Puzzle} title="No add-ons yet" description="External tools configured by HR will show up here." />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {addons.map((a) => {
              const href = safeUrl(a.url);
              const color = HEX.test(a.color) ? a.color : "#64748b";
              const body = (
                <>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white shadow-sm" style={{ backgroundColor: color }}>
                    {a.name.trim().charAt(0).toUpperCase() || "?"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-sm font-semibold text-slate-800 group-hover:text-primary-700">
                      <span className="truncate">{a.name}</span>
                      {href && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-primary-600" />}
                    </span>
                    {a.description && <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{a.description}</span>}
                    <span className="mt-1 block truncate text-[11px] text-slate-400">{hostOf(a.url)}</span>
                  </span>
                </>
              );
              const cls = "group flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition";
              return href && isInternal(href) ? (
                <Link key={a.id} href={href} className={cn(cls, "hover:-translate-y-0.5 hover:shadow-md")}>
                  {body}
                </Link>
              ) : href ? (
                <a key={a.id} href={href} target="_blank" rel="noopener noreferrer" className={cn(cls, "hover:-translate-y-0.5 hover:shadow-md")}>
                  {body}
                </a>
              ) : (
                <div key={a.id} className={cn(cls, "opacity-60")} title="Invalid link">
                  {body}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500", className)}>{children}</h2>;
}
