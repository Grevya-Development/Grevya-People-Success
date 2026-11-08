import "server-only";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { emailConfig, recipientAllowed } from "./config";
import { appBaseUrl } from "./dispatch";
import { sendEmail } from "./resend";
import { escapeHtml, safeUrl } from "./template";

export type WelcomeEmailInput = {
  to: string;
  name: string;
  loginEmail: string;
  password: string;
  joiningDate: string | null;
  designation?: string | null;
  managerName?: string | null;
  /** true when HR reset an existing login rather than creating a new one */
  reset?: boolean;
};

function longDate(d: string | null) {
  if (!d) return null;
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(dt);
}

export function renderWelcomeEmail(input: WelcomeEmailInput & { signInUrl: string }) {
  const first = input.name.trim().split(/\s+/)[0] || "there";
  const url = safeUrl(input.signInUrl) ?? input.signInUrl;
  const joining = longDate(input.joiningDate);
  const subject = input.reset ? "Your People Success password was reset" : "Welcome to Grevya: your People Success login";
  const intro = input.reset
    ? "HR has set a new temporary password for your People Success account."
    : `We're glad you're joining us${joining ? ` on ${joining}` : ""}. People Success is where you'll apply for leave, see payslips, raise requests and find company policies.`;
  const facts = input.reset
    ? []
    : ([
        input.designation ? ["Role", input.designation] : null,
        input.managerName ? ["Reporting manager", input.managerName] : null,
        joining ? ["First day", joining] : null,
      ].filter(Boolean) as [string, string][]);

  const row = (k: string, v: string, mono = false) =>
    `<tr><td style="padding:6px 0;font-size:13px;color:#64748b;width:150px;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 0;font-size:14px;color:#0f172a;font-weight:600;${mono ? "font-family:Menlo,Consolas,monospace;letter-spacing:.3px" : ""}">${escapeHtml(v)}</td></tr>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f4f6fa;font-family:Roboto,Segoe UI,Helvetica,Arial,sans-serif;color:#1f2937">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.reset ? "Sign in and choose a new password." : "Your login details and what to expect on day one.")}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:20px 24px;border-bottom:1px solid #eef2f7;font-size:13px;font-weight:700;color:#0c1755;letter-spacing:.2px">Grevya People Success</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 8px;font-size:14px;color:#475569">Hi ${escapeHtml(first)},</p>
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#0f172a;line-height:1.35">${escapeHtml(input.reset ? "Your password was reset" : "Welcome to Grevya!")}</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155">${escapeHtml(intro)}</p>
${facts.length ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${facts.map(([k, v]) => row(k, v)).join("")}</table>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px"><tr><td style="padding:12px 16px">
<table role="presentation" cellpadding="0" cellspacing="0">${row("Sign-in email", input.loginEmail)}${row("Temporary password", input.password, true)}</table>
</td></tr></table>
<p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#475569">You'll be asked to choose your own password the first time you sign in. Don't share this email.</p>
<a href="${escapeHtml(url)}" style="display:inline-block;background:#2d48c8;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px">Sign in to People Success</a>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #eef2f7;font-size:12px;line-height:1.5;color:#64748b">
Didn't expect this? Contact your HR team. This email was sent because an account was set up for you in Grevya People Success.
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    `Hi ${first},`,
    "",
    input.reset ? "Your password was reset." : "Welcome to Grevya!",
    "",
    intro,
    ...(facts.length ? ["", ...facts.map(([k, v]) => `${k}: ${v}`)] : []),
    "",
    `Sign-in email: ${input.loginEmail}`,
    `Temporary password: ${input.password}`,
    "",
    "You'll be asked to choose your own password the first time you sign in. Don't share this email.",
    "",
    `Sign in: ${url}`,
    "",
    "—",
    "Grevya People Success",
  ].join("\n");

  return { subject, html, text };
}

async function signInUrl() {
  let base = appBaseUrl();
  if (!base) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    base = host ? `${h.get("x-forwarded-proto") ?? "http"}://${host}` : "";
  }
  return `${base}/login`;
}

export type WelcomeResult = { sent: true; to: string } | { sent: false; to: string; reason: string };

/** Email login details to a new joiner (or after a reset). Never throws. */
export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<WelcomeResult> {
  const cfg = emailConfig();
  const to = input.to.trim().toLowerCase();
  if (!cfg.configured) return { sent: false, to, reason: "email isn't set up (RESEND_API_KEY missing)" };
  if (!recipientAllowed(to, cfg)) return { sent: false, to, reason: "outside production, email only goes to EMAIL_DEV_ALLOWLIST addresses" };
  try {
    const email = renderWelcomeEmail({ ...input, to, signInUrl: await signInUrl() });
    const res = await sendEmail({ to, ...email, tags: [{ name: "type", value: input.reset ? "password_reset" : "welcome" }] }, `welcome:${randomUUID()}`);
    return res.ok ? { sent: true, to } : { sent: false, to, reason: res.error };
  } catch (err) {
    return { sent: false, to, reason: err instanceof Error ? err.message : "unknown error" };
  }
}
