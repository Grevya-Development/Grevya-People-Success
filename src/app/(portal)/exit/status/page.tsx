import Link from "next/link";
import { FileX2 } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatusBadge,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  buttonClass,
} from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { withdrawResignation } from "../actions";
import { ExitStepper, buildSteps } from "../_components/exit-stepper";
import { ClearanceList } from "../_components/clearance-list";
import { EXIT_THEME, type ResignationWithClearances } from "../_components/shared";

export const metadata = { title: "Resignation Status" };

export default async function ResignationStatusPage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const { data } = await supabase
    .from("resignations")
    .select("*, exit_clearances(id, department, status, remarks, cleared_at, cleared_by_emp:employees!exit_clearances_cleared_by_fkey(full_name))")
    .eq("employee_id", me.id)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as ResignationWithClearances[];
  const [current, ...past] = rows;

  const header = (
    <PageHeader
      title="Resignation Status"
      breadcrumbs={[{ label: "Exit" }, { label: "Resignation Status" }]}
      actions={
        <Link href="/exit/resign" className={buttonClass("outline")}>
          My resignation
        </Link>
      }
    />
  );

  if (!current) {
    return (
      <div>
        {header}
        <Card>
          <EmptyState
            icon={FileX2}
            title="No resignation on record"
            description="You haven't submitted a resignation. If you're planning to move on, start the process from My Resignation."
            action={
              <Link href="/exit/resign" className={buttonClass("primary")}>
                Go to My Resignation
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const items = current.exit_clearances ?? [];
  const cleared = items.filter((c) => c.status === "cleared").length;
  const steps = buildSteps(current, cleared, items.length);
  const withdrawable = current.status === "pending_manager" || current.status === "pending_hr";
  const showClearance = current.status === "approved" || current.status === "completed" || items.length > 0;

  return (
    <div className="space-y-5">
      {header}

      <Card className="overflow-hidden">
        <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-white ${EXIT_THEME.solid}`}>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Resignation submitted {formatDate(current.resignation_date)}</p>
            <p className="text-xs text-white/85">
              {current.reason_category} · Notice {current.notice_period_days} days
            </p>
          </div>
          <StatusBadge status={current.status} className="bg-white" />
        </div>
        <CardBody className="space-y-6">
          <ExitStepper steps={steps} />
          <dl className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-500">Resignation date</dt>
              <dd className="font-medium text-slate-800">{formatDate(current.resignation_date)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Requested last day</dt>
              <dd className="font-medium text-slate-800">{formatDate(current.requested_last_day)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Approved last day</dt>
              <dd className="font-medium text-slate-800">{current.approved_last_day ? formatDate(current.approved_last_day) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Reporting manager</dt>
              <dd className="truncate font-medium text-slate-800">{me.manager?.full_name ?? "—"}</dd>
            </div>
          </dl>
          {withdrawable && (
            <div className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-600">Changed your mind? You can withdraw until HR approves your resignation.</p>
              <ActionButton
                action={withdrawResignation}
                fields={{ id: current.id }}
                confirm="Withdraw your resignation?"
                variant="danger"
              >
                Withdraw
              </ActionButton>
            </div>
          )}
        </CardBody>
      </Card>

      {showClearance && (
        <Card>
          <CardHeader
            title="Exit clearance"
            description="Each department signs off before your exit is completed."
            action={
              <span className="text-xs font-medium text-slate-600">
                {cleared}/{items.length} cleared
              </span>
            }
          />
          <CardBody>
            {items.length > 0 && <ProgressBar value={(cleared / items.length) * 100} className="mb-2" barClassName={EXIT_THEME.bar} />}
            <ClearanceList items={items} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Past resignations" description="Earlier requests that were withdrawn, rejected or completed." />
        {past.length === 0 ? (
          <EmptyState title="No earlier resignations" className="py-8" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Submitted</TH>
                <TH>Reason</TH>
                <TH>Requested last day</TH>
                <TH>Approved last day</TH>
                <TH>Status</TH>
                <TH>Remarks</TH>
              </tr>
            </THead>
            <TBody>
              {past.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap">{formatDate(r.resignation_date)}</TD>
                  <TD>{r.reason_category}</TD>
                  <TD className="whitespace-nowrap">{formatDate(r.requested_last_day)}</TD>
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
    </div>
  );
}
