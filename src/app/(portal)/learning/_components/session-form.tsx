import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { saveTrainingSession } from "../calendar-actions";
import { toISTInput } from "../_lib/time";

type Session = {
  id: string;
  title: string;
  description: string | null;
  trainer: string;
  starts_at: string;
  ends_at: string;
  mode: string;
  location: string | null;
  meeting_link: string | null;
  capacity: number;
  course_id: string | null;
};

/** HR: schedule / edit a training session. Date-times are entered in IST. */
export function SessionForm({ session, courses }: { session?: Session; courses: { id: string; title: string }[] }) {
  return (
    <ActionForm action={saveTrainingSession} className="space-y-4" resetOnSuccess={!session}>
      {session && <input type="hidden" name="id" value={session.id} />}
      <FormGrid>
        <Field label="Title" required className="sm:col-span-2">
          <Input name="title" required maxLength={200} defaultValue={session?.title} placeholder="e.g. Hands-on: Building RAG pipelines" />
        </Field>
        <Field label="Trainer" required>
          <Input name="trainer" required maxLength={120} defaultValue={session?.trainer} placeholder="Name of the trainer" />
        </Field>
        <Field label="Capacity" required>
          <Input type="number" name="capacity" min={1} max={10000} step={1} required defaultValue={session?.capacity ?? 25} />
        </Field>
        <Field label="Starts (IST)" required>
          <Input type="datetime-local" name="starts_at" required defaultValue={toISTInput(session?.starts_at)} />
        </Field>
        <Field label="Ends (IST)" required>
          <Input type="datetime-local" name="ends_at" required defaultValue={toISTInput(session?.ends_at)} />
        </Field>
        <Field label="Mode" required>
          <Select name="mode" defaultValue={session?.mode ?? "virtual"}>
            <option value="virtual">Virtual / webinar</option>
            <option value="in_person">In person</option>
          </Select>
        </Field>
        <Field label="Linked course" hint="Optional">
          <Select name="course_id" defaultValue={session?.course_id ?? ""}>
            <option value="">None</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Location" hint="Required for in-person sessions">
          <Input name="location" maxLength={200} defaultValue={session?.location ?? ""} placeholder="e.g. Bangalore office · Board room" />
        </Field>
        <Field label="Meeting link" hint="Required for virtual sessions">
          <Input type="url" name="meeting_link" defaultValue={session?.meeting_link ?? ""} placeholder="https://meet.google.com/…" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea name="description" rows={3} maxLength={4000} defaultValue={session?.description ?? ""} placeholder="Agenda, prerequisites, who should attend" />
        </Field>
      </FormGrid>
      <div className="flex justify-end border-t border-slate-100 pt-4">
        <SubmitButton>{session ? "Save changes" : "Schedule session"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
