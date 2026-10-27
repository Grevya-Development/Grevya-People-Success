import { Award, Building2, CalendarDays, ExternalLink, IndianRupee, MonitorSmartphone } from "lucide-react";
import { Badge, Field, FormGrid, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { formatCurrency, formatDate, humanize } from "@/lib/utils";
import { completeExternalTraining, requestExternalTraining } from "../external-actions";

export const TYPE_TONES = { course: "blue", certification: "purple", conference: "orange", workshop: "teal" } as const;

export type ExternalRow = {
  id: string;
  title: string;
  provider: string;
  training_type: string;
  mode: string;
  start_date: string;
  end_date: string;
  cost: number;
  justification: string;
  link: string | null;
  status: string;
  approver_remarks: string | null;
  decided_at: string | null;
  completed_at: string | null;
  completion_notes: string | null;
  created_at: string;
};

export function TrainingMeta({ t, certUrl }: { t: ExternalRow; certUrl?: string | null }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
      <Badge tone={TYPE_TONES[t.training_type as keyof typeof TYPE_TONES] ?? "gray"}>{humanize(t.training_type)}</Badge>
      <span className="inline-flex items-center gap-1">
        <Building2 className="h-3.5 w-3.5" /> {t.provider}
      </span>
      <span className="inline-flex items-center gap-1">
        <CalendarDays className="h-3.5 w-3.5" /> {formatDate(t.start_date)}
        {t.end_date !== t.start_date && ` – ${formatDate(t.end_date)}`}
      </span>
      <span className="inline-flex items-center gap-1">
        <MonitorSmartphone className="h-3.5 w-3.5" /> {humanize(t.mode)}
      </span>
      <span className="inline-flex items-center gap-1 font-medium text-slate-700">
        <IndianRupee className="h-3.5 w-3.5" /> {formatCurrency(t.cost).replace("₹", "")}
      </span>
      {t.link && (
        <a href={t.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline">
          <ExternalLink className="h-3.5 w-3.5" /> Details
        </a>
      )}
      {certUrl && (
        <a href={certUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline">
          <Award className="h-3.5 w-3.5" /> Certificate
        </a>
      )}
    </div>
  );
}

export function ExternalRequestForm({ today }: { today: string }) {
  return (
    <ActionForm action={requestExternalTraining} className="space-y-4">
      <FormGrid>
        <Field label="Training / certification title" required className="sm:col-span-2">
          <Input name="title" required maxLength={200} placeholder="e.g. AWS Certified Machine Learning – Specialty" />
        </Field>
        <Field label="Provider" required>
          <Input name="provider" required maxLength={120} placeholder="AWS, Coursera, NASSCOM…" />
        </Field>
        <Field label="Type" required>
          <Select name="training_type" defaultValue="course" required>
            <option value="course">Course</option>
            <option value="certification">Certification</option>
            <option value="conference">Conference</option>
            <option value="workshop">Workshop</option>
          </Select>
        </Field>
        <Field label="Start date" required>
          <Input type="date" name="start_date" required defaultValue={today} />
        </Field>
        <Field label="End date" required>
          <Input type="date" name="end_date" required defaultValue={today} />
        </Field>
        <Field label="Cost (INR)" required hint="Fees, exam, travel — enter 0 if free">
          <Input type="number" name="cost" min={0} step={1} required defaultValue={0} />
        </Field>
        <Field label="Mode" required>
          <Select name="mode" defaultValue="online">
            <option value="online">Online</option>
            <option value="in_person">In person</option>
            <option value="hybrid">Hybrid</option>
          </Select>
        </Field>
        <Field label="Link" className="sm:col-span-2" hint="Course page or event website (optional)">
          <Input type="url" name="link" placeholder="https://" />
        </Field>
        <Field label="Justification" required className="sm:col-span-2">
          <Textarea name="justification" rows={4} required maxLength={4000} placeholder="How will this help you and the team?" />
        </Field>
      </FormGrid>
      <div className="flex justify-end border-t border-slate-100 pt-4">
        <SubmitButton>Submit request</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function CompleteTrainingForm({ id, completed }: { id: string; completed: boolean }) {
  return (
    <ActionForm action={completeExternalTraining} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <Field label="Certificate" required={completed} hint="PDF or image, up to 10 MB">
        <Input type="file" name="certificate" accept=".pdf,image/*" required={completed} className="py-1.5" />
      </Field>
      {!completed && (
        <Field label="Notes" hint="Optional — key takeaways, score, credential ID">
          <Textarea name="completion_notes" rows={3} maxLength={2000} />
        </Field>
      )}
      <div className="flex justify-end">
        <SubmitButton>{completed ? "Upload certificate" : "Mark completed"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
