// Smoke test: signs in as a role and requests every portal page against a running dev server.
//   node scripts/smoke.mjs hr@grevya.com      (also kavin@grevya.com, priya@grevya.com)
import { createServerClient } from "@supabase/ssr";
process.loadEnvFile(".env.local");
const BASE = "http://localhost:3100";
const ROUTES = `/home /notifications /profile /profile/personal /profile/education /profile/experience /settings /directory
/hris /hris/contracts /hris/letters /hris/salary-letters /hris/employees /hris/employees/new /hris/policies /hris/org-chart /hris/admin/letters /hris/admin/policies /admin/org
/performance /performance/goals /performance/goals/new /performance/team-goals /performance/objective-tree /performance/reviews /performance/team-reviews /performance/admin
/exit/resign /exit/status /exit/approvals
/leave/apply /leave/details /leave/holidays /leave/approvals /leave/admin
/attendance /attendance/my /attendance/calendar /attendance/regularization /attendance/compoff /attendance/team /attendance/bulk-approval
/payroll/slips /payroll/tax-calculator /payroll/vpf /payroll/fbp /payroll/ctc-reimbursement /payroll/investments /payroll/admin
/reimbursement/new /reimbursement/claims /reimbursement/approvals
/learning /learning/catalog /learning/my-courses /learning/plan /learning/certificates /learning/team /learning/admin
/recruit /recruit/jobs /recruit/referrals /recruit/admin
/apps /apps/helpdesk /apps/helpdesk/queue /apps/declarations /apps/declarations/admin /admin/announcements /admin/addons`.split(/\s+/).filter(Boolean);

async function cookieFor(email) {
  const jar = new Map();
  const c = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach(({ name, value }) => jar.set(name, value)) },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: "Grevya@123" });
  if (error) throw error;
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

const who = process.argv[2] ?? "hr@grevya.com";
const extra = (process.argv[3] ?? "").split(",").filter(Boolean);
const cookie = await cookieFor(who);
const bad = [];
for (const r of [...ROUTES, ...extra]) {
  const t = Date.now();
  const res = await fetch(BASE + r, { headers: { cookie }, redirect: "manual" });
  const body = res.status === 200 ? await res.text() : "";
  const err = /Something went wrong|Application error|__next_error__|NEXT_NOT_FOUND|Unhandled Runtime Error/.test(body);
  const loc = res.headers.get("location");
  const line = `${res.status} ${String(Date.now() - t).padStart(5)}ms ${r}${loc ? " -> " + loc : ""}${err ? "  <ERROR>" : ""}`;
  if (res.status >= 400 || err) bad.push(line);
  console.log(line);
}
console.log(`\n${who}: ${bad.length} problem(s)`);
bad.forEach((b) => console.log("  " + b));
