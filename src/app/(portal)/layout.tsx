import { cookies } from "next/headers";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PortalShell } from "@/components/shell/portal-shell";
import type { TaskItem } from "@/components/shell/header-menus";
import { orgToday } from "@/lib/utils";

export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const me = await requireEmployee();
  const supabase = await createClient();
  const cookieStore = await cookies();

  const [favs, addons, notes, unread, approvals, todos, announcements] = await Promise.all([
    supabase.from("favorites").select("module_key").eq("employee_id", me.id),
    supabase.from("addons").select("id, name, url, color, description").eq("active", true).order("sort_order"),
    supabase.from("notifications").select("id, title, body, link, read_at, created_at").eq("employee_id", me.id).order("created_at", { ascending: false }).limit(12),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("employee_id", me.id).is("read_at", null),
    me.isManager ? loadTasks(supabase, me.id, me.isHR) : Promise.resolve([] as TaskItem[]),
    loadTodos(supabase, me.id),
    supabase.from("announcements").select("id, title, body, pinned, created_at").order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(8),
  ]);
  const tasks = [...approvals.map((t) => ({ ...t, group: "approval" as const })), ...todos];

  return (
    <PortalShell
      viewer={{ isManager: me.isManager, isHR: me.isHR, isSuperAdmin: me.isSuperAdmin }}
      user={{ name: me.full_name ?? me.first_name, avatarUrl: me.avatar_url, designation: me.designation?.title ?? null, code: me.employee_code }}
      favorites={(favs.data ?? []).map((f) => f.module_key)}
      addons={addons.data ?? []}
      notifications={notes.data ?? []}
      unread={unread.count ?? 0}
      tasks={tasks}
      announcements={announcements.data ?? []}
      initialCollapsed={cookieStore.get("ps_sidebar")?.value === "collapsed"}
    >
      {children}
    </PortalShell>
  );
}

type Client = Awaited<ReturnType<typeof createClient>>;

async function loadTasks(supabase: Client, meId: string, isHR: boolean): Promise<TaskItem[]> {
  const count = async (table: "leave_requests" | "regularization_requests" | "compoff_requests" | "claims" | "goals" | "reviews" | "resignations", statuses: string[]) => {
    const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).in("status", statuses).neq("employee_id", meId);
    return count ?? 0;
  };

  const base = await Promise.all([
    count("leave_requests", ["pending"]).then((n) => ({ label: "Leave approvals", href: "/leave/approvals", count: n })),
    count("regularization_requests", ["pending"]).then((n) => ({ label: "Regularization approvals", href: "/attendance/bulk-approval", count: n })),
    count("compoff_requests", ["pending"]).then((n) => ({ label: "Comp-off approvals", href: "/attendance/bulk-approval", count: n })),
    count("claims", ["submitted"]).then((n) => ({ label: "Reimbursement claims", href: "/reimbursement/approvals", count: n })),
    count("goals", ["pending_approval"]).then((n) => ({ label: "Goal approvals", href: "/performance/team-goals", count: n })),
    count("reviews", ["pending_manager"]).then((n) => ({ label: "Team reviews to complete", href: "/performance/team-reviews", count: n })),
    count("resignations", isHR ? ["pending_manager", "pending_hr"] : ["pending_manager"]).then((n) => ({ label: "Resignation approvals", href: "/exit/approvals", count: n })),
  ]);

  if (!isHR) return base;

  const head = { count: "exact" as const, head: true };
  const [letters, vpf, fbp, inv, tickets] = await Promise.all([
    supabase.from("letter_requests").select("id", head).eq("status", "pending"),
    supabase.from("vpf_declarations").select("id", head).eq("status", "pending"),
    supabase.from("fbp_declarations").select("id", head).eq("status", "submitted"),
    supabase.from("investment_declarations").select("id", head).eq("status", "submitted"),
    supabase.from("helpdesk_tickets").select("id", head).in("status", ["open", "in_progress"]),
  ]);
  return [
    ...base,
    { label: "Letter requests", href: "/hris/admin/letters", count: letters.count ?? 0 },
    { label: "Payroll declarations", href: "/payroll/admin", count: (vpf.count ?? 0) + (fbp.count ?? 0) + (inv.count ?? 0) },
    { label: "Open helpdesk tickets", href: "/apps/helpdesk/queue", count: tickets.count ?? 0 },
  ];
}

/** Personal to-dos shown to everyone in the Tasks panel. */
async function loadTodos(supabase: Client, meId: string): Promise<TaskItem[]> {
  const today = orgToday();
  const soon = new Date(Date.parse(today) + 14 * 864e5).toISOString().slice(0, 10);
  const head = { count: "exact" as const, head: true };
  const [review, policies, acks, forms, responses, courses, drafts, openRemote] = await Promise.all([
    supabase.from("reviews").select("id", head).eq("employee_id", meId).eq("status", "pending_self"),
    supabase.from("policies").select("id").eq("published", true).eq("requires_acknowledgement", true),
    supabase.from("policy_acknowledgements").select("policy_id").eq("employee_id", meId),
    supabase.from("declaration_forms").select("id, due_date").eq("active", true),
    supabase.from("declaration_responses").select("form_id").eq("employee_id", meId),
    supabase.from("course_enrollments").select("id", head).eq("employee_id", meId).neq("status", "completed").not("due_date", "is", null).lte("due_date", soon),
    supabase.from("claims").select("id", head).eq("employee_id", meId).eq("status", "draft"),
    supabase.from("remote_work_sessions").select("id", head).eq("employee_id", meId).is("check_out_at", null).lt("work_date", today),
  ]);
  const acked = new Set((acks.data ?? []).map((a) => a.policy_id));
  const answered = new Set((responses.data ?? []).map((r) => r.form_id));
  const pendingPolicies = (policies.data ?? []).filter((p) => !acked.has(p.id)).length;
  const pendingForms = (forms.data ?? []).filter((f) => !answered.has(f.id) && (!f.due_date || f.due_date >= today)).length;
  const todo = (label: string, href: string, count: number, hint?: string): TaskItem => ({ label, href, count, hint, group: "todo" });
  return [
    todo("Complete your self review", "/performance/reviews", review.count ?? 0, "Your review cycle is open"),
    todo("Policies to acknowledge", "/hris/policies", pendingPolicies, "Read and click I acknowledge"),
    todo("Declaration forms to fill", "/apps/declarations", pendingForms),
    todo("Courses due within 14 days", "/learning/plan", courses.count ?? 0),
    todo("Draft claims to submit", "/reimbursement/claims", drafts.count ?? 0),
    todo("Remote session left open", "/attendance/remote", openRemote.count ?? 0, "Check out to close it"),
  ];
}
