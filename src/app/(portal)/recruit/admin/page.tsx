import Link from "next/link";
import { Briefcase, SquareKanban, Plus, Trash2, UserCheck, Users } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  StatCard,
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
import { Dialog } from "@/components/ui/dialog";
import { LinkTabs } from "@/components/ui/link-tabs";
import { createClient } from "@/lib/supabase/server";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { deleteJob } from "../actions";
import { requireRecruiter, loadFormOptions } from "../_components/access";
import { experienceLabel, recruitTheme } from "../_components/constants";
import { JobForm } from "../_components/forms";

export const metadata = { title: "Recruitment" };

const STATUS_TABS = ["open", "on_hold", "closed"] as const;

export default async function RecruitAdminPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const me = await requireRecruiter();
  const { status: rawStatus } = await searchParams;
  const status = (STATUS_TABS as readonly string[]).includes(rawStatus ?? "") ? rawStatus! : "all";
  const supabase = await createClient();

  let jobsQuery = supabase
    .from("job_openings")
    .select(
      "id, title, status, openings, referral_bonus, experience_min, experience_max, created_at, hiring_manager_id, department:departments(name), location:locations(name), hiring_manager:employees!job_openings_hiring_manager_id_fkey(full_name)",
    )
    .order("created_at", { ascending: false });
  if (!me.isHR) jobsQuery = jobsQuery.eq("hiring_manager_id", me.id);

  const [{ data: jobsData }, options] = await Promise.all([jobsQuery, me.isHR ? loadFormOptions() : Promise.resolve(null)]);
  const allJobs = jobsData ?? [];
  const jobs = status === "all" ? allJobs : allJobs.filter((j) => j.status === status);

  const { data: cands } = allJobs.length
    ? await supabase
        .from("candidates")
        .select("job_id, stage")
        .in(
          "job_id",
          allJobs.map((j) => j.id),
        )
    : { data: [] as { job_id: string; stage: string }[] };
  const perJob = new Map<string, { total: number; active: number; hired: number }>();
  for (const c of cands ?? []) {
    const row = perJob.get(c.job_id) ?? { total: 0, active: 0, hired: 0 };
    row.total++;
    if (c.stage === "hired") row.hired++;
    else if (c.stage !== "rejected") row.active++;
    perJob.set(c.job_id, row);
  }
  const totals = [...perJob.values()].reduce((a, r) => ({ active: a.active + r.active, hired: a.hired + r.hired }), { active: 0, hired: 0 });
  const countBy = (s: string) => allJobs.filter((j) => j.status === s).length;

  return (
    <div>
      <PageHeader
        title="Recruitment"
        description={me.isHR ? "Manage job openings, candidate pipelines and interviews." : "Pipelines for the jobs where you are the hiring manager."}
        breadcrumbs={[{ label: "Recruit", href: "/recruit" }, { label: "Recruitment" }]}
        actions={
          me.isHR &&
          options && (
            <Dialog
              title="New job opening"
              size="lg"
              trigger={
                <Button>
                  <Plus className="h-4 w-4" /> New job
                </Button>
              }
            >
              <JobForm departments={options.departments} locations={options.locations} people={options.people} isHR />
            </Dialog>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open jobs" value={countBy("open")} icon={Briefcase} tone={cn(recruitTheme.pill, recruitTheme.text)} />
        <StatCard label="On hold" value={countBy("on_hold")} icon={Briefcase} tone="bg-orange-50 text-orange-600" />
        <StatCard label="Active candidates" value={totals.active} icon={Users} tone="bg-sky-50 text-sky-600" />
        <StatCard label="Hired" value={totals.hired} icon={UserCheck} tone="bg-emerald-50 text-emerald-600" />
      </div>

      <LinkTabs
        tabs={[
          { label: "All jobs", href: "/recruit/admin", count: allJobs.length },
          { label: "Open", href: "/recruit/admin?status=open", count: countBy("open") },
          { label: "On hold", href: "/recruit/admin?status=on_hold", count: countBy("on_hold") },
          { label: "Closed", href: "/recruit/admin?status=closed", count: countBy("closed") },
        ]}
      />

      <Card>
        {jobs.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title={allJobs.length === 0 ? "No job openings yet" : "No jobs in this view"}
            description={me.isHR ? "Create a job opening to start receiving referrals." : undefined}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Job</TH>
                <TH>Status</TH>
                <TH>Hiring manager</TH>
                <TH className="text-center">Candidates</TH>
                <TH className="text-center">Hired / Openings</TH>
                <TH>Bonus</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {jobs.map((j) => {
                const c = perJob.get(j.id) ?? { total: 0, active: 0, hired: 0 };
                return (
                  <TR key={j.id}>
                    <TD className="min-w-56">
                      <Link href={`/recruit/admin/jobs/${j.id}`} className="font-medium text-slate-800 hover:text-[#6a4fa3]">
                        {j.title}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {[j.department?.name, j.location?.name, experienceLabel(j.experience_min, j.experience_max)].filter(Boolean).join(" · ")}
                      </p>
                      <p className="text-xs text-slate-400">Posted {formatDate(j.created_at)}</p>
                    </TD>
                    <TD>
                      <StatusBadge status={j.status} />
                    </TD>
                    <TD className="whitespace-nowrap">{j.hiring_manager?.full_name ?? <span className="text-slate-400">—</span>}</TD>
                    <TD className="text-center">
                      <span className="font-semibold text-slate-800">{c.total}</span>
                      <span className="block text-xs text-slate-500">{c.active} active</span>
                    </TD>
                    <TD className="text-center">
                      {c.hired} / {j.openings}
                    </TD>
                    <TD className="whitespace-nowrap">{Number(j.referral_bonus) > 0 ? formatCurrency(j.referral_bonus) : "—"}</TD>
                    <TD>
                      <div className="flex justify-end gap-2">
                        <Link href={`/recruit/admin/jobs/${j.id}`} className={buttonClass("secondary", "sm")}>
                          <SquareKanban className="h-3.5 w-3.5" /> Pipeline
                        </Link>
                        {me.isHR && (
                          <ActionButton
                            action={deleteJob}
                            fields={{ id: j.id }}
                            variant="danger"
                            confirm={`Delete "${j.title}"? All its candidates and interviews will be removed.`}
                            title="Delete job"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </ActionButton>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
