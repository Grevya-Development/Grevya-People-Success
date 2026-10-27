import Link from "next/link";
import { Briefcase, CalendarClock, ExternalLink, FileText, Link2, Trophy, UserPlus, Users } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
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
  WidgetCard,
  buttonClass,
} from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedDocumentUrl } from "@/lib/storage";
import { cn, formatCurrency, humanize } from "@/lib/utils";
import { STAGES, STAGE_LABEL, recruitTheme } from "./_components/constants";
import { FeedbackForm } from "./_components/forms";
import { formatIST } from "./_components/format";

export const metadata = { title: "Recruit" };

export default async function RecruitHomePage() {
  const me = await requireEmployee();
  const supabase = await createClient();

  const [openJobsRes, referralsRes, interviewsRes, managedJobsRes] = await Promise.all([
    supabase.from("job_openings").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase
      .from("candidates")
      .select("id, full_name, stage, created_at, job:job_openings!candidates_job_id_fkey(id, title, referral_bonus)")
      .eq("referred_by", me.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("interviews")
      .select(
        "id, round_name, scheduled_at, mode, rating, feedback, result, candidate:candidates!interviews_candidate_id_fkey(id, full_name, email, current_company, experience_years, linkedin_url, resume_path, job:job_openings!candidates_job_id_fkey(title))",
      )
      .eq("interviewer_id", me.id)
      .order("scheduled_at", { ascending: true }),
    me.isHR
      ? supabase.from("job_openings").select("id, title, status, openings").neq("status", "closed").order("created_at", { ascending: false })
      : supabase
          .from("job_openings")
          .select("id, title, status, openings")
          .eq("hiring_manager_id", me.id)
          .neq("status", "closed")
          .order("created_at", { ascending: false }),
  ]);

  const referrals = referralsRes.data ?? [];
  const interviews = interviewsRes.data ?? [];
  const managedJobs = managedJobsRes.data ?? [];
  const isRecruiter = me.isHR || managedJobs.length > 0;

  // Pipeline counts for the jobs this person manages
  const counts = new Map<string, Record<string, number>>();
  if (managedJobs.length > 0) {
    const { data: cands } = await supabase
      .from("candidates")
      .select("job_id, stage")
      .in(
        "job_id",
        managedJobs.map((j) => j.id),
      );
    for (const c of cands ?? []) {
      const row = counts.get(c.job_id) ?? {};
      row[c.stage] = (row[c.stage] ?? 0) + 1;
      counts.set(c.job_id, row);
    }
  }

  // Resume links for interviewers (candidate rows above were returned by RLS)
  const resumeUrls = new Map<string, string>();
  await Promise.all(
    interviews.map(async (iv) => {
      if (iv.candidate?.resume_path) {
        const url = await signedDocumentUrl(iv.candidate.resume_path);
        if (url) resumeUrls.set(iv.id, url);
      }
    }),
  );

  const pendingFeedback = interviews.filter((i) => i.result === "pending");
  const completedInterviews = interviews.filter((i) => i.result !== "pending").reverse();
  const hired = referrals.filter((r) => r.stage === "hired");
  const bonusEarned = hired.reduce((s, r) => s + Number(r.job?.referral_bonus ?? 0), 0);
  const inProcess = referrals.filter((r) => r.stage !== "hired" && r.stage !== "rejected").length;

  return (
    <div>
      <PageHeader
        title="Recruit"
        description="Refer great people, track your referrals and share interview feedback."
        breadcrumbs={[{ label: "Recruit" }]}
        actions={
          <>
            <Link href="/recruit/jobs" className={buttonClass("primary")}>
              <Briefcase className="h-4 w-4" /> Referral jobs
            </Link>
            {isRecruiter && (
              <Link href="/recruit/admin" className={buttonClass("outline")}>
                <Users className="h-4 w-4" /> Recruitment admin
              </Link>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open jobs" value={openJobsRes.count ?? 0} icon={Briefcase} tone={cn(recruitTheme.pill, recruitTheme.text)} hint="Accepting referrals" />
        <StatCard label="My referrals" value={referrals.length} icon={UserPlus} tone="bg-sky-50 text-sky-600" hint={`${inProcess} in process`} />
        <StatCard
          label="Hired referrals"
          value={hired.length}
          icon={Trophy}
          tone="bg-emerald-50 text-emerald-600"
          hint={bonusEarned > 0 ? `${formatCurrency(bonusEarned)} bonus` : "No bonus yet"}
        />
        <StatCard label="Feedback due" value={pendingFeedback.length} icon={CalendarClock} tone="bg-amber-50 text-amber-600" hint="Interviews assigned to you" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <WidgetCard title="My Interviews" color={recruitTheme.solid} className="lg:col-span-2" bodyClassName="p-0">
          {interviews.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No interviews assigned" description="When you're added as an interviewer, the candidate will show up here." />
          ) : (
            <div className="divide-y divide-slate-100">
              {[...pendingFeedback, ...completedInterviews].map((iv) => {
                const c = iv.candidate;
                const past = isPast(iv.scheduled_at);
                return (
                  <div key={iv.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-800">{c?.full_name ?? "Candidate"}</p>
                        <Badge tone="purple">{iv.round_name}</Badge>
                        {iv.result === "pending" ? (
                          <Badge tone={past ? "orange" : "blue"}>{past ? "Feedback due" : "Upcoming"}</Badge>
                        ) : (
                          <Badge tone={iv.result === "pass" ? "green" : "red"}>
                            {iv.result === "pass" ? "Passed" : "Failed"} · {iv.rating}/5
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {c?.job?.title ?? "—"}
                        {c?.current_company ? ` · ${c.current_company}` : ""}
                        {c?.experience_years != null ? ` · ${c.experience_years} yrs` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatIST(iv.scheduled_at)} · {humanize(iv.mode)}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs">
                        {resumeUrls.get(iv.id) && (
                          <a href={resumeUrls.get(iv.id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline">
                            <FileText className="h-3.5 w-3.5" /> Resume
                          </a>
                        )}
                        {c?.linkedin_url && (
                          <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline">
                            <Link2 className="h-3.5 w-3.5" /> LinkedIn
                          </a>
                        )}
                      </div>
                    </div>
                    <Dialog
                      title={`Interview feedback — ${c?.full_name ?? "Candidate"}`}
                      description={`${iv.round_name} round · ${formatIST(iv.scheduled_at)}`}
                      trigger={
                        <Button size="sm" variant={iv.result === "pending" ? "primary" : "outline"}>
                          {iv.result === "pending" ? "Give feedback" : "Edit feedback"}
                        </Button>
                      }
                    >
                      <FeedbackForm interview={iv} />
                    </Dialog>
                  </div>
                );
              })}
            </div>
          )}
        </WidgetCard>

        <WidgetCard
          title="My Referrals"
          color={recruitTheme.solid}
          bodyClassName="p-0"
          action={
            <Link href="/recruit/referrals" className="text-xs font-medium text-white/90 hover:text-white">
              View all
            </Link>
          }
        >
          {referrals.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="No referrals yet"
              description="Know someone great? Refer them to an open role."
              action={
                <Link href="/recruit/jobs" className={buttonClass("secondary", "sm")}>
                  Browse jobs
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {referrals.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{r.full_name}</p>
                    <p className="truncate text-xs text-slate-500">{r.job?.title}</p>
                  </div>
                  <StatusBadge status={r.stage} />
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>
      </div>

      {isRecruiter && (
        <Card className="mt-6">
          <CardHeader
            title={me.isHR ? "Hiring pipeline" : "My jobs pipeline"}
            description={me.isHR ? "All active job openings" : "Jobs where you are the hiring manager"}
            action={
              <Link href="/recruit/admin" className={buttonClass("outline", "sm")}>
                Manage <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {managedJobs.length === 0 ? (
            <EmptyState icon={Briefcase} title="No active jobs" description="Create a job opening to start building a pipeline." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Job</TH>
                  {STAGES.map((s) => (
                    <TH key={s} className="text-center">
                      {STAGE_LABEL[s]}
                    </TH>
                  ))}
                  <TH className="text-center">Total</TH>
                </TR>
              </THead>
              <TBody>
                {managedJobs.map((j) => {
                  const row = counts.get(j.id) ?? {};
                  const total = Object.values(row).reduce((a, b) => a + b, 0);
                  return (
                    <TR key={j.id}>
                      <TD>
                        <Link href={`/recruit/admin/jobs/${j.id}`} className="font-medium text-slate-800 hover:text-primary-600">
                          {j.title}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-2">
                          <StatusBadge status={j.status} />
                          <span className="text-xs text-slate-500">{j.openings} opening{j.openings === 1 ? "" : "s"}</span>
                        </div>
                      </TD>
                      {STAGES.map((s) => (
                        <TD key={s} className="text-center">
                          {row[s] ? (
                            <span
                              className={cn(
                                "inline-flex min-w-7 items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold",
                                s === "hired" ? "bg-emerald-50 text-emerald-700" : s === "rejected" ? "bg-red-50 text-red-600" : cn(recruitTheme.pill, recruitTheme.text),
                              )}
                            >
                              {row[s]}
                            </span>
                          ) : (
                            <span className="text-slate-300">0</span>
                          )}
                        </TD>
                      ))}
                      <TD className="text-center font-semibold text-slate-800">{total}</TD>
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

function isPast(ts: string) {
  return new Date(ts).getTime() < Date.now();
}
