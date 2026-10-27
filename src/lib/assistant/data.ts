import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CurrentEmployee } from "@/lib/auth";
import { allLeaves } from "@/lib/nav";
import { formatCurrency, formatDate, orgToday } from "@/lib/utils";

/**
 * Read-only lookups for the assistant. Every query runs with the signed-in
 * user's Supabase client, so row-level security limits results to what this
 * person may see (their own data, or their team's for managers).
 */
type Client = Awaited<ReturnType<typeof createClient>>;

export async function leaveBalance(supabase: Client, me: CurrentEmployee) {
  const year = Number(orgToday().slice(0, 4));
  const [{ data: bal }, { data: pending }] = await Promise.all([
    supabase.from("leave_balances").select("allocated, used, leave_type:leave_types(id, name, code, is_paid, active)").eq("employee_id", me.id).eq("year", year),
    supabase.from("leave_requests").select("leave_type_id, days").eq("employee_id", me.id).eq("status", "pending"),
  ]);
  const pend = new Map<string, number>();
  for (const p of pending ?? []) pend.set(p.leave_type_id, (pend.get(p.leave_type_id) ?? 0) + Number(p.days));
  return (bal ?? [])
    .map((b) => {
      const t = b.leave_type as { id: string; name: string; code: string; is_paid: boolean; active: boolean } | null;
      if (!t || !t.active) return null;
      const p = pend.get(t.id) ?? 0;
      return { type: t.name, code: t.code, allocated: Number(b.allocated), used: Number(b.used), pending: p, available: t.is_paid ? Number(b.allocated) - Number(b.used) - p : null };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
}

export async function upcomingHolidays(supabase: Client, limit = 6) {
  const { data } = await supabase.from("holidays").select("name, date, type").gte("date", orgToday()).order("date").limit(limit);
  return (data ?? []).map((h) => ({ name: h.name, date: formatDate(h.date, "EEE, dd MMM yyyy"), optional: h.type === "optional" }));
}

export async function attendanceSummary(supabase: Client, me: CurrentEmployee, days = 30) {
  const today = orgToday();
  const from = new Date(Date.parse(today) - days * 864e5).toISOString().slice(0, 10);
  const [{ data: recs }, { data: remote }] = await Promise.all([
    supabase.from("attendance_records").select("date, check_in, check_out, status").eq("employee_id", me.id).gte("date", from).lte("date", today),
    supabase.from("remote_work_sessions").select("worked_minutes, work_date").eq("employee_id", me.id).gte("work_date", from),
  ]);
  const rows = recs ?? [];
  const hours = rows.filter((r) => r.check_in && r.check_out).map((r) => (Date.parse(r.check_out!) - Date.parse(r.check_in!)) / 36e5);
  const late = rows.filter((r) => r.check_in && new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(r.check_in)) > "09:45").length;
  const todayRec = rows.find((r) => r.date === today);
  return {
    period: `last ${days} days`,
    days_present: rows.filter((r) => r.status === "present").length,
    days_wfh: rows.filter((r) => r.status === "wfh").length,
    days_on_duty: rows.filter((r) => r.status === "on_duty").length,
    average_hours: hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : null,
    late_check_ins: late,
    remote_hours: Math.round(((remote ?? []).reduce((t, s) => t + (s.worked_minutes ?? 0), 0) / 60) * 10) / 10,
    today: todayRec ? { status: todayRec.status, checked_in: !!todayRec.check_in, checked_out: !!todayRec.check_out } : { status: "not checked in yet" },
  };
}

export async function recentPayslips(supabase: Client, me: CurrentEmployee, limit = 3) {
  const { data } = await supabase
    .from("payslips")
    .select("id, year, month, gross, total_deductions, net_pay, paid_days, lop_days")
    .eq("employee_id", me.id)
    .eq("status", "published")
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(limit);
  return (data ?? []).map((p) => ({
    month: formatDate(`${p.year}-${String(p.month).padStart(2, "0")}-01`, "MMMM yyyy"),
    gross: formatCurrency(p.gross),
    deductions: formatCurrency(p.total_deductions),
    net_pay: formatCurrency(p.net_pay),
    paid_days: Number(p.paid_days),
    loss_of_pay_days: Number(p.lop_days),
    link: `/payroll/slips/${p.id}`,
  }));
}

export async function pendingItems(supabase: Client, me: CurrentEmployee) {
  const head = { count: "exact" as const, head: true };
  const [leave, reg, claims, tickets, review] = await Promise.all([
    supabase.from("leave_requests").select("id", head).eq("employee_id", me.id).eq("status", "pending"),
    supabase.from("regularization_requests").select("id", head).eq("employee_id", me.id).eq("status", "pending"),
    supabase.from("claims").select("id", head).eq("employee_id", me.id).in("status", ["submitted", "approved"]),
    supabase.from("helpdesk_tickets").select("id", head).eq("employee_id", me.id).in("status", ["open", "in_progress"]),
    supabase.from("reviews").select("id", head).eq("employee_id", me.id).eq("status", "pending_self"),
  ]);
  const out = [
    { item: "Leave requests awaiting approval", count: leave.count ?? 0, link: "/leave/details" },
    { item: "Regularizations awaiting approval", count: reg.count ?? 0, link: "/attendance/regularization" },
    { item: "Claims in progress", count: claims.count ?? 0, link: "/reimbursement/claims" },
    { item: "Open helpdesk tickets", count: tickets.count ?? 0, link: "/apps/helpdesk" },
    { item: "Self review to complete", count: review.count ?? 0, link: "/performance/reviews" },
  ];
  if (me.isManager) {
    const [la, ra, ca] = await Promise.all([
      supabase.from("leave_requests").select("id", head).eq("status", "pending").neq("employee_id", me.id),
      supabase.from("regularization_requests").select("id", head).eq("status", "pending").neq("employee_id", me.id),
      supabase.from("claims").select("id", head).eq("status", "submitted").neq("employee_id", me.id),
    ]);
    out.push(
      { item: "Team leave requests to approve", count: la.count ?? 0, link: "/leave/approvals" },
      { item: "Team regularizations to approve", count: ra.count ?? 0, link: "/attendance/bulk-approval" },
      { item: "Team claims to approve", count: ca.count ?? 0, link: "/reimbursement/approvals" },
    );
  }
  return out;
}

const STOP = new Set(["apply", "get", "need", "want", "know", "the", "a", "an", "is", "are", "my", "me", "i", "to", "of", "for", "in", "on", "how", "do", "what", "can", "and", "or", "with", "about", "please", "tell", "show", "where", "when", "does", "much", "many"]);
export function keywords(q: string) {
  const words = q
    .toLowerCase()
    .replace(/(\w)-(\w)/g, "$1$2") // comp-off -> compoff
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  return [...new Set(words)].slice(0, 6);
}

export async function searchKnowledge(supabase: Client, query: string) {
  const words = keywords(query);
  if (words.length === 0) return { faqs: [], policies: [] };
  const faqOr = words.flatMap((w) => [`question.ilike.%${w}%`, `answer.ilike.%${w}%`]).join(",");
  const polOr = words.flatMap((w) => [`title.ilike.%${w}%`, `summary.ilike.%${w}%`, `category.ilike.%${w}%`]).join(",");
  const [{ data: faqs }, { data: policies }] = await Promise.all([
    supabase.from("faqs").select("question, answer, category").or(faqOr).limit(20),
    supabase.from("policies").select("id, title, summary, category").eq("published", true).or(polOr).limit(20),
  ]);
  const score = (text: string) => words.reduce((s, w) => s + (text.toLowerCase().includes(w) ? 1 : 0), 0);
  return {
    faqs: (faqs ?? [])
      .map((f) => ({ f, s: score(`${f.question} ${f.answer}`) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map(({ f, s }) => ({ ...f, relevance: s })),
    policies: (policies ?? [])
      .map((p) => ({ ...p, s: score(`${p.title} ${p.summary ?? ""} ${p.category}`) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map((p) => ({ title: p.title, summary: p.summary, category: p.category, link: `/hris/policies/${p.id}` })),
  };
}

export function findPages(me: CurrentEmployee, query: string) {
  const words = keywords(query);
  const leaves = allLeaves({ isManager: me.isManager, isHR: me.isHR, isSuperAdmin: me.isSuperAdmin });
  return leaves
    .map((l) => ({ l, s: words.reduce((s, w) => s + (`${l.label} ${l.moduleLabel}`.toLowerCase().includes(w) ? 1 : 0), 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)
    .map(({ l }) => ({ page: l.label, module: l.moduleLabel, link: l.href }));
}

export function profileSummary(me: CurrentEmployee) {
  return {
    name: me.full_name,
    employee_code: me.employee_code,
    designation: me.designation?.title ?? null,
    department: me.department?.name ?? null,
    location: me.location?.name ?? null,
    reports_to: me.manager?.full_name ?? null,
    date_of_joining: formatDate(me.date_of_joining),
    role: me.role,
    direct_reports: me.reportCount,
  };
}
