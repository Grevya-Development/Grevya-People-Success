import Link from "next/link";
import { AlertTriangle, Clock, Inbox, LifeBuoy, Search, UserX } from "lucide-react";
import { requireHR } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Card, EmptyState, Input, PageHeader, Select, StatCard, Table, TBody, TD, TH, THead, TR, buttonClass } from "@/components/ui";
import { formatDateTime, humanize } from "@/lib/utils";
import { InlineSelect } from "../../_components/inline-select";
import { PriorityBadge, TicketRef } from "../../_components/helpdesk-ui";
import { assignTicket, setTicketStatus } from "../actions";
import { PRIORITY_RANK, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, isCategory, isPriority, isStatus } from "../_lib/constants";

export const metadata = { title: "Helpdesk Queue" };

type SP = { status?: string; priority?: string; category?: string; assignee?: string; q?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function HelpdeskQueuePage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireHR();
  const sp = await searchParams;
  const status = sp.status ?? "active";
  const priority = isPriority(sp.priority ?? null) ? sp.priority! : "";
  const category = isCategory(sp.category ?? null) ? sp.category! : "";
  const assignee = sp.assignee === "unassigned" || sp.assignee === "me" || UUID.test(sp.assignee ?? "") ? sp.assignee! : "";
  const q = (sp.q ?? "").trim().slice(0, 100);

  const supabase = await createClient();
  let query = supabase
    .from("helpdesk_tickets")
    .select(
      "id, seq, subject, category, priority, status, assigned_to, created_at, updated_at, employee:employees!helpdesk_tickets_employee_id_fkey(full_name, employee_code, avatar_url)",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (status === "active") query = query.in("status", ["open", "in_progress"]);
  else if (isStatus(status)) query = query.eq("status", status);
  if (priority) query = query.eq("priority", priority);
  if (category) query = query.eq("category", category);
  if (assignee === "unassigned") query = query.is("assigned_to", null);
  else if (assignee === "me") query = query.eq("assigned_to", me.id);
  else if (assignee) query = query.eq("assigned_to", assignee);
  if (q) {
    const asNum = Number(q.replace(/^hd-?/i, ""));
    const safe = q.replace(/[%_,()]/g, " ");
    query = Number.isInteger(asNum) && asNum > 0 ? query.eq("seq", asNum) : query.ilike("subject", `%${safe}%`);
  }

  const [{ data }, { data: hrTeam }, { data: allActive }] = await Promise.all([
    query,
    supabase.from("employees").select("id, full_name").eq("role", "hr_admin").neq("status", "exited").order("first_name"),
    supabase.from("helpdesk_tickets").select("status, priority, assigned_to").in("status", ["open", "in_progress"]),
  ]);

  const tickets = (data ?? []).sort(
    (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || b.created_at.localeCompare(a.created_at),
  );
  const active = allActive ?? [];
  const team = hrTeam ?? [];
  const assigneeOptions = [{ value: "", label: "Unassigned" }, ...team.map((h) => ({ value: h.id, label: h.id === me.id ? `${h.full_name ?? ""} (me)` : (h.full_name ?? "") }))];
  const statusOptions = TICKET_STATUSES.map((s) => ({ value: s, label: humanize(s) }));
  const filtered = status !== "active" || priority || category || assignee || q;

  return (
    <div>
      <PageHeader
        title="Helpdesk Queue"
        description="Triage, assign and resolve employee tickets."
        breadcrumbs={[{ label: "More Apps", href: "/apps" }, { label: "HR Helpdesk", href: "/apps/helpdesk" }, { label: "Queue" }]}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open" value={active.filter((t) => t.status === "open").length} icon={Inbox} tone="bg-blue-50 text-blue-600" />
        <StatCard label="In progress" value={active.filter((t) => t.status === "in_progress").length} icon={Clock} tone="bg-violet-50 text-violet-600" />
        <StatCard label="Unassigned" value={active.filter((t) => !t.assigned_to).length} icon={UserX} tone="bg-amber-50 text-amber-600" />
        <StatCard label="Urgent / high" value={active.filter((t) => t.priority === "urgent" || t.priority === "high").length} icon={AlertTriangle} tone="bg-red-50 text-red-600" />
      </div>

      <Card className="mb-4">
        <form method="get" className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={q} placeholder="Search subject or HD-number" className="pl-9" aria-label="Search" />
          </div>
          <Select name="status" defaultValue={status} aria-label="Status">
            <option value="active">Active (open + in progress)</option>
            <option value="all">All statuses</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
          <Select name="priority" defaultValue={priority} aria-label="Priority">
            <option value="">All priorities</option>
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {humanize(p)}
              </option>
            ))}
          </Select>
          <Select name="category" defaultValue={category} aria-label="Category">
            <option value="">All categories</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select name="assignee" defaultValue={assignee} aria-label="Assignee">
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
            {team.map((h) => (
              <option key={h.id} value={h.id}>
                {h.full_name}
              </option>
            ))}
          </Select>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-6 lg:justify-end">
            {filtered && (
              <Link href="/apps/helpdesk/queue" className={buttonClass("ghost")}>
                Reset
              </Link>
            )}
            <button type="submit" className={buttonClass("primary")}>
              Apply filters
            </button>
          </div>
        </form>
      </Card>

      <Card>
        {tickets.length === 0 ? (
          <EmptyState icon={LifeBuoy} title={filtered ? "No tickets match these filters" : "The queue is clear"} description={filtered ? "Try widening the filters." : "No open or in-progress tickets right now."} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Ticket</TH>
                <TH>Employee</TH>
                <TH>Subject</TH>
                <TH>Category</TH>
                <TH>Priority</TH>
                <TH>Status</TH>
                <TH>Assignee</TH>
                <TH>Raised</TH>
              </TR>
            </THead>
            <TBody>
              {tickets.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <Link href={`/apps/helpdesk/${t.id}`} className="hover:underline">
                      <TicketRef seq={t.seq} />
                    </Link>
                  </TD>
                  <TD>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <Avatar name={t.employee?.full_name} src={t.employee?.avatar_url} size="xs" />
                      <span>
                        <span className="block text-sm text-slate-800">{t.employee?.full_name}</span>
                        <span className="block text-[11px] text-slate-400">{t.employee?.employee_code}</span>
                      </span>
                    </span>
                  </TD>
                  <TD className="min-w-[200px] max-w-xs">
                    <Link href={`/apps/helpdesk/${t.id}`} className="font-medium text-slate-800 hover:text-primary-600">
                      {t.subject}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap text-xs">{t.category}</TD>
                  <TD>
                    <PriorityBadge priority={t.priority} />
                  </TD>
                  <TD>
                    <InlineSelect key={t.status} action={setTicketStatus} name="status" value={t.status} fields={{ id: t.id }} options={statusOptions} ariaLabel={`Status of HD-${t.seq}`} />
                  </TD>
                  <TD>
                    <InlineSelect
                      key={t.assigned_to ?? "none"}
                      action={assignTicket}
                      name="assigned_to"
                      value={t.assigned_to ?? ""}
                      fields={{ id: t.id }}
                      options={assigneeOptions}
                      ariaLabel={`Assignee of HD-${t.seq}`}
                      className="max-w-[170px]"
                    />
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(t.created_at)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
