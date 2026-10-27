export const TICKET_CATEGORIES = ["Payroll", "Leave & Attendance", "IT & Access", "Policies", "Documents & Letters", "Other"] as const;

export const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export const ticketRef = (seq: number | string) => `HD-${seq}`;

export function isCategory(v: string | null): v is (typeof TICKET_CATEGORIES)[number] {
  return !!v && (TICKET_CATEGORIES as readonly string[]).includes(v);
}
export function isPriority(v: string | null): v is TicketPriority {
  return !!v && (TICKET_PRIORITIES as readonly string[]).includes(v);
}
export function isStatus(v: string | null): v is TicketStatus {
  return !!v && (TICKET_STATUSES as readonly string[]).includes(v);
}
