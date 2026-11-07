/**
 * Grevya Service Desk base URL. When set, the old HR Helpdesk pages redirect
 * there (HR tickets were imported into the Service Desk's HR team).
 * Leave unset to keep using the built-in HR Helpdesk.
 */
export const SERVICE_DESK_URL = (process.env.NEXT_PUBLIC_SERVICE_DESK_URL ?? "").trim().replace(/\/+$/, "") || null;
