import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Ban, CalendarClock, ChevronLeft, ChevronRight, ExternalLink, FileText, Pencil, Undo2, UserPlus } from "lucide-react";
import { Badge, Button, Card, PageHeader, StatusBadge, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { Dialog } from "@/components/ui/dialog";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatCurrency, formatDate, humanize } from "@/lib/utils";
import { moveCandidateStage, setJobStatus } from "../../../actions";
import { loadFormOptions } from "../../../_components/access";
import { JOB_STATUSES, PIPELINE, STAGES, STAGE_COLOR, STAGE_LABEL, experienceLabel, recruitTheme, type Stage } from "../../../_components/constants";
import { AddCandidateForm, JobForm } from "../../../_components/forms";

export const metadata = { title: "Job pipeline" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function JobPipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const me = await requireEmployee();
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("job_openings")
    .select("*, department:departments(name), location:locations(name), hiring_manager:employees!job_openings_hiring_manager_id_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!job) notFound();
  if (!me.isHR && job.hiring_manager_id !== me.id) redirect("/home?denied=1");

  const [{ data: candData }, options] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, full_name, email, current_company, experience_years, source, stage, resume_path, created_at, referrer:employees!candidates_referred_by_fkey(full_name)")
      .eq("job_id", job.id)
      .order("updated_at", { ascending: false }),
    loadFormOptions(),
  ]);
  const candidates = candData ?? [];

  const interviewCounts = new Map<string, { total: number; pending: number }>();
  if (candidates.length) {
    const { data: ivs } = await supabase
      .from("interviews")
      .select("candidate_id, result")
      .in(
        "candidate_id",
        candidates.map((c) => c.id),
      );
    for (const iv of ivs ?? []) {
      const r = interviewCounts.get(iv.candidate_id) ?? { total: 0, pending: 0 };
      r.total++;
      if (iv.result === "pending") r.pending++;
      interviewCounts.set(iv.candidate_id, r);
    }
  }

  const byStage = new Map<Stage, typeof candidates>(STAGES.map((s) => [s, []]));
  for (const c of candidates) byStage.get(c.stage as Stage)?.push(c);
  const hired = byStage.get("hired")?.length ?? 0;

  return (
    <div>
      <PageHeader
        title={job.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={job.status} />
            <span>
              {[job.department?.name, job.location?.name, experienceLabel(job.experience_min, job.experience_max), humanize(job.employment_type)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        }
        breadcrumbs={[
          { label: "Recruit", href: "/recruit" },
          { label: "Recruitment", href: "/recruit/admin" },
          { label: job.title },
        ]}
        actions={
          <>
            <Dialog
              title="Add candidate"
              description={`Add a candidate directly to ${job.title}`}
              size="lg"
              trigger={
                <Button>
                  <UserPlus className="h-4 w-4" /> Add candidate
                </Button>
              }
            >
              <AddCandidateForm jobId={job.id} />
            </Dialog>
            <Dialog
              title="Edit job opening"
              size="lg"
              trigger={
                <Button variant="outline">
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              }
            >
              <JobForm job={job} departments={options.departments} locations={options.locations} people={options.people} isHR={me.isHR} />
            </Dialog>
            <Link href={`/recruit/jobs/${job.id}`} className={buttonClass("ghost")}>
              <ExternalLink className="h-4 w-4" /> Job page
            </Link>
          </>
        }
      />

      <Card className="mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-slate-500">
            Hiring manager: <span className="font-medium text-slate-800">{job.hiring_manager?.full_name ?? "—"}</span>
          </span>
          <span className="text-slate-500">
            Hired: <span className="font-medium text-slate-800">{hired}</span> / {job.openings}
          </span>
          <span className="text-slate-500">
            Referral bonus: <span className="font-medium text-slate-800">{Number(job.referral_bonus) > 0 ? formatCurrency(job.referral_bonus) : "—"}</span>
          </span>
          <span className="text-slate-500">Posted {formatDate(job.created_at)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Set status:</span>
          {JOB_STATUSES.filter((s) => s !== job.status).map((s) => (
            <ActionButton key={s} action={setJobStatus} fields={{ id: job.id, status: s }} variant={s === "open" ? "success" : "outline"}>
              {s === "open" ? "Reopen" : humanize(s)}
            </ActionButton>
          ))}
        </div>
      </Card>

      <div className="-mx-4 overflow-x-auto px-4 pb-3 thin-scroll sm:mx-0 sm:px-0">
        <div className="flex gap-4" style={{ minWidth: `${STAGES.length * 17}rem` }}>
          {STAGES.map((stage) => {
            const list = byStage.get(stage) ?? [];
            const idx = PIPELINE.indexOf(stage);
            const prev = idx > 0 ? PIPELINE[idx - 1] : null;
            const next = idx >= 0 && idx < PIPELINE.length - 1 ? PIPELINE[idx + 1] : null;
            return (
              <section key={stage} className="flex w-64 shrink-0 flex-col rounded-xl bg-slate-100/70">
                <header className="flex items-center justify-between px-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <span className={cn("h-2.5 w-2.5 rounded-full", STAGE_COLOR[stage])} />
                    {STAGE_LABEL[stage]}
                  </span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">{list.length}</span>
                </header>
                <div className="flex flex-1 flex-col gap-2.5 px-2.5 pb-3">
                  {list.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">No candidates</p>}
                  {list.map((c) => {
                    const iv = interviewCounts.get(c.id);
                    return (
                      <Card key={c.id} className="p-3">
                        <Link href={`/recruit/admin/candidates/${c.id}`} className="block font-medium text-slate-800 hover:text-[#6a4fa3]">
                          {c.full_name}
                        </Link>
                        <p className="truncate text-xs text-slate-500">
                          {[c.current_company, c.experience_years != null ? `${c.experience_years} yrs` : null].filter(Boolean).join(" · ") || c.email}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge tone={c.source === "referral" ? "purple" : "gray"}>{humanize(c.source)}</Badge>
                          {c.resume_path && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-500" title="Resume attached">
                              <FileText className="h-3 w-3" /> CV
                            </span>
                          )}
                          {iv && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-500" title="Interviews">
                              <CalendarClock className="h-3 w-3" /> {iv.total}
                              {iv.pending > 0 && <span className="text-amber-600">({iv.pending} pending)</span>}
                            </span>
                          )}
                        </div>
                        {c.referrer?.full_name && <p className="mt-1 truncate text-[11px] text-slate-400">Referred by {c.referrer.full_name}</p>}
                        <div className="mt-2.5 flex items-center gap-1 border-t border-slate-100 pt-2.5">
                          {stage === "rejected" ? (
                            <ActionButton action={moveCandidateStage} fields={{ id: c.id, stage: "applied" }} variant="ghost" title="Restore to Applied">
                              <Undo2 className="h-3.5 w-3.5" /> Restore
                            </ActionButton>
                          ) : (
                            <>
                              {prev && (
                                <ActionButton action={moveCandidateStage} fields={{ id: c.id, stage: prev }} variant="ghost" title={`Back to ${STAGE_LABEL[prev]}`}>
                                  <ChevronLeft className="h-3.5 w-3.5" />
                                </ActionButton>
                              )}
                              {next && (
                                <ActionButton
                                  action={moveCandidateStage}
                                  fields={{ id: c.id, stage: next }}
                                  variant="secondary"
                                  className={cn("flex-1", recruitTheme.pill, recruitTheme.text, recruitTheme.pillHover)}
                                  title={`Move to ${STAGE_LABEL[next]}`}
                                >
                                  {STAGE_LABEL[next]} <ChevronRight className="h-3.5 w-3.5" />
                                </ActionButton>
                              )}
                              {stage !== "hired" && (
                                <ActionButton
                                  action={moveCandidateStage}
                                  fields={{ id: c.id, stage: "rejected" }}
                                  variant="ghost"
                                  className="ml-auto text-red-600 hover:bg-red-50"
                                  confirm={`Reject ${c.full_name}?`}
                                  title="Reject"
                                >
                                  <Ban className="h-3.5 w-3.5" />
                                </ActionButton>
                              )}
                            </>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
