import Link from "next/link";
import { CalendarClock, FileSignature, IdCard, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Avatar, Card, CardBody, CardHeader, EmptyState, PageHeader, StatusBadge, WidgetCard, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { ResignForm } from "../_components/resign-form";
import { FormSection } from "../_components/form-section";
import { ResignationDetails } from "../_components/resignation-details";
import { getResignInfo, type ResignInfo } from "../_lib/resign-info";
import { withdrawResignation } from "../actions";
import { EXIT_THEME, OPEN_STATUSES } from "../_components/shared";

export const metadata = { title: "My Resignation" };

export default async function ResignPage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const { data: open } = await supabase
    .from("resignations")
    .select("*")
    .eq("employee_id", me.id)
    .in("status", [...OPEN_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const info = await getResignInfo(supabase, me);

  return (
    <div>
      <PageHeader
        title="My Resignation"
        breadcrumbs={[{ label: "Exit" }, { label: "My Resignation" }]}
        actions={
          <Link href="/exit/status" className={buttonClass("outline")}>
            Resignation status
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {me.status === "exited" ? (
            <Card>
              <EmptyState icon={UserX} title="Your exit is complete" description="Your separation has been processed. Contact HR for any further documents." />
            </Card>
          ) : open ? (
            <Card className="overflow-hidden">
              <div className={`h-1.5 ${EXIT_THEME.solid}`} />
              <CardHeader
                title="Your resignation is in progress"
                description={`Submitted on ${formatDate(open.resignation_date)}`}
                action={<StatusBadge status={open.status} />}
              />
              <CardBody className="space-y-4">
                <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-slate-500">Reason</dt>
                    <dd className="font-medium text-slate-800">{open.reason_category}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Requested last day</dt>
                    <dd className="font-medium text-slate-800">{formatDate(open.requested_last_day)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Approved last day</dt>
                    <dd className="font-medium text-slate-800">{open.approved_last_day ? formatDate(open.approved_last_day) : "Awaiting HR"}</dd>
                  </div>
                </dl>
                <ResignationDetails r={open} />
                <div>
                  <p className="text-xs text-slate-500">Resignee comment</p>
                  <p className="mt-1 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{open.reason}</p>
                </div>
                {open.manager_remarks && (
                  <p className="text-xs text-slate-600">
                    <span className="font-medium">Manager remarks:</span> {open.manager_remarks}
                  </p>
                )}
                {open.hr_remarks && (
                  <p className="text-xs text-slate-600">
                    <span className="font-medium">HR remarks:</span> {open.hr_remarks}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
                  <Link href="/exit/status" className={buttonClass("outline")}>
                    Track status
                  </Link>
                  {(open.status === "pending_manager" || open.status === "pending_hr") && (
                    <ActionButton
                      action={withdrawResignation}
                      fields={{ id: open.id }}
                      confirm="Withdraw your resignation? Your manager and HR will see it as withdrawn."
                      variant="danger"
                      size="md"
                    >
                      Withdraw resignation
                    </ActionButton>
                  )}
                </div>
                {open.status === "approved" && (
                  <p className="text-xs text-slate-500">
                    Your resignation has been approved and can no longer be withdrawn here. Please speak to HR if your plans have changed.
                  </p>
                )}
              </CardBody>
            </Card>
          ) : (
            <div className="space-y-5">
              <EmployeeInfo info={info} />
              <ResignForm
                today={info.today}
                relievingDate={info.relievingDate}
                noticeDays={info.noticeDays}
                defaultEmail={info.personalEmail ?? info.officialEmail}
                defaultPhone={(info.phone ?? "").replace(/\D/g, "").slice(-10)}
              />
            </div>
          )}
        </div>

        <div className="space-y-5">
          <WidgetCard title="Who will review" color={EXIT_THEME.solid}>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {me.manager ? (
                  <Avatar name={me.manager.full_name} src={me.manager.avatar_url} size="sm" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <UserCheck className="h-4 w-4" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">Reporting manager</p>
                  <p className="truncate text-sm font-medium text-slate-800">{me.manager?.full_name ?? "HR (no manager assigned)"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full ${EXIT_THEME.pill} ${EXIT_THEME.text}`}>
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs text-slate-500">Final approval</p>
                  <p className="text-sm font-medium text-slate-800">HR team</p>
                </div>
              </div>
            </div>
          </WidgetCard>

          <Card>
            <CardHeader title="How it works" />
            <CardBody>
              <ol className="space-y-3 text-sm">
                {[
                  { icon: FileSignature, t: "Submit", d: "Share your reason and preferred last working day." },
                  { icon: UserCheck, t: "Approvals", d: "Your manager, then HR, review the request." },
                  { icon: CalendarClock, t: `Notice period`, d: `Standard notice is ${info.noticeDays} days; HR confirms your last day.` },
                  { icon: ShieldCheck, t: "Clearance", d: "IT, Finance, Admin, HR and your manager sign off before exit." },
                ].map((s) => (
                  <li key={s.t} className="flex gap-3">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${EXIT_THEME.pill} ${EXIT_THEME.text}`}>
                      <s.icon className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <p className="font-medium text-slate-800">{s.t}</p>
                      <p className="text-xs text-slate-500">{s.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function EmployeeInfo({ info }: { info: ResignInfo }) {
  const items: { label: string; value: string; testId?: string }[] = [
    { label: "Employee Code", value: info.employeeCode },
    { label: "Employee Name", value: info.employeeName },
    { label: "Date of Joining", value: info.joiningLabel, testId: "doj" },
    { label: "Role", value: info.role },
    { label: "Notice Period", value: `${info.noticeDays} (D)`, testId: "notice" },
    { label: "Official Email", value: info.officialEmail },
    { label: "Personal Email", value: info.personalEmail ?? "—" },
    { label: "Confirmation Status", value: info.confirmationStatus, testId: "confirmation" },
    { label: "Relieving Date As Per Policy", value: formatDate(info.relievingDate), testId: "relieving" },
    { label: "Leave Balance on LWD", value: `Earned Leave: ${info.earnedLeaveOnLwd} Days`, testId: "leave-lwd" },
  ];
  return (
    <FormSection step={1} title="Employee Info" icon={<IdCard className="h-4 w-4 text-slate-400" />}>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2 xl:grid-cols-3">
        {items.map((i) => (
          <div key={i.label} className="min-w-0">
            <dt className="text-xs text-slate-500">{i.label}</dt>
            <dd className="mt-0.5 break-words font-medium text-slate-800" data-testid={i.testId}>
              {i.value}
            </dd>
          </div>
        ))}
      </dl>
    </FormSection>
  );
}
