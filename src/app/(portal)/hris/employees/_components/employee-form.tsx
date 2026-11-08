"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button, buttonClass, Card, CardBody, CardHeader, Checkbox, Field, FormGrid, Input, Select } from "@/components/ui";
import { humanize, MOBILE_HINT, MOBILE_PATTERN } from "@/lib/utils";
import { createEmployee, updateEmployee } from "../actions";
import {
  EMPLOYMENT_TYPES,
  GENDERS,
  PROBATION_MONTHS,
  ROLES,
  ROLE_LABELS,
  STATUSES,
  defaultProbationMonths,
  isAdminRole,
  type EmployeeFormValues,
  type EmployeeResult,
  type Option,
} from "../_lib";
import { CreatedSummary } from "./created-summary";

type Options = { departments: Option[]; designations: Option[]; locations: Option[]; managers: Option[] };

export function EmployeeForm({
  mode,
  values,
  options,
  canGrantAdmin = false,
}: {
  mode: "create" | "edit";
  values: EmployeeFormValues;
  options: Options;
  /** Only Super Admins may grant or remove the HR Admin / Super Admin roles. */
  canGrantAdmin?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [created, setCreated] = useState<EmployeeResult>(null);
  const [formKey, setFormKey] = useState(0);
  const [wantsLogin, setWantsLogin] = useState(true);
  const [probation, setProbation] = useState(String(defaultProbationMonths(values.employment_type)));
  const [probationTouched, setProbationTouched] = useState(false);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await (mode === "create" ? createEmployee(null, fd) : updateEmployee(null, fd));
      if (!res?.ok) {
        toast.error(res?.error ?? "Something went wrong");
        return;
      }
      toast.success(res.message ?? "Saved");
      if (res.warning) toast.warning(res.warning, { duration: 10000 });
      if (mode === "edit") {
        router.refresh();
      } else {
        setCreated(res);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  };

  if (created?.ok) {
    return (
      <CreatedSummary
        result={created}
        onAddAnother={() => {
          setCreated(null);
          setProbationTouched(false);
          setProbation(String(defaultProbationMonths(values.employment_type)));
          setFormKey((k) => k + 1);
        }}
      />
    );
  }

  const v = values;
  return (
    <form key={formKey} onSubmit={submit} className="space-y-5">
      {v.id && <input type="hidden" name="id" value={v.id} />}

      <Card>
        <CardHeader title="Basic details" description="Identity and contact information." />
        <CardBody>
          <FormGrid className="lg:grid-cols-3">
            <Field label="First name" htmlFor="first_name" required>
              <Input id="first_name" name="first_name" defaultValue={v.first_name} required maxLength={60} />
            </Field>
            <Field label="Last name" htmlFor="last_name">
              <Input id="last_name" name="last_name" defaultValue={v.last_name} maxLength={60} />
            </Field>
            <Field label="Employee code" htmlFor="employee_code" required>
              <Input id="employee_code" name="employee_code" defaultValue={v.employee_code} required maxLength={20} className="uppercase" />
            </Field>
            <Field label="Work email" htmlFor="email" required hint={mode === "edit" ? "Also updates the sign-in email if a login exists." : undefined}>
              <Input id="email" name="email" type="email" defaultValue={v.email} required maxLength={120} />
            </Field>
            <Field label="Mobile" htmlFor="phone">
              <Input id="phone" name="phone" type="tel" defaultValue={v.phone ?? ""} placeholder="+91 98765 43210" maxLength={20} inputMode="tel" pattern={MOBILE_PATTERN} title={MOBILE_HINT} />
            </Field>
            <Field label="Gender" htmlFor="gender">
              <Select id="gender" name="gender" defaultValue={v.gender ?? ""}>
                <option value="">Not specified</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {humanize(g)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date of birth" htmlFor="date_of_birth">
              <Input id="date_of_birth" name="date_of_birth" type="date" defaultValue={v.date_of_birth ?? ""} />
            </Field>
            {mode === "create" && (
              <Field label="Personal email" htmlFor="personal_email" hint="Optional. The welcome email goes here if their work mailbox isn't ready yet.">
                <Input id="personal_email" name="personal_email" type="email" maxLength={120} />
              </Field>
            )}
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Employment" description="Organisation placement, reporting line and access role." />
        <CardBody>
          <FormGrid className="lg:grid-cols-3">
            <Field label="Date of joining" htmlFor="date_of_joining" required>
              <Input id="date_of_joining" name="date_of_joining" type="date" defaultValue={v.date_of_joining} required />
            </Field>
            <Field label="Employment type" htmlFor="employment_type" required>
              <Select
                id="employment_type"
                name="employment_type"
                defaultValue={v.employment_type}
                onChange={(e) => {
                  if (mode === "create" && !probationTouched) setProbation(String(defaultProbationMonths(e.target.value)));
                }}
              >
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" htmlFor="status" required>
              <Select id="status" name="status" defaultValue={v.status}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </Field>
            {mode === "create" ? (
              <Field label="Probation" htmlFor="probation_months" hint="HR and the manager get a reminder before it ends.">
                <Select
                  id="probation_months"
                  name="probation_months"
                  value={probation}
                  onChange={(e) => {
                    setProbation(e.target.value);
                    setProbationTouched(true);
                  }}
                >
                  {PROBATION_MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {m === 0 ? "No probation" : `${m} months`}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field
                label="Probation ends on"
                htmlFor="probation_end_date"
                hint={v.confirmation_date ? "Confirmed. Changing this doesn't undo the confirmation." : "Leave blank for no probation. Move it to extend."}
              >
                <Input id="probation_end_date" name="probation_end_date" type="date" defaultValue={v.probation_end_date ?? ""} />
              </Field>
            )}
            <OptionSelect id="department_id" label="Department" value={v.department_id} options={options.departments} manageHint />
            <OptionSelect id="designation_id" label="Designation" value={v.designation_id} options={options.designations} manageHint />
            <OptionSelect id="location_id" label="Location" value={v.location_id} options={options.locations} manageHint />
            <OptionSelect id="manager_id" label="Reporting manager" value={v.manager_id} options={options.managers} emptyLabel="No manager (top level)" />
            {!canGrantAdmin && isAdminRole(v.role) ? (
              <Field label="Portal role" htmlFor="role" hint="Only a Super Admin can change admin roles.">
                <input type="hidden" name="role" value={v.role} />
                <Select id="role" value={v.role} disabled>
                  <option value={v.role}>{ROLE_LABELS[v.role] ?? v.role}</option>
                </Select>
              </Field>
            ) : (
              <Field
                label="Portal role"
                htmlFor="role"
                required
                hint={canGrantAdmin ? "HR Admins can manage every module; Super Admins also manage admin rights." : "Admin roles are granted by a Super Admin."}
              >
                <Select id="role" name="role" defaultValue={v.role}>
                  {ROLES.filter((r) => canGrantAdmin || !isAdminRole(r)).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </FormGrid>
        </CardBody>
      </Card>

      {mode === "create" && (
        <Card>
          <CardHeader title="Login access" description="Optionally create a sign-in for this employee now. You can also do it later from the edit page." />
          <CardBody className="space-y-4">
            <Checkbox name="create_login" label="Create a login for this employee" checked={wantsLogin} onChange={(e) => setWantsLogin(e.target.checked)} />
            {wantsLogin && (
              <FormGrid>
                <Field label="Temporary password" htmlFor="password" hint="Leave blank to generate a strong password. Minimum 8 characters.">
                  <Input id="password" name="password" type="text" autoComplete="new-password" minLength={8} maxLength={72} />
                </Field>
              </FormGrid>
            )}
            {wantsLogin && (
              <div>
                <Checkbox name="send_welcome" label="Email a welcome message with the login details" defaultChecked />
                <p className="ml-6 mt-1 text-xs text-slate-500">Sent to the personal email if you entered one, otherwise the work email. They choose their own password on first sign-in.</p>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Link href="/hris/employees" className={buttonClass("outline")}>
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "create" ? "Add employee" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function OptionSelect({
  id,
  label,
  value,
  options,
  emptyLabel = "— Not assigned —",
  manageHint,
}: {
  id: string;
  label: string;
  value: string | null;
  options: Option[];
  emptyLabel?: string;
  manageHint?: boolean;
}) {
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={
        manageHint && options.length === 0 ? (
          <>
            None set up yet —{" "}
            <Link href="/admin/org" className="text-primary-600 hover:underline">
              add in Org setup
            </Link>
          </>
        ) : undefined
      }
    >
      <Select id={id} name={id} defaultValue={value ?? ""}>
        <option value="">{emptyLabel}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}
