import type { Tables } from "@/lib/database.types";
import { Field, FormGrid, Input, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { orgToday } from "@/lib/utils";
import { saveEducation, saveExperience } from "../actions";

export function EducationForm({ employeeId, row }: { employeeId: string; row?: Tables<"employee_education"> }) {
  return (
    <ActionForm action={saveEducation} successMessage={row ? "Education updated" : "Education added"}>
      <input type="hidden" name="employee_id" value={employeeId} />
      {row && <input type="hidden" name="id" value={row.id} />}
      <FormGrid>
        <Field label="Degree / Qualification" required className="sm:col-span-2">
          <Input name="degree" required maxLength={150} defaultValue={row?.degree ?? ""} placeholder="B.Tech, Computer Science" />
        </Field>
        <Field label="Institution" required className="sm:col-span-2">
          <Input name="institution" required maxLength={200} defaultValue={row?.institution ?? ""} placeholder="Anna University" />
        </Field>
        <Field label="Start Date">
          <Input name="start_date" type="date" max={orgToday()} defaultValue={row?.start_date ?? ""} />
        </Field>
        <Field label="End Date" hint="Leave blank if ongoing">
          <Input name="end_date" type="date" defaultValue={row?.end_date ?? ""} />
        </Field>
        <Field label="Grade / Score">
          <Input name="grade" maxLength={50} defaultValue={row?.grade ?? ""} placeholder="8.6 CGPA / First Class" />
        </Field>
      </FormGrid>
      <div className="mt-5 flex justify-end">
        <SubmitButton>{row ? "Save changes" : "Add education"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ExperienceForm({ employeeId, row }: { employeeId: string; row?: Tables<"employee_experience"> }) {
  return (
    <ActionForm action={saveExperience} successMessage={row ? "Experience updated" : "Experience added"}>
      <input type="hidden" name="employee_id" value={employeeId} />
      {row && <input type="hidden" name="id" value={row.id} />}
      <FormGrid>
        <Field label="Company" required>
          <Input name="company" required maxLength={200} defaultValue={row?.company ?? ""} placeholder="Acme Technologies" />
        </Field>
        <Field label="Designation" required>
          <Input name="designation" required maxLength={150} defaultValue={row?.designation ?? ""} placeholder="Software Engineer" />
        </Field>
        <Field label="Start Date" required>
          <Input name="start_date" type="date" required max={orgToday()} defaultValue={row?.start_date ?? ""} />
        </Field>
        <Field label="End Date" hint="Leave blank if this is a current role">
          <Input name="end_date" type="date" defaultValue={row?.end_date ?? ""} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea name="description" rows={3} maxLength={1000} defaultValue={row?.description ?? ""} placeholder="Key responsibilities and achievements" />
        </Field>
      </FormGrid>
      <div className="mt-5 flex justify-end">
        <SubmitButton>{row ? "Save changes" : "Add experience"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
