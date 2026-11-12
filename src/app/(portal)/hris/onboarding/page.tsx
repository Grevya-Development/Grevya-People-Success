import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, BadgeCheck, CalendarPlus, ListChecks, Play, Settings2, UserPlus } from "lucide-react";
import { requireHR } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Badge, Card, EmptyState, Field, PageHeader, ProgressBar, Select, StatCard, Table, TBody, TD, TH, THead, TR, Button, buttonClass } from "@/components/ui";
import { LinkTabs } from "@/components/ui/link-tabs";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { formatDate, orgToday } from "@/lib/utils";
import { deskRequestUrl } from "@/lib/service-desk";
import { startOnboarding } from "../../onboarding/actions";
import { daysBetween } from "../../onboarding/_lib";

export const metadata: Metadata = { title: "Onboarding" };

type Task = { employee_id: string; owner: string; status: string; due_date: string | null; title: string; auto_key: string | null; link: string | null; link_label: string | null };
type Emp = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  employee_code: string;
  status: string;
  date_of_joining: string;
  probation_end_date: string | null;
  confirmation_date: string | null;
  manager: { full_name: string | null } | null;
  designation: { title: string } | null;
};

export default async function HROnboardingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireHR();
  const sp = await searchParams;
  const tab = sp.tab === "completed" || sp.tab === "probation" ? sp.tab : "active";
  const supabase = await createClient();
  const today = orgToday();
  const in30 = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: taskData }, { data: probationData }, { data: everyone }] = await Promise.all([
    supabase.from("onboarding_tasks").select("employee_id, owner, status, due_date, title, auto_key, link, link_label").order("sort_order"),
    supabase
      .from("employees")
      .select("id, full_name, avatar_url, employee_code, status, date_of_joining, probation_end_date, confirmation_date, manager:manager_id(full_name), designation:designations(title)")
      .eq("status", "active")
      .not("probation_end_date", "is", null)
      .is("confirmation_date", null)
      .order("probation_end_date"),
    supabase.from("employees").select("id, full_name, employee_code").neq("status", "exited").order("full_name"),
  ]);

  const tasks = (taskData ?? []) as Task[];
  const byEmp = new Map<string, Task[]>();
  for (const t of tasks) byEmp.set(t.employee_id, [...(byEmp.get(t.employee_id) ?? []), t]);

  const ids = [...byEmp.keys()];
  const { data: empData } = ids.length
    ? await supabase
        .from("employees")
        .select("id, full_name, avatar_url, employee_code, status, date_of_joining, probation_end_date, confirmation_date, manager:manager_id(full_name), designation:designations(title)")
        .in("id", ids)
    : { data: [] };
  const emps = new Map(((empData ?? []) as unknown as Emp[]).map((e) => [e.id, e]));

  const rows = ids
    .map((id) => {
      const list = byEmp.get(id)!;
      const pending = list.filter((t) => t.status === "pending");
      const next = [...pending].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))[0];
      return {
        emp: emps.get(id),
        id,
        total: list.length,
        done: list.length - pending.length,
        overdue: pending.filter((t) => t.due_date && t.due_date < today).length,
        next,
        it: list.find((t) => t.auto_key === "it_setup"),
        complete: pending.length === 0,
      };
    })
    .filter((r) => r.emp && r.emp.status !== "exited");

  const activeRows = rows.filter((r) => !r.complete).sort((a, b) => a.emp!.date_of_joining.localeCompare(b.emp!.date_of_joining));
  const doneRows = rows.filter((r) => r.complete).sort((a, b) => b.emp!.date_of_joining.localeCompare(a.emp!.date_of_joining));
  const probation = (probationData ?? []) as unknown as Emp[];
  const startable = (everyone ?? []).filter((e) => !byEmp.has(e.id));

  const joiningThisMonth = activeRows.filter((r) => r.emp!.date_of_joining.slice(0, 7) === today.slice(0, 7)).length;
  const overdueTotal = activeRows.reduce((n, r) => n + r.overdue, 0);
  const probationSoon = probation.filter((e) => e.probation_end_date! <= in30).length;

  return (
    <div>
      <PageHeader
        title="Onboarding"
        description="Every new joiner gets a checklist automatically when you add them. Track what's left and confirm probations here."
        breadcrumbs={[{ label: "HR Admin" }, { label: "Onboarding" }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/hris/onboarding/template" className={buttonClass("outline")}>
              <Settings2 className="h-4 w-4" />
              Checklist template
            </Link>
            <Dialog
              title="Start onboarding for an existing employee"
              description="New joiners get a checklist automatically. Use this for someone added before onboarding was switched on, or a rehire."
              trigger={
                <Button variant="outline">
                  <Play className="h-4 w-4" />
                  Start for someone
                </Button>
              }
            >
              <ActionForm action={startOnboarding} className="space-y-4">
                <Field label="Employee" htmlFor="employee_id" required>
                  <Select id="employee_id" name="employee_id" required defaultValue="">
                    <option value="" disabled>
                      Choose an employee
                    </option>
                    {startable.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.full_name} ({e.employee_code})
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="flex justify-end">
                  <SubmitButton>Start onboarding</SubmitButton>
                </div>
              </ActionForm>
            </Dialog>
            <Link href="/hris/employees/new" className={buttonClass("primary")}>
              <UserPlus className="h-4 w-4" />
              Add Employee
            </Link>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Onboarding now" value={activeRows.length} icon={ListChecks} tone="bg-[#dce5fa] text-[#3753b8]" />
        <StatCard label="Joining this month" value={joiningThisMonth} icon={CalendarPlus} tone="bg-emerald-50 text-emerald-600" />
        <StatCard label="Overdue tasks" value={overdueTotal} icon={AlarmClock} tone={overdueTotal ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"} />
        <StatCard label="Probation ending in 30 days" value={probationSoon} icon={BadgeCheck} tone="bg-amber-50 text-amber-700" />
      </div>

      <LinkTabs
        tabs={[
          { label: "In progress", href: "/hris/onboarding", count: activeRows.length },
          { label: "Probation", href: "/hris/onboarding?tab=probation", count: probation.length },
          { label: "Completed", href: "/hris/onboarding?tab=completed" },
        ]}
      />

      {tab === "probation" ? (
        <Card>
          {probation.length === 0 ? (
            <EmptyState icon={BadgeCheck} title="No one is on probation" description="Probation end dates are set when you add an employee, or on their record." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Manager</TH>
                  <TH>Joined</TH>
                  <TH>Probation ends</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {probation.map((e) => {
                  const d = daysBetween(today, e.probation_end_date!);
                  return (
                    <TR key={e.id}>
                      <TD>
                        <Person e={e} />
                      </TD>
                      <TD className="text-slate-600">{e.manager?.full_name ?? "—"}</TD>
                      <TD className="text-slate-600">{formatDate(e.date_of_joining)}</TD>
                      <TD>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-slate-800">{formatDate(e.probation_end_date)}</span>
                          {d < 0 ? <Badge tone="red">Overdue by {-d}d</Badge> : d <= 14 ? <Badge tone="yellow">In {d}d</Badge> : null}
                        </div>
                      </TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/onboarding/${e.id}`} className={buttonClass("ghost", "sm")}>
                            Extend
                          </Link>
                          <Link href={`/hris/admin/letters?tab=issue&employee=${e.id}&type=confirmation`} className={buttonClass("outline", "sm")}>
                            Confirm
                          </Link>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      ) : (
        <Card>
          {(tab === "active" ? activeRows : doneRows).length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title={tab === "active" ? "No one is onboarding right now" : "No completed onboarding yet"}
              description={tab === "active" ? "Add an employee and their checklist, IT request and reminders are set up automatically." : undefined}
              action={
                tab === "active" ? (
                  <Link href="/hris/employees/new" className={buttonClass("primary", "sm")}>
                    <UserPlus className="h-4 w-4" />
                    Add Employee
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Joinee</TH>
                  <TH>Joins</TH>
                  <TH>Manager</TH>
                  <TH>Progress</TH>
                  {tab === "active" && <TH>Next up</TH>}
                  <TH>IT request</TH>
                </TR>
              </THead>
              <TBody>
                {(tab === "active" ? activeRows : doneRows).map((r) => {
                  const e = r.emp!;
                  const joinIn = daysBetween(today, e.date_of_joining);
                  return (
                    <TR key={r.id}>
                      <TD>
                        <Link href={`/onboarding/${r.id}`} className="hover:underline">
                          <Person e={e} />
                        </Link>
                      </TD>
                      <TD className="whitespace-nowrap text-slate-600">
                        {formatDate(e.date_of_joining)}
                        {joinIn > 0 && <span className="block text-xs text-slate-400">in {joinIn}d</span>}
                      </TD>
                      <TD className="text-slate-600">{e.manager?.full_name ?? "—"}</TD>
                      <TD className="min-w-36">
                        <ProgressBar value={(r.done / r.total) * 100} barClassName={r.complete ? "bg-emerald-500" : undefined} />
                        <p className="mt-1 text-xs text-slate-500">
                          {r.done}/{r.total} done
                          {r.overdue > 0 && <span className="font-medium text-red-600"> · {r.overdue} overdue</span>}
                        </p>
                      </TD>
                      {tab === "active" && (
                        <TD className="max-w-56">
                          {r.next ? (
                            <>
                              <p className="truncate text-sm text-slate-800">{r.next.title}</p>
                              {r.next.due_date && <p className={r.next.due_date < today ? "text-xs text-red-600" : "text-xs text-slate-500"}>Due {formatDate(r.next.due_date, "dd MMM")}</p>}
                            </>
                          ) : (
                            "—"
                          )}
                        </TD>
                      )}
                      <TD>
                        {r.it?.link_label ? (
                          deskRequestUrl(r.it.link, r.it.link_label) ? (
                            <a href={deskRequestUrl(r.it.link, r.it.link_label)!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:underline">
                              {r.it.link_label}
                              {r.it.status === "done" && <Badge tone="green">Done</Badge>}
                            </a>
                          ) : (
                            <span className="text-sm">{r.it.link_label}</span>
                          )
                        ) : r.it ? (
                          <span className="text-xs text-slate-500">{r.it.status === "pending" ? "Manual" : "Done"}</span>
                        ) : (
                          "—"
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}

function Person({ e }: { e: Emp }) {
  return (
    <span className="flex items-center gap-3">
      <Avatar name={e.full_name} src={e.avatar_url} size="sm" />
      <span className="min-w-0">
        <span className="block truncate font-medium text-slate-900">{e.full_name}</span>
        <span className="block truncate text-xs text-slate-500">
          {e.employee_code}
          {e.designation?.title ? ` · ${e.designation.title}` : ""}
        </span>
      </span>
    </span>
  );
}
