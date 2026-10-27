import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Lock } from "lucide-react";
import { buttonClass, Card, CardBody, CardHeader, Field, FormGrid, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { orgToday } from "@/lib/utils";
import { resolveTarget, loadEmployee, loadPrivate } from "../_lib/load";
import { BLOOD_GROUPS, GENDERS, MARITAL_STATUSES, mask, profileHref } from "../_lib/shared";
import { updatePersonal, updatePrivate } from "../actions";
import { AvatarUploader } from "../_components/avatar-uploader";

export const metadata: Metadata = { title: "Edit Personal Details" };

export default async function PersonalPage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const { id } = await searchParams;
  const { targetId, isSelf } = await resolveTarget(id);
  const [emp, priv] = await Promise.all([loadEmployee(targetId), loadPrivate(targetId)]);
  const name = emp.full_name ?? emp.first_name;
  const back = profileHref("/profile", targetId, isSelf);
  // Owners see their own sensitive values; HR editing someone else sees them masked.
  const masked = !isSelf;

  return (
    <div>
      <PageHeader
        title="Personal Details"
        description={isSelf ? "Keep your personal and statutory information up to date." : `Editing ${name}`}
        breadcrumbs={[{ label: "HRIS", href: "/hris" }, { label: isSelf ? "My Profile" : name, href: back }, { label: "Personal Details" }]}
        actions={
          <Link href={back} className={buttonClass("outline")}>
            <ArrowLeft className="h-4 w-4" /> Back to profile
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-1">
          <Card>
            <CardHeader title="Profile Photo" description="Shown across People Success and on your virtual ID." />
            <CardBody>
              <AvatarUploader employeeId={targetId} name={name} src={emp.avatar_url} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Organisation Details" description="Managed by HR." />
            <CardBody className="space-y-2 text-sm">
              {[
                ["Employee Code", emp.employee_code],
                ["Name", name],
                ["Official Email", emp.email],
                ["Department", emp.department?.name],
                ["Designation", emp.designation?.title],
                ["Location", emp.location?.name],
                ["Reporting Manager", emp.manager?.full_name],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                  <span className="text-xs text-slate-500">{k}</span>
                  <span className="break-all text-right text-slate-800">{v || "—"}</span>
                </div>
              ))}
              <p className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-400">
                <Lock className="h-3 w-3" /> Raise an HR helpdesk ticket to change these.
              </p>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader title="Personal Information" />
            <CardBody>
              <ActionForm action={updatePersonal} resetOnSuccess={false} successMessage="Personal details updated">
                <input type="hidden" name="employee_id" value={targetId} />
                <FormGrid>
                  <Field label="Mobile Number" htmlFor="phone">
                    <Input id="phone" name="phone" type="tel" defaultValue={emp.phone ?? ""} placeholder="+91 98765 43210" maxLength={20} />
                  </Field>
                  <Field label="Date of Birth" htmlFor="date_of_birth">
                    <Input id="date_of_birth" name="date_of_birth" type="date" defaultValue={emp.date_of_birth ?? ""} max={orgToday()} />
                  </Field>
                  <Field label="Gender" htmlFor="gender">
                    <Select id="gender" name="gender" defaultValue={emp.gender ?? ""}>
                      <option value="">Select</option>
                      {GENDERS.map((g) => (
                        <option key={g.value} value={g.value}>
                          {g.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Blood Group" htmlFor="blood_group">
                    <Select id="blood_group" name="blood_group" defaultValue={emp.blood_group ?? ""}>
                      <option value="">Select</option>
                      {BLOOD_GROUPS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Marital Status" htmlFor="marital_status">
                    <Select id="marital_status" name="marital_status" defaultValue={emp.marital_status ?? ""}>
                      <option value="">Select</option>
                      {MARITAL_STATUSES.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="About Me" htmlFor="bio" className="sm:col-span-2" hint="Shown on your directory profile. Max 1000 characters.">
                    <Textarea id="bio" name="bio" rows={4} maxLength={1000} defaultValue={emp.bio ?? ""} placeholder="A few lines about your work and interests" />
                  </Field>
                </FormGrid>
                <div className="mt-5 flex justify-end">
                  <SubmitButton>Save personal details</SubmitButton>
                </div>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Private & Statutory Details"
              description={
                masked
                  ? "Sensitive values are masked. Leave PAN, Aadhaar and account number blank to keep them unchanged."
                  : "Visible only to you and HR."
              }
            />
            <CardBody>
              <ActionForm action={updatePrivate} resetOnSuccess={masked} successMessage="Private details updated">
                <input type="hidden" name="employee_id" value={targetId} />
                {masked && <input type="hidden" name="keep_sensitive" value="1" />}
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#3753b8]">Contact</h4>
                <FormGrid>
                  <Field label="Personal Email" htmlFor="personal_email">
                    <Input id="personal_email" name="personal_email" type="email" defaultValue={priv?.personal_email ?? ""} maxLength={120} />
                  </Field>
                  <div className="hidden sm:block" />
                  <Field label="Address" htmlFor="address" className="sm:col-span-2">
                    <Textarea id="address" name="address" rows={2} maxLength={500} defaultValue={priv?.address ?? ""} />
                  </Field>
                  <Field label="Emergency Contact Name" htmlFor="emergency_contact_name">
                    <Input id="emergency_contact_name" name="emergency_contact_name" defaultValue={priv?.emergency_contact_name ?? ""} maxLength={100} />
                  </Field>
                  <Field label="Emergency Contact Phone" htmlFor="emergency_contact_phone">
                    <Input id="emergency_contact_phone" name="emergency_contact_phone" type="tel" defaultValue={priv?.emergency_contact_phone ?? ""} maxLength={20} />
                  </Field>
                </FormGrid>

                <h4 className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wider text-[#3753b8]">Statutory &amp; Bank</h4>
                <FormGrid>
                  <Field label="PAN" htmlFor="pan_number" hint="Format: ABCDE1234F">
                    <Input
                      id="pan_number"
                      name="pan_number"
                      className="uppercase"
                      maxLength={10}
                      defaultValue={masked ? "" : (priv?.pan_number ?? "")}
                      placeholder={masked && priv?.pan_number ? mask(priv.pan_number) : "ABCDE1234F"}
                    />
                  </Field>
                  <Field label="Aadhaar (last 4 digits)" htmlFor="aadhaar_last4">
                    <Input
                      id="aadhaar_last4"
                      name="aadhaar_last4"
                      inputMode="numeric"
                      maxLength={4}
                      defaultValue={masked ? "" : (priv?.aadhaar_last4 ?? "")}
                      placeholder={masked && priv?.aadhaar_last4 ? "••••" : "1234"}
                    />
                  </Field>
                  <Field label="Bank Name" htmlFor="bank_name">
                    <Input id="bank_name" name="bank_name" defaultValue={priv?.bank_name ?? ""} maxLength={100} />
                  </Field>
                  <Field label="Account Number" htmlFor="bank_account">
                    <Input
                      id="bank_account"
                      name="bank_account"
                      inputMode="numeric"
                      maxLength={20}
                      defaultValue={masked ? "" : (priv?.bank_account ?? "")}
                      placeholder={masked && priv?.bank_account ? mask(priv.bank_account) : ""}
                    />
                  </Field>
                  <Field label="IFSC" htmlFor="ifsc" hint="Format: HDFC0001234">
                    <Input id="ifsc" name="ifsc" className="uppercase" maxLength={11} defaultValue={priv?.ifsc ?? ""} />
                  </Field>
                  <Field label="UAN" htmlFor="uan" hint="12-digit Universal Account Number">
                    <Input id="uan" name="uan" inputMode="numeric" maxLength={12} defaultValue={priv?.uan ?? ""} />
                  </Field>
                </FormGrid>
                <div className="mt-5 flex justify-end">
                  <SubmitButton>Save private details</SubmitButton>
                </div>
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
