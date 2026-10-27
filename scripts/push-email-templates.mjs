/**
 * Push the branded auth email templates (supabase/templates/*.html) and the
 * site URL to the hosted Supabase project via the Management API.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/push-email-templates.mjs --site-url https://people.grevya.com
 *
 * Get a personal access token at https://supabase.com/dashboard/account/tokens
 */
import { existsSync, readFileSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const token = process.env.SUPABASE_ACCESS_TOKEN;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ref = new URL(url).hostname.split(".")[0];
const i = process.argv.indexOf("--site-url");
const siteUrl = i > -1 ? process.argv[i + 1] : null;
if (!token) {
  console.error("Set SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)");
  process.exit(1);
}

const t = (name) => readFileSync(`supabase/templates/${name}.html`, "utf8");
const body = {
  mailer_subjects_recovery: "Reset your People Success password",
  mailer_templates_recovery_content: t("recovery"),
  mailer_subjects_invite: "You're invited to People Success",
  mailer_templates_invite_content: t("invite"),
  mailer_subjects_magic_link: "Your People Success sign-in link",
  mailer_templates_magic_link_content: t("magic_link"),
  mailer_subjects_confirmation: "Confirm your email for People Success",
  mailer_templates_confirmation_content: t("confirmation"),
  mailer_subjects_email_change: "Confirm your new People Success email",
  mailer_templates_email_change_content: t("email_change"),
};
if (siteUrl) {
  body.site_url = siteUrl;
  body.uri_allow_list = [`${siteUrl}/**`, "http://localhost:3100/**"].join(",");
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const text = await res.text();
if (!res.ok) {
  console.error(`Failed (${res.status}): ${text.slice(0, 500)}`);
  process.exit(1);
}
const cfg = JSON.parse(text);
console.log(`Updated project ${ref}: 5 email templates${siteUrl ? `, site URL ${cfg.site_url}` : ""}.`);
