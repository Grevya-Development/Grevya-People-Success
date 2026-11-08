import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, ListChecks } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Card, EmptyState, PageHeader, ProgressBar, buttonClass } from "@/components/ui";
import { formatDate, orgToday } from "@/lib/utils";

export const metadata: Metadata = { title: "My Onboarding" };

type Row = { employee_id: string; owner: string; status: string; due_date: string | null };
type Person = { id: string; full_name: string | null; avatar_url: string | null; date_of_joining: string; designation: { title: string } | null };

/** The joinee's own checklist, or the manager's list of joinees in their team. */
export default async function MyOnboardingPage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const today = orgToday();

  // RLS limits this to me, people I manage (directly or indirectly) and, for HR, everyone.
  let query = supabase.from("onboarding_tasks").select("employee_id, owner, status, due_date");
  if (me.isHR) query = query.or(`employee_id.eq.${me.id},employee_id.in.(${await teamIds(me.id)})`);
  const { data } = await query;
  const rows = (data ?? []) as Row[];

  const mine = rows.filter((r) => r.employee_id === me.id);
  const team = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.employee_id === me.id) continue;
    team.set(r.employee_id, [...(team.get(r.employee_id) ?? []), r]);
  }
  // Only joinees with something left to do.
  const active = [...team.entries()].filter(([, list]) => list.some((t) => t.status === "pending"));

  if (mine.length && !active.length) redirect(`/onboarding/${me.id}`);

  const { data: people } = active.length
    ? await supabase.from("employees").select("id, full_name, avatar_url, date_of_joining, designation:designations(title)").in("id", active.map(([id]) => id))
    : { data: [] };
  const byId = new Map(((people ?? []) as unknown as Person[]).map((p) => [p.id, p]));

  return (
    <div>
      <PageHeader title="Onboarding" description="New joiners in your team and what's left to do." breadcrumbs={[{ label: "HRIS", href: "/hris" }, { label: "Onboarding" }]} />

      {mine.some((t) => t.status === "pending") && (
        <Card className="mb-5">
          <Link href={`/onboarding/${me.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50">
            <ListChecks className="h-5 w-5 text-primary-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">Your own onboarding</p>
              <p className="text-xs text-slate-500">{waitingText(mine.filter((t) => t.status === "pending" && t.owner === "employee").length)}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </Link>
        </Card>
      )}

      {active.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title="No one is onboarding right now"
            description="When someone joins your team, their checklist shows up here with the tasks you own."
            action={
              me.isHR ? (
                <Link href="/hris/onboarding" className={buttonClass("outline", "sm")}>
                  Open HR onboarding
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {active
              .map(([id, list]) => ({ id, list, p: byId.get(id) }))
              .sort((a, b) => (a.p?.date_of_joining ?? "").localeCompare(b.p?.date_of_joining ?? ""))
              .map(({ id, list, p }) => {
                const done = list.filter((t) => t.status !== "pending").length;
                const mineLeft = list.filter((t) => t.status === "pending" && t.owner === "manager").length;
                const overdue = list.filter((t) => t.status === "pending" && t.due_date && t.due_date < today).length;
                return (
                  <li key={id}>
                    <Link href={`/onboarding/${id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50">
                      <Avatar name={p?.full_name} src={p?.avatar_url} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{p?.full_name ?? "Employee"}</p>
                        <p className="truncate text-xs text-slate-500">
                          {p?.designation?.title ? `${p.designation.title} · ` : ""}
                          {p ? `${p.date_of_joining > today ? "Joins" : "Joined"} ${formatDate(p.date_of_joining)}` : ""}
                        </p>
                      </div>
                      <div className="hidden w-40 sm:block">
                        <ProgressBar value={(done / list.length) * 100} />
                        <p className="mt-1 text-xs text-slate-500">
                          {done}/{list.length} done{overdue ? <span className="text-red-600"> · {overdue} overdue</span> : null}
                        </p>
                      </div>
                      {mineLeft > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">{mineLeft} for you</span>}
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </Link>
                  </li>
                );
              })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function waitingText(n: number) {
  return n === 0 ? "Nothing waiting for you. HR, IT and your manager are on the rest." : `${n} task${n === 1 ? "" : "s"} waiting for you`;
}

/** HR sees everyone through RLS; on this page we still only want their own team. */
async function teamIds(managerId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("employees").select("id, manager_id").neq("status", "exited");
  const kids = new Map<string, string[]>();
  for (const e of data ?? []) if (e.manager_id) kids.set(e.manager_id, [...(kids.get(e.manager_id) ?? []), e.id]);
  const out: string[] = [];
  const stack = [...(kids.get(managerId) ?? [])];
  while (stack.length && out.length < 5000) {
    const id = stack.pop()!;
    out.push(id);
    stack.push(...(kids.get(id) ?? []));
  }
  return out.length ? out.join(",") : "00000000-0000-0000-0000-000000000000";
}
