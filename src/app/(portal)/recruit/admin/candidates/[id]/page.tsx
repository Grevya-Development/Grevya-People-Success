import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Briefcase, Building2, CalendarClock, Clock, Download, Link2, Mail, Phone, Star, Trash2, UserPlus } from "lucide-react";
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, StatusBadge, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedDocumentUrl } from "@/lib/storage";
import { cn, formatDate, humanize } from "@/lib/utils";
import { cancelInterview, deleteCandidate, moveCandidateStage } from "../../../actions";
import { loadFormOptions } from "../../../_components/access";
import { STAGES, STAGE_LABEL, isStage, recruitTheme } from "../../../_components/constants";
import { InterviewForm, NotesForm } from "../../../_components/forms";
import { formatIST } from "../../../_components/format";
import { StageStepper } from "../../../_components/stage-stepper";

export const metadata = { title: "Candidate" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const me = await requireEmployee();
  const supabase = await createClient();

  // RLS-protected fetch: proves access before we sign the resume URL.
  const { data: c } = await supabase
    .from("candidates")
    .select(
      "*, job:job_openings!candidates_job_id_fkey(id, title, status, hiring_manager_id), referrer:employees!candidates_referred_by_fkey(full_name, employee_code, avatar_url)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();
  if (!me.isHR && c.job?.hiring_manager_id !== me.id) redirect("/home?denied=1");

  const [resumeUrl, { data: ivData }, options] = await Promise.all([
    signedDocumentUrl(c.resume_path),
    supabase
      .from("interviews")
      .select("id, round_name, scheduled_at, mode, rating, feedback, result, interviewer:employees!interviews_interviewer_id_fkey(full_name, avatar_url)")
      .eq("candidate_id", c.id)
      .order("scheduled_at", { ascending: true }),
    loadFormOptions(),
  ]);
  const interviews = ivData ?? [];
  const stage = isStage(c.stage) ? c.stage : "applied";
  const closed = stage === "hired" || stage === "rejected";

  const details = [
    { icon: Mail, label: "Email", value: <a href={`mailto:${c.email}`} className="text-primary-600 hover:underline">{c.email}</a> },
    { icon: Phone, label: "Phone", value: c.phone ? <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a> : "—" },
    { icon: Building2, label: "Current company", value: c.current_company ?? "—" },
    { icon: Clock, label: "Experience", value: c.experience_years != null ? `${c.experience_years} years` : "—" },
    {
      icon: Link2,
      label: "LinkedIn",
      value: c.linkedin_url ? (
        <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
          View profile
        </a>
      ) : (
        "—"
      ),
    },
    { icon: UserPlus, label: "Source", value: humanize(c.source) },
  ];

  return (
    <div>
      <PageHeader
        title={c.full_name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={stage} />
            <span>
              {c.job?.title ?? "—"} · Added {formatDate(c.created_at)}
            </span>
          </span>
        }
        breadcrumbs={[
          { label: "Recruit", href: "/recruit" },
          { label: "Recruitment", href: "/recruit/admin" },
          ...(c.job ? [{ label: c.job.title, href: `/recruit/admin/jobs/${c.job.id}` }] : []),
          { label: c.full_name },
        ]}
        actions={
          <>
            {resumeUrl && (
              <a href={resumeUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
                <Download className="h-4 w-4" /> Resume
              </a>
            )}
            {me.isHR && (
              <ActionButton
                action={deleteCandidate}
                fields={{ id: c.id }}
                variant="danger"
                size="md"
                confirm={`Delete ${c.full_name}? Their interviews will be removed too.`}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </ActionButton>
            )}
          </>
        }
      />

      <Card className="mb-6 p-4 sm:p-5">
        <StageStepper stage={stage} />
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <span className="mr-1 text-xs font-medium text-slate-500">Move to:</span>
          {STAGES.filter((s) => s !== stage).map((s) => (
            <ActionButton
              key={s}
              action={moveCandidateStage}
              fields={{ id: c.id, stage: s }}
              variant={s === "rejected" ? "ghost" : s === "hired" ? "success" : "outline"}
              className={s === "rejected" ? "text-red-600 hover:bg-red-50" : undefined}
              confirm={s === "rejected" || s === "hired" ? `Mark ${c.full_name} as ${STAGE_LABEL[s].toLowerCase()}?` : undefined}
            >
              {STAGE_LABEL[s]}
            </ActionButton>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Candidate details" />
            <dl className="divide-y divide-slate-100">
              {details.map((d) => (
                <div key={d.label} className="flex items-start justify-between gap-3 px-5 py-2.5 text-sm">
                  <dt className="flex shrink-0 items-center gap-2 text-slate-500">
                    <d.icon className="h-4 w-4" /> {d.label}
                  </dt>
                  <dd className="min-w-0 break-words text-right font-medium text-slate-800">{d.value}</dd>
                </div>
              ))}
              {c.referrer && (
                <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <dt className="text-slate-500">Referred by</dt>
                  <dd className="flex items-center gap-2 font-medium text-slate-800">
                    <Avatar name={c.referrer.full_name} src={c.referrer.avatar_url} size="xs" />
                    {c.referrer.full_name}
                  </dd>
                </div>
              )}
              {!resumeUrl && <p className="px-5 py-3 text-xs text-slate-400">No resume uploaded.</p>}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Notes" description="Visible to HR and the hiring manager" />
            <CardBody>
              <NotesForm candidateId={c.id} notes={c.notes} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Interviews" description={`${interviews.length} scheduled`} />
            {interviews.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No interviews yet" description={closed ? undefined : "Schedule the first round below."} />
            ) : (
              <ul className="divide-y divide-slate-100">
                {interviews.map((iv) => (
                  <li key={iv.id} className="px-5 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <Avatar name={iv.interviewer?.full_name} src={iv.interviewer?.avatar_url} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">
                            {iv.round_name} <span className="font-normal text-slate-500">with {iv.interviewer?.full_name ?? "—"}</span>
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatIST(iv.scheduled_at)} · {humanize(iv.mode)}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {iv.result === "pending" ? (
                          <>
                            <Badge tone="yellow">Awaiting feedback</Badge>
                            <ActionButton action={cancelInterview} fields={{ id: iv.id }} variant="ghost" confirm="Cancel this interview?">
                              Cancel
                            </ActionButton>
                          </>
                        ) : (
                          <Badge tone={iv.result === "pass" ? "green" : "red"}>{iv.result === "pass" ? "Pass" : "Fail"}</Badge>
                        )}
                      </div>
                    </div>
                    {iv.result !== "pending" && (
                      <div className="mt-3 rounded-lg bg-slate-50 p-3 sm:ml-11">
                        <div className="mb-1 flex items-center gap-0.5" aria-label={`Rating ${iv.rating} of 5`}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} className={cn("h-3.5 w-3.5", n <= (iv.rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
                          ))}
                        </div>
                        <p className="whitespace-pre-line text-sm text-slate-700">{iv.feedback}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {!closed && (
            <Card className="overflow-hidden">
              <div className={cn("flex items-center gap-2 px-5 py-3", recruitTheme.pill)}>
                <CalendarClock className={cn("h-4 w-4", recruitTheme.text)} />
                <h3 className={cn("text-sm font-semibold", recruitTheme.text)}>Schedule interview</h3>
              </div>
              <CardBody>
                <InterviewForm candidateId={c.id} people={options.people} />
              </CardBody>
            </Card>
          )}

          {c.job && (
            <Link href={`/recruit/admin/jobs/${c.job.id}`} className={buttonClass("ghost", "sm")}>
              <Briefcase className="h-3.5 w-3.5" /> Back to {c.job.title} pipeline
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
