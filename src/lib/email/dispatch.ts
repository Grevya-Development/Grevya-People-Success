import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfig, recipientAllowed } from "./config";
import { renderNotificationEmail } from "./template";
import { sendBatch, type OutgoingEmail } from "./resend";
import { MAX_ATTEMPTS, backoffMinutes } from "./retry";

/** Base URL for links in emails: APP_URL, else the Vercel production domain. */
export function appBaseUrl(): string | null {
  const explicit = (process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  const vercel = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim();
  return vercel ? `https://${vercel}` : null;
}

export type DispatchStats = { configured: boolean; claimed: number; sent: number; retrying: number; failed: number; skipped: number };

/**
 * Send queued notification emails: claim a batch, render, send through Resend, record the
 * results. Safe to run concurrently (SKIP LOCKED claims, idempotency keys).
 */
export async function dispatchPendingEmails({ batchSize = 50, rounds = 3 } = {}): Promise<DispatchStats> {
  const cfg = emailConfig();
  const stats: DispatchStats = { configured: cfg.configured, claimed: 0, sent: 0, retrying: 0, failed: 0, skipped: 0 };
  if (!cfg.configured) return stats;

  const admin = createAdminClient();
  const base = appBaseUrl();

  for (let round = 0; round < rounds; round++) {
    const { data: rows, error } = await admin.rpc("claim_email_batch", { p_limit: batchSize });
    if (error) throw new Error(`Could not claim emails: ${error.message}`);
    if (!rows?.length) break;
    stats.claimed += rows.length;

    const blocked = rows.filter((r) => !recipientAllowed(r.email, cfg));
    const allowed = rows.filter((r) => recipientAllowed(r.email, cfg));
    if (blocked.length) {
      await admin
        .from("notifications")
        .update({ email_status: "skipped", email_error: "Recipient not in EMAIL_DEV_ALLOWLIST (non-production)" })
        .in("id", blocked.map((r) => r.id));
      stats.skipped += blocked.length;
    }
    if (!allowed.length) continue;

    const emails: OutgoingEmail[] = allowed.map((r) => {
      const link = r.link ? (/^https?:\/\//i.test(r.link) ? r.link : base ? `${base}${r.link.startsWith("/") ? "" : "/"}${r.link}` : null) : null;
      const { subject, html, text } = renderNotificationEmail({ recipientName: r.full_name, title: r.title, body: r.body, url: link, deskUrl: base });
      return { to: r.email, subject, html, text, tags: [{ name: "kind", value: "notification" }] };
    });
    const key = "ps-notif-" + createHash("sha256").update(allowed.map((r) => `${r.id}:${r.attempts}`).join(",")).digest("hex").slice(0, 40);
    const results = await sendBatch(emails, key);

    const now = Date.now();
    await Promise.all(
      allowed.map((r, i) => {
        const res = results[i];
        if (res.ok) {
          stats.sent++;
          return admin.from("notifications").update({ email_status: "sent", email_sent_at: new Date(now).toISOString(), email_id: res.id, email_error: null }).eq("id", r.id);
        }
        const giveUp = !res.retryable || r.attempts >= MAX_ATTEMPTS;
        if (giveUp) stats.failed++;
        else stats.retrying++;
        const waitMin = Math.max(backoffMinutes(r.attempts), Math.ceil((res.retryAfterSec ?? 0) / 60));
        return admin
          .from("notifications")
          .update({ email_status: giveUp ? "failed" : "pending", email_error: res.error, email_next_at: new Date(now + waitMin * 60_000).toISOString() })
          .eq("id", r.id);
      }),
    );
    if (results.some((r) => !r.ok && r.retryable)) break;
  }
  return stats;
}

export async function dispatchSecret(): Promise<string | null> {
  const { data } = await createAdminClient().from("app_private_settings").select("value").eq("key", "email_dispatch_secret").maybeSingle();
  return data?.value ?? null;
}
