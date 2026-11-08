/**
 * Grevya Service Desk base URL. When set, the old HR Helpdesk pages redirect
 * there (HR tickets were imported into the Service Desk's HR team).
 * Leave unset to keep using the built-in HR Helpdesk.
 */
export const SERVICE_DESK_URL = (process.env.NEXT_PUBLIC_SERVICE_DESK_URL ?? "").trim().replace(/\/+$/, "") || null;

/**
 * Link for a Service Desk request: the link the desk stored, or one built from its
 * reference ("SD-1234") and SERVICE_DESK_URL when the desk had no address set.
 */
export function deskRequestUrl(link: string | null | undefined, label: string | null | undefined): string | null {
  if (link) return link;
  const n = /^SD-(\d+)$/.exec(label ?? "")?.[1];
  return n && SERVICE_DESK_URL ? `${SERVICE_DESK_URL}/requests/${n}` : null;
}
