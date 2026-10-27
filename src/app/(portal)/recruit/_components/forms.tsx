import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import type { Tables } from "@/lib/database.types";
import { humanize } from "@/lib/utils";
import {
  addCandidate,
  createJob,
  referCandidate,
  scheduleInterview,
  submitInterviewFeedback,
  updateJob,
  updateCandidateNotes,
} from "../actions";
import { CANDIDATE_SOURCES, EMPLOYMENT_TYPES, INTERVIEW_MODES, JOB_STATUSES } from "./constants";
import { nowISTInput } from "./format";

type Option = { id: string; name: string };
type Person = { id: string; full_name: string | null; employee_code: string };

export function JobForm({
  job,
  departments,
  locations,
  people,
  isHR,
}: {
  job?: Tables<"job_openings">;
  departments: Option[];
  locations: Option[];
  people: Person[];
  isHR: boolean;
}) {
  return (
    <ActionForm action={job ? updateJob : createJob} resetOnSuccess={!job} className="space-y-4">
      {job && <input type="hidden" name="id" value={job.id} />}
      <Field label="Job title" htmlFor="title" required>
        <Input id="title" name="title" defaultValue={job?.title} required maxLength={150} placeholder="e.g. Senior Frontend Engineer" />
      </Field>
      <FormGrid>
        <Field label="Department" htmlFor="department_id">
          <Select id="department_id" name="department_id" defaultValue={job?.department_id ?? ""}>
            <option value="">— Select —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Location" htmlFor="location_id">
          <Select id="location_id" name="location_id" defaultValue={job?.location_id ?? ""}>
            <option value="">— Select —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Employment type" htmlFor="employment_type" required>
          <Select id="employment_type" name="employment_type" defaultValue={job?.employment_type ?? "full_time"}>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="status" required>
          <Select id="status" name="status" defaultValue={job?.status ?? "open"}>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Experience min (yrs)" htmlFor="experience_min" required>
          <Input id="experience_min" name="experience_min" type="number" min={0} max={50} step={1} defaultValue={job?.experience_min ?? 0} required />
        </Field>
        <Field label="Experience max (yrs)" htmlFor="experience_max" required>
          <Input id="experience_max" name="experience_max" type="number" min={0} max={50} step={1} defaultValue={job?.experience_max ?? 5} required />
        </Field>
        <Field label="Openings" htmlFor="openings" required>
          <Input id="openings" name="openings" type="number" min={1} max={500} step={1} defaultValue={job?.openings ?? 1} required />
        </Field>
        <Field label="Referral bonus (₹)" htmlFor="referral_bonus" hint={!isHR ? "Set by HR" : undefined}>
          <Input
            id="referral_bonus"
            name="referral_bonus"
            type="number"
            min={0}
            step={500}
            defaultValue={job?.referral_bonus ?? 0}
            disabled={!isHR}
          />
        </Field>
        <Field label="Hiring manager" htmlFor="hiring_manager_id" className="sm:col-span-2" hint={!isHR ? "Set by HR" : undefined}>
          <Select id="hiring_manager_id" name="hiring_manager_id" defaultValue={job?.hiring_manager_id ?? ""} disabled={!isHR}>
            <option value="">— None —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} ({p.employee_code})
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>
      <Field label="Description" htmlFor="description" required>
        <Textarea id="description" name="description" rows={5} defaultValue={job?.description} required placeholder="Role overview and responsibilities" />
      </Field>
      <Field label="Requirements" htmlFor="requirements" hint="One per line">
        <Textarea id="requirements" name="requirements" rows={4} defaultValue={job?.requirements ?? ""} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton>{job ? "Save changes" : "Create job"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function CandidateFields() {
  return (
    <FormGrid>
      <Field label="Full name" htmlFor="full_name" required>
        <Input id="full_name" name="full_name" required maxLength={120} />
      </Field>
      <Field label="Email" htmlFor="email" required>
        <Input id="email" name="email" type="email" required />
      </Field>
      <Field label="Phone" htmlFor="phone">
        <Input id="phone" name="phone" type="tel" placeholder="+91 98765 43210" />
      </Field>
      <Field label="Current company" htmlFor="current_company">
        <Input id="current_company" name="current_company" />
      </Field>
      <Field label="Experience (yrs)" htmlFor="experience_years">
        <Input id="experience_years" name="experience_years" type="number" min={0} max={60} step={0.5} />
      </Field>
      <Field label="LinkedIn URL" htmlFor="linkedin_url">
        <Input id="linkedin_url" name="linkedin_url" type="url" placeholder="https://linkedin.com/in/…" />
      </Field>
      <Field label="Resume" htmlFor="resume" hint="PDF, DOC, DOCX, RTF or TXT — up to 10 MB" className="sm:col-span-2">
        <Input
          id="resume"
          name="resume"
          type="file"
          accept=".pdf,.doc,.docx,.rtf,.txt"
          className="h-auto py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-[#e6e0f1] file:px-3 file:py-1 file:text-xs file:font-medium file:text-[#6a4fa3]"
        />
      </Field>
    </FormGrid>
  );
}

export function ReferForm({ jobId }: { jobId: string }) {
  return (
    <ActionForm action={referCandidate} className="space-y-4">
      <input type="hidden" name="job_id" value={jobId} />
      <CandidateFields />
      <div className="flex justify-end">
        <SubmitButton>Submit referral</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function AddCandidateForm({ jobId }: { jobId: string }) {
  return (
    <ActionForm action={addCandidate} className="space-y-4">
      <input type="hidden" name="job_id" value={jobId} />
      <Field label="Source" htmlFor="source" required>
        <Select id="source" name="source" defaultValue="direct">
          {CANDIDATE_SOURCES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </Field>
      <CandidateFields />
      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton>Add candidate</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function NotesForm({ candidateId, notes }: { candidateId: string; notes: string | null }) {
  return (
    <ActionForm action={updateCandidateNotes} resetOnSuccess={false} className="space-y-3">
      <input type="hidden" name="id" value={candidateId} />
      <Textarea name="notes" rows={5} defaultValue={notes ?? ""} maxLength={5000} placeholder="Screening notes, salary expectations, notice period…" />
      <div className="flex justify-end">
        <SubmitButton size="sm">Save notes</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function InterviewForm({ candidateId, people }: { candidateId: string; people: Person[] }) {
  return (
    <ActionForm action={scheduleInterview} className="space-y-4">
      <input type="hidden" name="candidate_id" value={candidateId} />
      <FormGrid>
        <Field label="Round" htmlFor="round_name" required>
          <Input id="round_name" name="round_name" defaultValue="Technical" required maxLength={60} list="round-names" />
          <datalist id="round-names">
            <option value="Screening" />
            <option value="Technical" />
            <option value="Technical 2" />
            <option value="Managerial" />
            <option value="HR" />
          </datalist>
        </Field>
        <Field label="Mode" htmlFor="mode" required>
          <Select id="mode" name="mode" defaultValue="video">
            {INTERVIEW_MODES.map((m) => (
              <option key={m} value={m}>
                {humanize(m)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Interviewer" htmlFor="interviewer_id" required>
          <Select id="interviewer_id" name="interviewer_id" required defaultValue="">
            <option value="" disabled>
              — Select —
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} ({p.employee_code})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date & time (IST)" htmlFor="scheduled_at" required>
          <Input id="scheduled_at" name="scheduled_at" type="datetime-local" min={nowISTInput()} required />
        </Field>
      </FormGrid>
      <div className="flex justify-end">
        <SubmitButton>Schedule interview</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function FeedbackForm({ interview }: { interview: Pick<Tables<"interviews">, "id" | "rating" | "feedback" | "result"> }) {
  return (
    <ActionForm action={submitInterviewFeedback} resetOnSuccess={false} className="space-y-4">
      <input type="hidden" name="id" value={interview.id} />
      <FormGrid>
        <Field label="Rating" htmlFor={`rating-${interview.id}`} required>
          <Select id={`rating-${interview.id}`} name="rating" defaultValue={interview.rating ?? ""} required>
            <option value="" disabled>
              — Select —
            </option>
            <option value="5">5 — Outstanding</option>
            <option value="4">4 — Strong</option>
            <option value="3">3 — Average</option>
            <option value="2">2 — Below average</option>
            <option value="1">1 — Poor</option>
          </Select>
        </Field>
        <Field label="Result" htmlFor={`result-${interview.id}`} required>
          <Select
            id={`result-${interview.id}`}
            name="result"
            defaultValue={interview.result === "pending" ? "" : interview.result}
            required
          >
            <option value="" disabled>
              — Select —
            </option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
          </Select>
        </Field>
      </FormGrid>
      <Field label="Feedback" htmlFor={`feedback-${interview.id}`} required>
        <Textarea
          id={`feedback-${interview.id}`}
          name="feedback"
          rows={5}
          defaultValue={interview.feedback ?? ""}
          required
          maxLength={5000}
          placeholder="Strengths, gaps and your recommendation"
        />
      </Field>
      <div className="flex justify-end">
        <SubmitButton>Submit feedback</SubmitButton>
      </div>
    </ActionForm>
  );
}
