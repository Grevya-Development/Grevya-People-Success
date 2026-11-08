import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, CalendarDays, ListChecks, Play, UserRound } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, ProgressRing, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { formatDate, orgToday } from "@/lib/utils";
import { setProbation, startOnboarding } from "../actions";
import { Checklist } from "../_components/checklist";
import { daysBetween, type TaskRow } from "../_lib";

export const metadata: Metadata = { title: "Onboarding" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function OnboardingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireEmployee();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const today = orgToday();

  const [{ data: emp }, { data: rawTasks }, { data: isMgr }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, first_name, avatar_url, employee_code, status, date_of_joining, probation_end_date, confirmation_date, designation:designations(title), department:departments(name), manager:manager_id(id, full_name)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("onboarding_tasks")
      .select("id, employee_id, template_id, title, description, owner, auto_key, due_date, status, completed_at, note, link, link_label, sort_order, completer:completed_by(full_name)")
      .eq("employee_id", id)
      .order("sort_order"),
    supabase.rpc("is_manager_of", { emp: id }),
  ]);
  if (!emp) notFound();

  const viewer = { isHR: me.isHR, isManagerOfJoiner: !!isMgr, isJoiner: me.id === emp.id };
  if (!viewer.isHR && !viewer.isManagerOfJoiner && !viewer.isJoiner) notFound();

  const tasks = (rawTasks ?? []) as unknown as TaskRow[];
  const done = tasks.filter((t) => t.status !== "pending").length;
  const overdue = tasks.filter((t) => t.status === "pending" && t.due_date && t.due_date < today).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const manager = emp.manager as unknown as { id: string; full_name: string | null } | null;
  const designation = (emp.designation as unknown as { title: string } | null)?.title;
  const department = (emp.department as unknown as { name: string } | null)?.name;
  const joinIn = daysBetween(today, emp.date_of_joining);
  const onProbation = !!emp.probation_end_date && !emp.confirmation_date;

  return (
    <div>
      <PageHeader
        title={viewer.isJoiner ? "My onboarding" : `Onboarding · ${emp.full_name}`}
        description={viewer.isJoiner ? "Everything that's being set up for you, and the few things we need from you." : "Who does what before and after day one."}
        breadcrumbs={viewer.isHR ? [{ label: "HR Admin" }, { label: "Onboarding", href: "/hris/onboarding" }, { label: emp.full_name ?? "" }] : [{ label: "Onboarding", href: "/onboarding" }, { label: emp.full_name ?? "" }]}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="order-2 lg:order-1">
          {tasks.length === 0 ? (
            <Card>
              <EmptyState
                icon={ListChecks}
                title="No onboarding checklist"
                description={viewer.isHR ? "Start one to give HR, IT, the manager and the joinee their tasks." : "HR hasn't started a checklist for this person."}
                action={
                  viewer.isHR && emp.status !== "exited" ? (
                    <ActionButton action={startOnboarding} fields={{ employee_id: emp.id }} variant="primary" size="sm">
                      <Play className="h-4 w-4" />
                      Start onboarding
                    </ActionButton>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <Checklist tasks={tasks} employeeId={emp.id} joinerFirstName={emp.first_name} managerName={manager?.full_name ?? null} viewer={viewer} today={today} />
          )}
        </div>

        <aside className="order-1 space-y-5 lg:order-2">
          <Card>
            <CardBody className="space-y-4 py-5">
              <div className="flex items-center gap-3">
                <Avatar name={emp.full_name} src={emp.avatar_url} size="lg" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{emp.full_name}</p>
                  <p className="truncate text-xs text-slate-500">{[designation, department].filter(Boolean).join(" · ") || emp.employee_code}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <ProgressRing value={pct} size={64} color={pct === 100 ? "#059669" : "#2d48c8"}>
                  <span className="text-sm font-semibold text-slate-800">{pct}%</span>
                </ProgressRing>
                <div className="text-sm">
                  <p className="font-medium text-slate-800">
                    {done} of {tasks.length} tasks done
                  </p>
                  {overdue > 0 ? <p className="text-xs font-medium text-red-600">{overdue} overdue</p> : <p className="text-xs text-slate-500">Nothing overdue</p>}
                </div>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div>
                    <dt className="text-xs text-slate-500">{joinIn > 0 ? "Joins on" : "Joined on"}</dt>
                    <dd className="text-slate-800">
                      {formatDate(emp.date_of_joining)}
                      {joinIn > 0 && <span className="text-slate-500"> · in {joinIn} day{joinIn === 1 ? "" : "s"}</span>}
                      {joinIn === 0 && <span className="text-emerald-700"> · today</span>}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div>
                    <dt className="text-xs text-slate-500">Reporting manager</dt>
                    <dd className="text-slate-800">{manager?.full_name ?? "Not set"}</dd>
                  </div>
                </div>
              </dl>
              {viewer.isHR && (
                <Link href={`/hris/employees/${emp.id}/edit`} className={buttonClass("outline", "sm", "w-full")}>
                  Open employee record
                </Link>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Probation" />
            <CardBody className="space-y-3 text-sm">
              {emp.confirmation_date ? (
                <p className="flex items-center gap-2 text-slate-800">
                  <BadgeCheck className="h-4 w-4 text-emerald-600" />
                  Confirmed on {formatDate(emp.confirmation_date)}
                </p>
              ) : emp.probation_end_date ? (
                <div className="space-y-1">
                  <p className="text-slate-800">
                    {emp.probation_end_date < today ? "Ended" : "Ends"} on <span className="font-medium">{formatDate(emp.probation_end_date)}</span>
                  </p>
                  {emp.probation_end_date < today ? (
                    <Badge tone="red">Confirmation overdue</Badge>
                  ) : daysBetween(today, emp.probation_end_date) <= 14 ? (
                    <Badge tone="yellow">Review due soon</Badge>
                  ) : (
                    <Badge tone="blue">On probation</Badge>
                  )}
                </div>
              ) : (
                <p className="text-slate-500">No probation.</p>
              )}
              {viewer.isHR && onProbation && (
                <Link href={`/hris/admin/letters?tab=issue&employee=${emp.id}`} className={buttonClass("primary", "sm", "w-full")}>
                  Confirm: issue confirmation letter
                </Link>
              )}
              {viewer.isHR && !emp.confirmation_date && (
                <ActionForm action={setProbation} className="space-y-2" resetOnSuccess={false}>
                  <input type="hidden" name="employee_id" value={emp.id} />
                  <Field label={emp.probation_end_date ? "Extend or change the end date" : "Set a probation end date"} htmlFor="probation_end_date">
                    <Input id="probation_end_date" name="probation_end_date" type="date" defaultValue={emp.probation_end_date ?? ""} />
                  </Field>
                  <SubmitButton variant="outline" size="sm" className="w-full">
                    Save probation
                  </SubmitButton>
                </ActionForm>
              )}
              {!viewer.isHR && onProbation && viewer.isManagerOfJoiner && <p className="text-xs text-slate-500">HR will ask for your review before it ends.</p>}
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
