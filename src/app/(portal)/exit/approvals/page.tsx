import type { ReactNode } from "react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { CheckCheck, ClipboardCheck, History, Inbox } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, orgToday } from "@/lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  Field,
  Input,
  PageHeader,
  ProgressBar,
  StatusBadge,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
} from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { SubmitButton } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import { LinkTabs } from "@/components/ui/link-tabs";
import { completeExit, hrApproveResignation, managerApproveResignation, rejectResignation } from "../actions";
import { ClearanceList } from "../_components/clearance-list";
import { ResultForm } from "../_components/result-form";
import { ResignationDetails } from "../_components/resignation-details";
import { EXIT_THEME, MANAGER_CLEARANCE, type ExitEmployee, type ResignationRow } from "../_components/shared";

export const metadata = { title: "Exit Approvals" };

type Row = ResignationRow & { employee: (ExitEmployee & { manager: { full_name: string | null } | null }) | null };

const TABS = ["pending", "clearance", "completed"] as const;
type Tab = (typeof TABS)[number];

export default async function ExitApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireManager();
  const { tab: rawTab } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "pending";

  const supabase = await createClient();
  const { data } = await supabase
    .from("resignations")
    .select(
      "*, employee:employees!resignations_employee_id_fkey(id, full_name, employee_code, avatar_url, manager_id, department:departments(name), designation:designations(title), manager:manager_id(full_name)), exit_clearances(id, department, status, remarks, cleared_at, cleared_by_emp:employees!exit_clearances_cleared_by_fkey(full_name))",
    )
    .neq("employee_id", me.id)
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as unknown as Row[];

  // Which pending_manager rows may I act on as the reporting manager?
  const pendingManager = rows.filter((r) => r.status === "pending_manager");
  const actionable = new Set<string>();
  for (const r of pendingManager) {
    const mgr = r.employee?.manager_id ?? null;
    if (!me.isHR || !mgr || mgr === me.id) {
      actionable.add(r.id);
    } else {
      const { data: inChain } = await supabase.rpc("is_manager_of", { emp: r.employee_id });
      if (inChain) actionable.add(r.id);
    }
  }
  const myManagerQueue = pendingManager.filter((r) => actionable.has(r.id));
  const awaitingOtherManager = pendingManager.filter((r) => !actionable.has(r.id));
  const pendingHR = rows.filter((r) => r.status === "pending_hr");
  const inClearance = rows.filter((r) => r.status === "approved");
  const history = rows.filter((r) => ["completed", "rejected", "withdrawn"].includes(r.status));

  const pendingCount = myManagerQueue.length + (me.isHR ? pendingHR.length : 0);
  const today = orgToday();

  return (
    <div>
      <PageHeader
        title="Exit Approvals"
        description={me.isHR ? "Approve resignations, track clearances and complete exits across the organisation." : "Resignations from your team."}
        breadcrumbs={[{ label: "Exit" }, { label: "Exit Approvals" }]}
      />

      <LinkTabs
        tabs={[
          { label: "Pending", href: "/exit/approvals", count: pendingCount },
          { label: "In clearance", href: "/exit/approvals?tab=clearance", count: inClearance.length },
          { label: "Completed", href: "/exit/approvals?tab=completed", count: history.length },
        ]}
      />

      {tab === "pending" && (
        <div className="space-y-6">
          <Section title="Awaiting your approval" hint="You are the reporting manager. Approving sends the request to HR.">
            {myManagerQueue.length === 0 ? (
              <Card>
                <EmptyState icon={Inbox} title="Nothing waiting for you" description="Resignations from your reports will appear here." />
              </Card>
            ) : (
              myManagerQueue.map((r) => (
                <ResignationCard key={r.id} r={r} today={today}>
                  <ActionButton action={rejectResignation} fields={{ id: r.id }} prompt="Reason for rejecting" promptRequired variant="danger">
                    Reject
                  </ActionButton>
                  <ActionButton action={managerApproveResignation} fields={{ id: r.id }} prompt="Remarks for HR (optional)" variant="success">
                    Approve
                  </ActionButton>
                </ResignationCard>
              ))
            )}
          </Section>

          {(me.isHR || pendingHR.length > 0) && (
            <Section
              title="Awaiting HR approval"
              hint={me.isHR ? "Confirm the last working day to start the exit clearance." : "Approved by the manager, now with HR."}
            >
              {pendingHR.length === 0 ? (
                <Card>
                  <EmptyState icon={CheckCheck} title="No resignations awaiting HR" />
                </Card>
              ) : (
                pendingHR.map((r) => (
                  <ResignationCard key={r.id} r={r} today={today}>
                    {me.isHR ? (
                      <>
                        <ActionButton action={rejectResignation} fields={{ id: r.id }} prompt="Reason for rejecting" promptRequired variant="danger">
                          Reject
                        </ActionButton>
                        <Dialog
                          trigger={
                            <Button variant="success" size="sm">
                              Approve
                            </Button>
                          }
                          title={`Approve resignation — ${r.employee?.full_name ?? ""}`}
                          description="The clearance checklist starts and the employee moves to notice period."
                          size="sm"
                        >
                          <ResultForm action={hrApproveResignation} className="space-y-4">
                            <input type="hidden" name="id" value={r.id} />
                            <Field
                              label="Approved last working day"
                              htmlFor={`ald-${r.id}`}
                              required
                              hint={`Requested: ${formatDate(r.requested_last_day)} · ${r.notice_period_days}-day notice from ${formatDate(r.resignation_date)}`}
                            >
                              <Input
                                id={`ald-${r.id}`}
                                name="approved_last_day"
                                type="date"
                                required
                                min={r.resignation_date}
                                defaultValue={r.requested_last_day}
                              />
                            </Field>
                            <Field label="HR remarks" htmlFor={`hrr-${r.id}`}>
                              <Textarea id={`hrr-${r.id}`} name="remarks" rows={3} placeholder="Optional" />
                            </Field>
                            <div className="flex justify-end">
                              <SubmitButton variant="success">Approve resignation</SubmitButton>
                            </div>
                          </ResultForm>
                        </Dialog>
                      </>
                    ) : (
                      <Badge tone="orange">With HR</Badge>
                    )}
                  </ResignationCard>
                ))
              )}
            </Section>
          )}

          {me.isHR && awaitingOtherManager.length > 0 && (
            <Section title="Awaiting manager" hint="Pending with the employee's reporting manager. Shown for visibility.">
              {awaitingOtherManager.map((r) => (
                <ResignationCard key={r.id} r={r} today={today}>
                  <Badge tone="yellow">Awaiting {r.employee?.manager?.full_name ?? "manager"}</Badge>
                </ResignationCard>
              ))}
            </Section>
          )}
        </div>
      )}

      {tab === "clearance" && (
        <div className="space-y-4">
          {inClearance.length === 0 ? (
            <Card>
              <EmptyState icon={ClipboardCheck} title="No exits in clearance" description="Resignations approved by HR appear here with their clearance checklist." />
            </Card>
          ) : (
            inClearance.map((r) => {
              const items = r.exit_clearances ?? [];
              const cleared = items.filter((c) => c.status === "cleared").length;
              const allCleared = items.length > 0 && cleared === items.length;
              const lastDay = r.approved_last_day ?? r.requested_last_day;
              const daysLeft = differenceInCalendarDays(parseISO(lastDay), parseISO(today));
              return (
                <Card key={r.id} className="overflow-hidden">
                  <div className={`h-1 ${EXIT_THEME.solid}`} />
                  <CardBody className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <EmployeeHeader r={r} />
                      <div className="text-left sm:text-right">
                        <p className="text-xs text-slate-500">Last working day</p>
                        <p className="text-sm font-semibold text-slate-800">{formatDate(lastDay)}</p>
                        <p className={`text-xs ${daysLeft < 0 ? "text-red-600" : "text-slate-500"}`}>
                          {daysLeft > 0 ? `${daysLeft} days to go` : daysLeft === 0 ? "Today" : `${-daysLeft} days ago`}
                        </p>
                      </div>
                    </div>
                    <ResignationDetails r={r} />
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-600">Clearance progress</span>
                        <span className="text-slate-500">
                          {cleared}/{items.length} cleared
                        </span>
                      </div>
                      <ProgressBar value={items.length ? (cleared / items.length) * 100 : 0} barClassName={allCleared ? "bg-emerald-500!" : EXIT_THEME.bar} />
                    </div>
                    <ClearanceList
                      items={items}
                      canClear={(dept) => me.isHR || dept === MANAGER_CLEARANCE}
                      canReopen={me.isHR}
                    />
                    {me.isHR && (
                      <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-slate-500">
                          {allCleared ? "All departments have signed off." : "Complete exit is available once every department has cleared."}
                        </p>
                        <ActionButton
                          action={completeExit}
                          fields={{ id: r.id }}
                          confirm={`Complete the exit for ${r.employee?.full_name ?? "this employee"}? Their status becomes Exited.`}
                          variant="primary"
                          size="md"
                          disabled={!allCleared}
                        >
                          Complete exit
                        </ActionButton>
                      </div>
                    )}
                  </CardBody>
                </Card>
              );
            })
          )}
        </div>
      )}

      {tab === "completed" && (
        <Card>
          {history.length === 0 ? (
            <EmptyState icon={History} title="No closed resignations yet" description="Completed, rejected and withdrawn resignations are listed here." />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH>Reason</TH>
                  <TH>Submitted</TH>
                  <TH>Last working day</TH>
                  <TH>Status</TH>
                  <TH>Remarks</TH>
                </tr>
              </THead>
              <TBody>
                {history.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.employee?.full_name} src={r.employee?.avatar_url} size="sm" />
                        <div className="min-w-0">
                          <p className="whitespace-nowrap font-medium text-slate-800">{r.employee?.full_name ?? "—"}</p>
                          <p className="text-xs text-slate-500">{r.employee?.employee_code}</p>
                        </div>
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap">{r.reason_category}</TD>
                    <TD className="whitespace-nowrap">{formatDate(r.resignation_date)}</TD>
                    <TD className="whitespace-nowrap">{r.approved_last_day ? formatDate(r.approved_last_day) : "—"}</TD>
                    <TD>
                      <StatusBadge status={r.status} />
                    </TD>
                    <TD className="max-w-xs truncate text-xs text-slate-500">{r.hr_remarks ?? r.manager_remarks ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function EmployeeHeader({ r }: { r: Row }) {
  const e = r.employee;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={e?.full_name} src={e?.avatar_url} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-800">{e?.full_name ?? "Unknown employee"}</p>
        <p className="truncate text-xs text-slate-500">
          {e?.employee_code}
          {e?.designation?.title ? ` · ${e.designation.title}` : ""}
          {e?.department?.name ? ` · ${e.department.name}` : ""}
        </p>
      </div>
    </div>
  );
}

function ResignationCard({ r, today, children }: { r: Row; today: string; children: ReactNode }) {
  const notice = differenceInCalendarDays(parseISO(r.requested_last_day), parseISO(r.resignation_date));
  const short = notice < r.notice_period_days;
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <EmployeeHeader r={r} />
          <StatusBadge status={r.status} />
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Reason</dt>
            <dd className="font-medium text-slate-800">{r.reason_category}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Submitted</dt>
            <dd className="font-medium text-slate-800">{formatDate(r.resignation_date)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Requested last day</dt>
            <dd className="font-medium text-slate-800">{formatDate(r.requested_last_day)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Notice</dt>
            <dd className={short ? "font-medium text-amber-700" : "font-medium text-slate-800"}>
              {notice} of {r.notice_period_days} days{short ? " (short)" : ""}
            </dd>
          </div>
        </dl>
        <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{r.reason}</p>
        <ResignationDetails r={r} />
        {r.manager_remarks && (
          <p className="text-xs text-slate-600">
            <span className="font-medium">Manager remarks:</span> {r.manager_remarks}
            {r.manager_action_at ? <span className="text-slate-400"> · {formatDate(r.manager_action_at)}</span> : null}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-400">
            {differenceInCalendarDays(parseISO(today), parseISO(r.resignation_date))} days since submission
          </span>
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        </div>
      </CardBody>
    </Card>
  );
}
