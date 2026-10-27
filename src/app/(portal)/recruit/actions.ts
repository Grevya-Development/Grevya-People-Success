"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee, type CurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { uploadDocument } from "@/lib/storage";
import { str, num } from "@/lib/utils";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import {
  CANDIDATE_SOURCES,
  EMPLOYMENT_TYPES,
  INTERVIEW_MODES,
  JOB_STATUSES,
  isStage,
} from "./_components/constants";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function revalidateRecruit() {
  revalidatePath("/recruit", "layout");
}

function oneOf<T extends string>(list: readonly T[], v: string | null): T | null {
  return v && (list as readonly string[]).includes(v) ? (v as T) : null;
}

function validUrl(v: string | null) {
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Load a job and decide whether `me` may manage it (HR, or its hiring manager). */
async function jobAccess(supabase: Supabase, me: CurrentEmployee, jobId: string | null) {
  if (!jobId) return { job: null, canManage: false };
  const { data: job } = await supabase
    .from("job_openings")
    .select("id, title, status, hiring_manager_id, referral_bonus")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { job: null, canManage: false };
  return { job, canManage: me.isHR || job.hiring_manager_id === me.id };
}

/** Load a candidate (RLS-scoped) and check that `me` manages its job. */
async function candidateAccess(supabase: Supabase, me: CurrentEmployee, candidateId: string | null) {
  if (!candidateId) return { candidate: null, canManage: false };
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, job_id, stage, full_name, job:job_openings!candidates_job_id_fkey(hiring_manager_id)")
    .eq("id", candidateId)
    .maybeSingle();
  if (!candidate) return { candidate: null, canManage: false };
  const canManage = me.isHR || candidate.job?.hiring_manager_id === me.id;
  return { candidate, canManage };
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
function readJobFields(fd: FormData) {
  const title = str(fd, "title");
  const description = str(fd, "description");
  const employment_type = oneOf(EMPLOYMENT_TYPES, str(fd, "employment_type"));
  const status = oneOf(JOB_STATUSES, str(fd, "status"));
  const experience_min = num(fd, "experience_min") ?? 0;
  const experience_max = num(fd, "experience_max") ?? 0;
  const openings = num(fd, "openings") ?? 1;
  const referral_bonus = num(fd, "referral_bonus") ?? 0;

  if (!title) return { error: "Job title is required" } as const;
  if (title.length > 150) return { error: "Job title is too long" } as const;
  if (!description) return { error: "Description is required" } as const;
  if (!employment_type) return { error: "Choose an employment type" } as const;
  if (!status) return { error: "Choose a status" } as const;
  if (!Number.isInteger(experience_min) || !Number.isInteger(experience_max) || experience_min < 0 || experience_max > 50)
    return { error: "Experience must be whole years between 0 and 50" } as const;
  if (experience_min > experience_max) return { error: "Minimum experience can't exceed maximum" } as const;
  if (!Number.isInteger(openings) || openings < 1 || openings > 500) return { error: "Openings must be between 1 and 500" } as const;
  if (referral_bonus < 0 || referral_bonus > 10_000_000) return { error: "Enter a valid referral bonus" } as const;

  return {
    values: {
      title,
      description,
      requirements: str(fd, "requirements"),
      employment_type,
      status,
      experience_min,
      experience_max,
      openings,
      referral_bonus,
      department_id: str(fd, "department_id"),
      location_id: str(fd, "location_id"),
      hiring_manager_id: str(fd, "hiring_manager_id"),
    },
  } as const;
}

export async function createJob(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can create job openings");
  const parsed = readJobFields(fd);
  if ("error" in parsed) return fail(parsed.error!);
  const supabase = await createClient();
  const insert: TablesInsert<"job_openings"> = { ...parsed.values, created_by: me.id };
  const { data, error } = await supabase.from("job_openings").insert(insert).select("id").single();
  if (error) return fail(dbError(error));
  revalidateRecruit();
  return ok("Job opening created", `/recruit/admin/jobs/${data.id}`);
}

export async function updateJob(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const supabase = await createClient();
  const { job, canManage } = await jobAccess(supabase, me, str(fd, "id"));
  if (!job) return fail("Job not found");
  if (!canManage) return fail("You can only edit jobs you manage");
  const parsed = readJobFields(fd);
  if ("error" in parsed) return fail(parsed.error!);

  const update: TablesUpdate<"job_openings"> = { ...parsed.values };
  if (!me.isHR) {
    // Hiring managers may not reassign the job or change the bonus.
    update.hiring_manager_id = job.hiring_manager_id;
    update.referral_bonus = job.referral_bonus;
  }
  const { error } = await supabase.from("job_openings").update(update).eq("id", job.id);
  if (error) return fail(dbError(error));
  revalidateRecruit();
  return ok("Job opening updated");
}

export async function setJobStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const status = oneOf(JOB_STATUSES, str(fd, "status"));
  if (!status) return fail("Invalid status");
  const supabase = await createClient();
  const { job, canManage } = await jobAccess(supabase, me, str(fd, "id"));
  if (!job) return fail("Job not found");
  if (!canManage) return fail("You can only update jobs you manage");
  const { error } = await supabase.from("job_openings").update({ status }).eq("id", job.id);
  if (error) return fail(dbError(error));
  revalidateRecruit();
  return ok(`Job marked ${status.replace("_", " ")}`);
}

export async function deleteJob(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can delete job openings");
  const id = str(fd, "id");
  if (!id) return fail("Job not found");
  const supabase = await createClient();
  const { error } = await supabase.from("job_openings").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidateRecruit();
  return ok("Job opening deleted", "/recruit/admin");
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------
function readCandidateFields(fd: FormData) {
  const full_name = str(fd, "full_name");
  const email = str(fd, "email")?.toLowerCase() ?? null;
  const phone = str(fd, "phone");
  const linkedin_url = str(fd, "linkedin_url");
  const experience_years = num(fd, "experience_years");
  if (!full_name) return { error: "Candidate name is required" } as const;
  if (full_name.length > 120) return { error: "Name is too long" } as const;
  if (!email || !EMAIL_RE.test(email)) return { error: "Enter a valid email address" } as const;
  if (phone && !/^[+\d][\d\s-]{6,19}$/.test(phone)) return { error: "Enter a valid phone number" } as const;
  if (!validUrl(linkedin_url)) return { error: "LinkedIn URL must start with http(s)://" } as const;
  if (experience_years !== null && (experience_years < 0 || experience_years > 60))
    return { error: "Experience must be between 0 and 60 years" } as const;
  if (str(fd, "experience_years") !== null && experience_years === null) return { error: "Experience must be a number" } as const;
  return {
    values: {
      full_name,
      email,
      phone,
      linkedin_url,
      experience_years,
      current_company: str(fd, "current_company"),
    },
  } as const;
}

async function uploadResume(fd: FormData): Promise<{ path: string | null; error?: string }> {
  const file = fd.get("resume");
  if (file && typeof file !== "string" && file.size > 0) {
    const okType = /\.(pdf|docx?|rtf|txt)$/i.test(file.name);
    if (!okType) return { path: null, error: "Resume must be a PDF, DOC, DOCX, RTF or TXT file" };
  }
  try {
    return { path: await uploadDocument(file, "resumes") };
  } catch (e) {
    return { path: null, error: e instanceof Error ? e.message : "Upload failed" };
  }
}

export async function referCandidate(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const jobId = str(fd, "job_id");
  const supabase = await createClient();
  const { job } = await jobAccess(supabase, me, jobId);
  if (!job) return fail("Job not found");
  if (job.status !== "open") return fail("This job is no longer accepting referrals");

  const parsed = readCandidateFields(fd);
  if ("error" in parsed) return fail(parsed.error!);
  if (parsed.values.email === me.email.toLowerCase()) return fail("You can't refer yourself");

  const { data: exists, error: existsErr } = await supabase.rpc("candidate_exists", { p_job: job.id, p_email: parsed.values.email });
  if (existsErr) return fail(dbError(existsErr));
  if (exists) return fail("This candidate has already been referred for this job");

  const resume = await uploadResume(fd);
  if (resume.error) return fail(resume.error);

  const { error } = await supabase.from("candidates").insert({
    ...parsed.values,
    job_id: job.id,
    resume_path: resume.path,
    source: "referral",
    referred_by: me.id,
    stage: "applied",
  });
  if (error) return fail(dbError(error));
  revalidateRecruit();
  return ok(`Thanks! ${parsed.values.full_name} has been referred`, "/recruit/referrals");
}

export async function addCandidate(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const supabase = await createClient();
  const { job, canManage } = await jobAccess(supabase, me, str(fd, "job_id"));
  if (!job) return fail("Job not found");
  if (!canManage) return fail("You can only add candidates to jobs you manage");
  const source = oneOf(CANDIDATE_SOURCES, str(fd, "source"));
  if (!source) return fail("Choose a source");

  const parsed = readCandidateFields(fd);
  if ("error" in parsed) return fail(parsed.error!);

  const { data: exists, error: existsErr } = await supabase.rpc("candidate_exists", { p_job: job.id, p_email: parsed.values.email });
  if (existsErr) return fail(dbError(existsErr));
  if (exists) return fail("A candidate with this email already exists for this job");

  const resume = await uploadResume(fd);
  if (resume.error) return fail(resume.error);

  const { error } = await supabase.from("candidates").insert({
    ...parsed.values,
    job_id: job.id,
    resume_path: resume.path,
    source,
    stage: "applied",
    notes: str(fd, "notes"),
  });
  if (error) return fail(dbError(error));
  revalidateRecruit();
  return ok(`${parsed.values.full_name} added to the pipeline`);
}

export async function moveCandidateStage(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const stage = str(fd, "stage");
  if (!isStage(stage)) return fail("Invalid stage");
  const supabase = await createClient();
  const { candidate, canManage } = await candidateAccess(supabase, me, str(fd, "id"));
  if (!candidate) return fail("Candidate not found");
  if (!canManage) return fail("You can only move candidates on jobs you manage");
  if (candidate.stage === stage) return ok("No change");
  const { error } = await supabase.from("candidates").update({ stage }).eq("id", candidate.id);
  if (error) return fail(dbError(error));
  revalidateRecruit();
  return ok(`${candidate.full_name} moved to ${stage}`);
}

export async function updateCandidateNotes(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const notes = str(fd, "notes");
  if (notes && notes.length > 5000) return fail("Notes are too long (max 5000 characters)");
  const supabase = await createClient();
  const { candidate, canManage } = await candidateAccess(supabase, me, str(fd, "id"));
  if (!candidate) return fail("Candidate not found");
  if (!canManage) return fail("You can only edit candidates on jobs you manage");
  const { error } = await supabase.from("candidates").update({ notes }).eq("id", candidate.id);
  if (error) return fail(dbError(error));
  revalidateRecruit();
  return ok("Notes saved");
}

export async function deleteCandidate(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can delete candidates");
  const supabase = await createClient();
  const { candidate } = await candidateAccess(supabase, me, str(fd, "id"));
  if (!candidate) return fail("Candidate not found");
  const { error } = await supabase.from("candidates").delete().eq("id", candidate.id);
  if (error) return fail(dbError(error));
  revalidateRecruit();
  return ok("Candidate deleted", `/recruit/admin/jobs/${candidate.job_id}`);
}

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------
export async function scheduleInterview(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const interviewer_id = str(fd, "interviewer_id");
  const when = str(fd, "scheduled_at");
  const mode = oneOf(INTERVIEW_MODES, str(fd, "mode"));
  const round_name = str(fd, "round_name");
  if (!interviewer_id) return fail("Choose an interviewer");
  if (!when || !DATETIME_RE.test(when)) return fail("Choose a date and time");
  if (!mode) return fail("Choose an interview mode");
  if (!round_name) return fail("Round name is required");
  if (round_name.length > 60) return fail("Round name is too long");

  // Form values are entered in India time.
  const scheduled = new Date(`${when}:00+05:30`);
  if (Number.isNaN(scheduled.getTime())) return fail("Invalid date and time");
  if (scheduled.getTime() < Date.now() - 5 * 60_000) return fail("Interview time must be in the future");

  const supabase = await createClient();
  const { candidate, canManage } = await candidateAccess(supabase, me, str(fd, "candidate_id"));
  if (!candidate) return fail("Candidate not found");
  if (!canManage) return fail("You can only schedule interviews for jobs you manage");
  if (candidate.stage === "hired" || candidate.stage === "rejected") return fail(`Candidate is already ${candidate.stage}`);

  const { data: interviewer } = await supabase.from("employees").select("id, status").eq("id", interviewer_id).maybeSingle();
  if (!interviewer || interviewer.status === "exited") return fail("Choose an active employee as interviewer");

  const { error } = await supabase.from("interviews").insert({
    candidate_id: candidate.id,
    interviewer_id,
    scheduled_at: scheduled.toISOString(),
    mode,
    round_name,
  });
  if (error) return fail(dbError(error));

  if (candidate.stage === "applied" || candidate.stage === "screening") {
    await supabase.from("candidates").update({ stage: "interview" }).eq("id", candidate.id);
  }
  revalidateRecruit();
  return ok("Interview scheduled");
}

export async function cancelInterview(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const id = str(fd, "id");
  if (!id) return fail("Interview not found");
  const supabase = await createClient();
  const { data: interview } = await supabase.from("interviews").select("id, candidate_id, result").eq("id", id).maybeSingle();
  if (!interview) return fail("Interview not found");
  const { canManage } = await candidateAccess(supabase, me, interview.candidate_id);
  if (!canManage) return fail("You can only cancel interviews for jobs you manage");
  if (interview.result !== "pending") return fail("Interviews with feedback can't be cancelled");
  const { error } = await supabase.from("interviews").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidateRecruit();
  return ok("Interview cancelled");
}

export async function submitInterviewFeedback(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const id = str(fd, "id");
  const rating = num(fd, "rating");
  const feedback = str(fd, "feedback");
  const result = str(fd, "result");
  if (!id) return fail("Interview not found");
  if (rating === null || !Number.isInteger(rating) || rating < 1 || rating > 5) return fail("Choose a rating from 1 to 5");
  if (!feedback) return fail("Feedback is required");
  if (feedback.length > 5000) return fail("Feedback is too long");
  if (result !== "pass" && result !== "fail") return fail("Choose pass or fail");

  const supabase = await createClient();
  const { data: interview } = await supabase.from("interviews").select("id, interviewer_id").eq("id", id).maybeSingle();
  if (!interview) return fail("Interview not found");
  if (interview.interviewer_id !== me.id) return fail("Only the interviewer can submit feedback");

  const { error } = await supabase.from("interviews").update({ rating, feedback, result }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidateRecruit();
  return ok("Feedback submitted");
}
