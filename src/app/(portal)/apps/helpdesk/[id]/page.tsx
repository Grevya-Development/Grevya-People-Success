import { notFound } from "next/navigation";
import { CheckCircle2, Lock, MessageSquare, RotateCcw } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, StatusBadge, Textarea } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { cn, formatDateTime, humanize } from "@/lib/utils";
import { InlineSelect } from "../../_components/inline-select";
import { PriorityBadge } from "../../_components/helpdesk-ui";
import { addTicketComment, assignTicket, setTicketStatus } from "../actions";
import { HR_ROLES, TICKET_STATUSES, ticketRef } from "../_lib/constants";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const me = await requireEmployee();
  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("helpdesk_tickets")
    .select(
      "*, employee:employees!helpdesk_tickets_employee_id_fkey(id, full_name, employee_code, avatar_url, email, department:departments(name)), assignee:employees!helpdesk_tickets_assigned_to_fkey(id, full_name, avatar_url)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!ticket) notFound();

  const isRequester = ticket.employee_id === me.id;
  const isStaff = me.isHR || ticket.assigned_to === me.id;

  const [{ data: comments }, { data: hrTeam }] = await Promise.all([
    supabase
      .from("ticket_comments")
      .select("id, body, created_at, author_id, author:employees!ticket_comments_author_id_fkey(full_name, avatar_url, role)")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
    isStaff
      ? supabase.from("employees").select("id, full_name").in("role", [...HR_ROLES]).neq("status", "exited").order("first_name")
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);

  const closed = ticket.status === "closed";
  const canComment = (isRequester || isStaff) && !closed;
  const canReopen = isRequester && (ticket.status === "resolved" || ticket.status === "closed");
  const canClose = (isRequester || isStaff) && !closed;

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-lg text-slate-400">{ticketRef(ticket.seq)}</span>
            <span className="break-words">{ticket.subject}</span>
          </span>
        }
        breadcrumbs={[
          { label: "More Apps", href: "/apps" },
          { label: "HR Helpdesk", href: isRequester || !me.isHR ? "/apps/helpdesk" : "/apps/helpdesk/queue" },
          { label: ticketRef(ticket.seq) },
        ]}
        actions={
          <>
            {canReopen && (
              <ActionButton action={setTicketStatus} fields={{ id: ticket.id, status: "open" }} confirm="Reopen this ticket?" variant="outline" size="md">
                <RotateCcw className="h-4 w-4" /> Reopen
              </ActionButton>
            )}
            {canClose && isRequester && (
              <ActionButton action={setTicketStatus} fields={{ id: ticket.id, status: "closed" }} confirm="Close this ticket? You can reopen it later." variant="outline" size="md">
                <Lock className="h-4 w-4" /> Close ticket
              </ActionButton>
            )}
            {isStaff && ticket.status !== "resolved" && !closed && (
              <ActionButton action={setTicketStatus} fields={{ id: ticket.id, status: "resolved" }} variant="success" size="md">
                <CheckCircle2 className="h-4 w-4" /> Mark resolved
              </ActionButton>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardBody>
              <div className="flex items-start gap-3">
                <Avatar name={ticket.employee?.full_name} src={ticket.employee?.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold text-slate-800">{ticket.employee?.full_name}</span>
                    <span className="text-xs text-slate-500">raised this on {formatDateTime(ticket.created_at)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{ticket.description}</p>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Conversation" description={`${comments?.length ?? 0} ${comments?.length === 1 ? "reply" : "replies"}`} />
            {!comments || comments.length === 0 ? (
              <EmptyState icon={MessageSquare} title="No replies yet" description={isRequester ? "HR will reply here. You'll get a notification when the status changes." : "Be the first to respond."} />
            ) : (
              <ul className="space-y-4 px-5 py-4">
                {comments.map((c) => {
                  const mine = c.author_id === me.id;
                  const fromRequester = c.author_id === ticket.employee_id;
                  return (
                    <li key={c.id} className={cn("flex gap-3", mine && "flex-row-reverse")}>
                      <Avatar name={c.author?.full_name} src={c.author?.avatar_url} size="sm" />
                      <div className={cn("min-w-0 max-w-[85%] rounded-xl px-4 py-2.5", mine ? "bg-primary-50" : fromRequester ? "bg-slate-50" : "bg-[#eef1f6]")}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-slate-800">{mine ? "You" : c.author?.full_name}</span>
                          {!fromRequester && (
                            <Badge tone="purple" className="px-1.5 py-0 text-[10px]">
                              HR
                            </Badge>
                          )}
                          <span className="text-[11px] text-slate-400">{formatDateTime(c.created_at)}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{c.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="border-t border-slate-100 px-5 py-4">
              {canComment ? (
                <ActionForm action={addTicketComment} successMessage="Reply posted" className="space-y-3">
                  <input type="hidden" name="ticket_id" value={ticket.id} />
                  <Textarea name="body" rows={3} required maxLength={5000} placeholder={isStaff && !isRequester ? "Reply to the employee…" : "Add a comment…"} aria-label="Reply" />
                  <div className="flex justify-end">
                    <SubmitButton>
                      <MessageSquare className="h-4 w-4" /> Post reply
                    </SubmitButton>
                  </div>
                </ActionForm>
              ) : (
                <p className="text-center text-xs text-slate-500">
                  {closed ? (isRequester ? "This ticket is closed. Reopen it to continue the conversation." : "This ticket is closed.") : "You can view this ticket but not reply."}
                </p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Ticket details" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                <Row label="Status">
                  {isStaff ? (
                    <InlineSelect
                      key={ticket.status}
                      action={setTicketStatus}
                      name="status"
                      value={ticket.status}
                      fields={{ id: ticket.id }}
                      ariaLabel="Ticket status"
                      options={TICKET_STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
                    />
                  ) : (
                    <StatusBadge status={ticket.status} />
                  )}
                </Row>
                <Row label="Priority">
                  <PriorityBadge priority={ticket.priority} />
                </Row>
                <Row label="Category">{ticket.category}</Row>
                <Row label="Assigned to">
                  {isStaff ? (
                    <InlineSelect
                      key={ticket.assigned_to ?? "none"}
                      action={assignTicket}
                      name="assigned_to"
                      value={ticket.assigned_to ?? ""}
                      fields={{ id: ticket.id }}
                      ariaLabel="Assignee"
                      className="max-w-[180px]"
                      options={[{ value: "", label: "Unassigned" }, ...(hrTeam ?? []).map((h) => ({ value: h.id, label: h.id === me.id ? `${h.full_name ?? ""} (me)` : (h.full_name ?? "") }))]}
                    />
                  ) : ticket.assignee ? (
                    <span className="flex items-center gap-2">
                      <Avatar name={ticket.assignee.full_name} src={ticket.assignee.avatar_url} size="xs" />
                      {ticket.assignee.full_name}
                    </span>
                  ) : (
                    <span className="text-slate-400">Not yet assigned</span>
                  )}
                </Row>
                <Row label="Raised on">{formatDateTime(ticket.created_at)}</Row>
                <Row label="Last update">{formatDateTime(ticket.updated_at)}</Row>
                {ticket.resolved_at && <Row label="Resolved on">{formatDateTime(ticket.resolved_at)}</Row>}
              </dl>
            </CardBody>
          </Card>

          {!isRequester && ticket.employee && (
            <Card>
              <CardHeader title="Raised by" />
              <CardBody className="flex items-center gap-3">
                <Avatar name={ticket.employee.full_name} src={ticket.employee.avatar_url} />
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-slate-800">{ticket.employee.full_name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {ticket.employee.employee_code}
                    {ticket.employee.department?.name ? ` · ${ticket.employee.department.name}` : ""}
                  </p>
                  <p className="truncate text-xs text-slate-500">{ticket.employee.email}</p>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right text-slate-700">{children}</dd>
    </div>
  );
}
