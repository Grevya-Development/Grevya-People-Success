import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/database.types";

export type RemoteSession = Tables<"remote_work_sessions">;
export const PHOTO_BUCKET = "attendance-photos";

/** "7h 45m" */
export function formatMinutes(min: number | null | undefined) {
  const m = Math.max(0, Math.round(min ?? 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** Minutes for a session; open sessions count up to `now`. */
export function sessionMinutes(s: Pick<RemoteSession, "check_in_at" | "check_out_at" | "worked_minutes">, now = Date.now()) {
  if (s.worked_minutes !== null && s.worked_minutes !== undefined) return s.worked_minutes;
  return Math.max(0, Math.floor((now - new Date(s.check_in_at).getTime()) / 60000));
}

/**
 * Signed URLs for selfie paths. Only call with rows that were fetched through
 * the user's RLS-scoped client (that proves the viewer may see them).
 */
export async function signPhotos(paths: (string | null | undefined)[], expiresIn = 900): Promise<Record<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  if (list.length === 0) return {};
  const admin = createAdminClient();
  const { data } = await admin.storage.from(PHOTO_BUCKET).createSignedUrls(list, expiresIn);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

export function mapLink(lat: number | null, lng: number | null) {
  if (lat === null || lng === null) return null;
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}

/** Short device label from a user agent. */
export function deviceLabel(ua: string | null | undefined) {
  if (!ua) return "Unknown device";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Other";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const mobile = /Mobile|Android|iPhone/.test(ua) ? " · mobile" : "";
  return `${br} on ${os}${mobile}`;
}

/** Current time in ms (request time for server components). */
export function requestTime() {
  return Date.now();
}
