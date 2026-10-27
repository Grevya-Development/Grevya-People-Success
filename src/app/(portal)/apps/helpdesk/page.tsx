import Link from "next/link";
import { CircleCheck, Clock, Inbox, LifeBuoy, ListChecks, Plus } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Button, Card, EmptyState, PageHeader, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR, buttonClass } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { LinkTabs } from "@/components/ui/link-tabs";
import { formatDate, formatDateTime } from "@/lib/utils";
import { PriorityBadge, RaiseTicketForm, TicketRef } from "../_components/helpdesk-ui";
import { isStatus } from "./_lib/constants";

export const metadata = { title: "HR Helpdesk" };

export default async function HelpdeskPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const me = await requireEmployee();
  const { status } = await searchParams;
  const filter = isStatus(status ?? null) ? status! : null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("helpdesk_tickets")
    .select("id, seq, subject, category, priority, status, created_at, updated_at, assignee:employees!helpdesk_tickets_assigned_to_fkey(full_name, avatar_url)")
    .eq("employee_id", me.id)
    .order("created_at", { ascending: false });
  const tickets = data ?? [];
  const count = (s: string) => tickets.filter((t) => t.status === s).length;
  const shown = filter ? tickets.filter((t) => t.status === filter) : tickets;

  const raise = (
    <Dialog
      title="Raise a ticket"
      description="Our HR team usually responds within one working day."
      size="lg"
      trigger={
        <Button>
          <Plus className="h-4 w-4" /> Raise ticket
        </Button>
      }
    >
      <RaiseTicketForm />
    </Dialog>
  );

  return (
    <div>
      <PageHeader
        title="HR Helpdesk"
        description="Raise a query with HR and track it to resolution."
        breadcrumbs={[{ label: "More Apps", href: "/apps" }, { label: "HR Helpdesk" }]}
        actions={
          <>
            {me.isHR && (
              <Link href="/apps/helpdesk/queue" className={buttonClass("outline")}>
                <ListChecks className="h-4 w-4" /> Helpdesk queue
              </Link>
            )}
            {raise}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total tickets" value={tickets.length} icon={LifeBuoy} tone="bg-slate-100 text-slate-600" />
        <StatCard label="Open" value={count("open")} icon={Inbox} tone="bg-blue-50 text-blue-600" />
        <StatCard label="In progress" value={count("in_progress")} icon={Clock} tone="bg-violet-50 text-violet-600" />
        <StatCard label="Resolved / closed" value={count("resolved") + count("closed")} icon={CircleCheck} tone="bg-emerald-50 text-emerald-600" />
      </div>

      <Card>
        <div className="px-4 pt-2 sm:px-5">
          <LinkTabs
            className="mb-0"
            tabs={[
              { label: "All", href: "/apps/helpdesk", count: tickets.length },
              { label: "Open", href: "/apps/helpdesk?status=open", count: count("open") },
              { label: "In progress", href: "/apps/helpdesk?status=in_progress", count: count("in_progress") },
              { label: "Resolved", href: "/apps/helpdesk?status=resolved", count: count("resolved") },
              { label: "Closed", href: "/apps/helpdesk?status=closed", count: count("closed") },
            ]}
          />
        </div>
        {shown.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title={tickets.length === 0 ? "You haven't raised any tickets" : "No tickets with this status"}
            description={tickets.length === 0 ? "Questions about payroll, leave, access or letters? Raise a ticket and HR will get back to you." : undefined}
            action={tickets.length === 0 ? raise : undefined}
          />
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {shown.map((t) => (
                <li key={t.id}>
                  <Link href={`/apps/helpdesk/${t.id}`} className="block px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <TicketRef seq={t.seq} />
                      <StatusBadge status={t.status} />
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-800">{t.subject}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{t.category}</span>
                      <PriorityBadge priority={t.priority} />
                      <span>{formatDate(t.created_at)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <THead>
                  <TR>
                    <TH>Ticket</TH>
                    <TH>Subject</TH>
                    <TH>Category</TH>
                    <TH>Priority</TH>
                    <TH>Status</TH>
                    <TH>Assigned to</TH>
                    <TH>Last update</TH>
                  </TR>
                </THead>
                <TBody>
                  {shown.map((t) => (
                    <TR key={t.id}>
                      <TD>
                        <TicketRef seq={t.seq} />
                      </TD>
                      <TD className="max-w-xs">
                        <Link href={`/apps/helpdesk/${t.id}`} className="font-medium text-slate-800 hover:text-primary-600">
                          {t.subject}
                        </Link>
                      </TD>
                      <TD className="whitespace-nowrap">{t.category}</TD>
                      <TD>
                        <PriorityBadge priority={t.priority} />
                      </TD>
                      <TD>
                        <StatusBadge status={t.status} />
                      </TD>
                      <TD>
                        {t.assignee ? (
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <Avatar name={t.assignee.full_name} src={t.assignee.avatar_url} size="xs" />
                            {t.assignee.full_name}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Unassigned</span>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(t.updated_at)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
