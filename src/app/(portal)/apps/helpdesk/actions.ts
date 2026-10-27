"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str } from "@/lib/utils";
import { HR_ROLES, isCategory, isPriority, isStatus, ticketRef } from "./_lib/constants";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateTicket(id?: string) {
  revalidatePath("/apps/helpdesk");
  revalidatePath("/apps/helpdesk/queue");
  revalidatePath("/apps");
  if (id) revalidatePath(`/apps/helpdesk/${id}`);
}

/** Load a ticket the signed-in user can see (RLS) and work out their role on it. */
async function loadTicket(id: string | null) {
  const me = await getCurrentEmployee();
  if (!me) return { error: "Not signed in" } as const;
  if (!id || !UUID.test(id)) return { error: "Ticket not found" } as const;
  const supabase = await createClient();
  const { data: ticket } = await supabase
    .from("helpdesk_tickets")
    .select("id, seq, employee_id, assigned_to, status")
    .eq("id", id)
    .maybeSingle();
  if (!ticket) return { error: "Ticket not found" } as const;
  const isRequester = ticket.employee_id === me.id;
  const isStaff = me.isHR || ticket.assigned_to === me.id;
  return { me, supabase, ticket, isRequester, isStaff } as const;
}

export async function raiseTicket(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const category = str(fd, "category");
  const priority = str(fd, "priority") ?? "medium";
  const subject = str(fd, "subject");
  const description = str(fd, "description");
  if (!isCategory(category)) return fail("Choose a category");
  if (!isPriority(priority)) return fail("Choose a valid priority");
  if (!subject) return fail("Subject is required");
  if (subject.length > 150) return fail("Subject must be 150 characters or fewer");
  if (!description) return fail("Please describe your issue");
  if (description.length > 5000) return fail("Description is too long (max 5000 characters)");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("helpdesk_tickets")
    .insert({ employee_id: me.id, category, priority, subject, description })
    .select("id, seq")
    .single();
  if (error || !data) return fail(dbError(error));
  revalidateTicket();
  return ok(`Ticket ${ticketRef(data.seq)} raised`, `/apps/helpdesk/${data.id}`);
}

export async function addTicketComment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await loadTicket(str(fd, "ticket_id"));
  if ("error" in ctx) return fail(ctx.error ?? "Ticket not found");
  const { me, supabase, ticket, isRequester, isStaff } = ctx;
  if (!isRequester && !isStaff) return fail("You don't have permission to comment on this ticket");
  if (ticket.status === "closed") return fail("This ticket is closed. Reopen it to add a comment.");
  const body = str(fd, "body");
  if (!body) return fail("Write a message first");
  if (body.length > 5000) return fail("Message is too long (max 5000 characters)");

  const { error } = await supabase.from("ticket_comments").insert({ ticket_id: ticket.id, author_id: me.id, body });
  if (error) return fail(dbError(error));

  // A staff reply on a fresh ticket means work has started.
  if (isStaff && !isRequester && ticket.status === "open") {
    await supabase.from("helpdesk_tickets").update({ status: "in_progress" }).eq("id", ticket.id);
  }
  revalidateTicket(ticket.id);
  return ok("Reply posted");
}

export async function setTicketStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await loadTicket(str(fd, "id"));
  if ("error" in ctx) return fail(ctx.error ?? "Ticket not found");
  const { supabase, ticket, isRequester, isStaff } = ctx;
  const status = str(fd, "status");
  if (!isStatus(status)) return fail("Invalid status");
  if (status === ticket.status) return ok("No change");

  if (!isStaff) {
    if (!isRequester) return fail("You don't have permission to update this ticket");
    // Requesters may close their ticket, or reopen a resolved/closed one.
    const closing = status === "closed";
    const reopening = status === "open" && (ticket.status === "resolved" || ticket.status === "closed");
    if (!closing && !reopening) return fail("You can only close or reopen your ticket");
  }

  const { error } = await supabase.from("helpdesk_tickets").update({ status }).eq("id", ticket.id);
  if (error) return fail(dbError(error));
  revalidateTicket(ticket.id);
  const verb = status === "open" ? "reopened" : status === "in_progress" ? "marked in progress" : status;
  return ok(`Ticket ${ticketRef(ticket.seq)} ${verb}`);
}

export async function assignTicket(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await loadTicket(str(fd, "id"));
  if ("error" in ctx) return fail(ctx.error ?? "Ticket not found");
  const { supabase, ticket, isStaff } = ctx;
  if (!isStaff) return fail("Only the HR team can assign tickets");

  const assignee = str(fd, "assigned_to");
  if (assignee) {
    if (!UUID.test(assignee)) return fail("Choose a valid assignee");
    const { data: emp } = await supabase.from("employees").select("id, role, status").eq("id", assignee).maybeSingle();
    if (!emp || !HR_ROLES.includes(emp.role) || emp.status === "exited") return fail("Tickets can only be assigned to active HR team members");
  }
  if ((assignee ?? null) === ticket.assigned_to) return ok("No change");

  const { error } = await supabase.from("helpdesk_tickets").update({ assigned_to: assignee }).eq("id", ticket.id);
  if (error) return fail(dbError(error));
  revalidateTicket(ticket.id);
  return ok(assignee ? `Ticket ${ticketRef(ticket.seq)} assigned` : `Ticket ${ticketRef(ticket.seq)} unassigned`);
}
