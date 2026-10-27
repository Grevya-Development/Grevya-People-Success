import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, Mail, MapPin, Phone, Building2, ShieldAlert } from "lucide-react";
import { Avatar, Card, PageHeader, ProgressRing, StatusBadge, WidgetCard } from "@/components/ui";
import { profileCompletion } from "@/lib/profile";
import { formatDate, humanize } from "@/lib/utils";
import { resolveTarget, loadEmployee, loadPrivate, loadEducation, loadExperience, loadReports } from "./_lib/load";
import { mask, profileHref, EMPLOYMENT_LABELS, MARITAL_STATUSES } from "./_lib/shared";
import { EducationTimeline, ExperienceTimeline } from "./_components/timeline";
import { OrgHierarchy } from "./_components/org-hierarchy";
import { IdCardDialog } from "./_components/id-card-dialog";

export const metadata: Metadata = { title: "My Profile" };

const STRIP = "bg-[#5b74d6]";

function SectionTitle({ title, href }: { title: string; href: string }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-[15px] font-semibold text-slate-800">{title}</h2>
      <Link href={href} className="inline-flex items-center gap-0.5 text-xs font-medium text-[#3753b8] hover:underline">
        View <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 break-words text-sm text-slate-800">{value || "—"}</p>
    </div>
  );
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const { id } = await searchParams;
  const { me, targetId, isSelf } = await resolveTarget(id);

  const [emp, priv, education, experience, reports] = await Promise.all([
    loadEmployee(targetId),
    loadPrivate(targetId),
    loadEducation(targetId),
    loadExperience(targetId),
    loadReports(targetId),
  ]);

  const name = emp.full_name ?? `${emp.first_name} ${emp.last_name}`.trim();
  const completion = profileCompletion(emp, priv, education.length, experience.length);
  const href = (p: string) => profileHref(p, targetId, isSelf);
  const ringColor = completion.percent >= 80 ? "#16a34a" : completion.percent >= 50 ? "#f59e0b" : "#ef4444";
  const marital = MARITAL_STATUSES.find((m) => m.value === emp.marital_status)?.label ?? emp.marital_status;

  return (
    <div>
      <PageHeader
        title={isSelf ? "Profile" : `${name}'s Profile`}
        breadcrumbs={[{ label: "HRIS", href: "/hris" }, ...(isSelf ? [] : [{ label: "Employee List", href: "/hris/employees" }]), { label: isSelf ? "My Profile" : name }]}
        actions={
          !isSelf && me.isHR ? (
            <Link href={`/hris/employees/${targetId}/edit`} className="text-sm font-medium text-[#3753b8] hover:underline">
              Edit organisation details
            </Link>
          ) : undefined
        }
      />

      {!isSelf && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          You are viewing and editing this employee&apos;s profile as HR. Sensitive details are masked.
        </div>
      )}

      {/* Completion */}
      <Card className="mb-5 flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <ProgressRing value={completion.percent} size={72} stroke={7} color={ringColor}>
          <span className="text-sm font-bold text-slate-800">{completion.percent}%</span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">
            {completion.percent === 100 ? "Profile complete — great job!" : "Profile completion"}
          </p>
          {completion.missing.length > 0 ? (
            <>
              <p className="mt-0.5 text-xs text-slate-500">Add the following to complete {isSelf ? "your" : "this"} profile:</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {completion.missing.map((m) => (
                  <Link
                    key={m}
                    href={m === "Education" ? href("/profile/education") : m === "Work experience" ? href("/profile/experience") : href("/profile/personal")}
                    className="rounded-full bg-[#dce5fa] px-2.5 py-0.5 text-[11px] font-medium text-[#3753b8] hover:bg-[#c9d7f7]"
                  >
                    + {m}
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-0.5 text-xs text-slate-500">All profile sections are filled in.</p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Personal Details */}
        <section>
          <SectionTitle title="Personal Details" href={href("/profile/personal")} />
          <WidgetCard
            title="Personal Details"
            color={STRIP}
            action={
              <IdCardDialog
                data={{
                  name,
                  code: emp.employee_code,
                  designation: emp.designation?.title ?? null,
                  department: emp.department?.name ?? null,
                  bloodGroup: emp.blood_group,
                  emergencyPhone: priv?.emergency_contact_phone ?? null,
                  avatarUrl: emp.avatar_url,
                  location: emp.location?.name ?? null,
                }}
              />
            }
          >
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <Avatar name={name} src={emp.avatar_url} size="xl" className="h-24 w-24 ring-4 ring-[#dce5fa]" />
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <p className="text-lg font-semibold text-slate-900">{name}</p>
                  {emp.status !== "active" && <StatusBadge status={emp.status} />}
                </div>
                <p className="text-sm text-slate-500">
                  {emp.employee_code} | {emp.designation?.title ?? "—"}
                </p>
                <a href={`mailto:${emp.email}`} className="mt-1 inline-flex items-center gap-1.5 break-all text-sm text-[#3753b8] hover:underline">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {emp.email}
                </a>
                <div className="mt-3 grid grid-cols-1 gap-2 text-left text-sm sm:grid-cols-1">
                  <p className="flex items-center gap-2 text-slate-700">
                    <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="w-24 shrink-0 text-xs text-slate-500">Mobile</span>
                    {emp.phone ? <a href={`tel:${emp.phone}`} className="hover:underline">{emp.phone}</a> : "—"}
                  </p>
                  <p className="flex items-center gap-2 text-slate-700">
                    <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="w-24 shrink-0 text-xs text-slate-500">Department</span>
                    {emp.department?.name ?? "—"}
                  </p>
                  <p className="flex items-center gap-2 text-slate-700">
                    <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="w-24 shrink-0 text-xs text-slate-500">Location</span>
                    {emp.location?.name ?? "—"}
                  </p>
                </div>
              </div>
            </div>
          </WidgetCard>
        </section>

        {/* Educational Background */}
        <section>
          <SectionTitle title="Educational Background" href={href("/profile/education")} />
          <WidgetCard title="Education Summary" color={STRIP} bodyClassName="p-5">
            <EducationTimeline items={education} emptyHint={isSelf ? "Add your degrees and certifications." : undefined} />
          </WidgetCard>
        </section>

        {/* Professional Experience */}
        <section>
          <SectionTitle title="Professional Experience" href={href("/profile/experience")} />
          <WidgetCard title="Employment Details" color={STRIP} bodyClassName="p-5">
            <ExperienceTimeline items={experience} emptyHint={isSelf ? "Add your previous employers." : undefined} />
          </WidgetCard>
        </section>

        {/* Organization Hierarchy */}
        <section>
          <SectionTitle title="Organization Hierarchy" href="/hris/org-chart" />
          <WidgetCard title="Organization Chart" color={STRIP} bodyClassName="p-5">
            <OrgHierarchy
              person={{ id: emp.id, full_name: name, avatar_url: emp.avatar_url, designation: emp.designation }}
              manager={emp.manager}
              reports={reports}
              selfId={me.id}
            />
          </WidgetCard>
        </section>
      </div>

      {/* Additional details */}
      <section className="mt-5">
        <SectionTitle title="Additional Information" href={href("/profile/personal")} />
        <Card className="overflow-hidden">
          <div className="grid grid-cols-1 divide-y divide-slate-100 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <div className="p-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#3753b8]">Personal</h3>
              <div className="grid grid-cols-2 gap-4">
                <Detail label="Date of Birth" value={emp.date_of_birth ? formatDate(emp.date_of_birth) : null} />
                <Detail label="Gender" value={humanize(emp.gender)} />
                <Detail label="Blood Group" value={emp.blood_group} />
                <Detail label="Marital Status" value={marital} />
                <Detail label="Date of Joining" value={formatDate(emp.date_of_joining)} />
                <Detail label="Employment Type" value={EMPLOYMENT_LABELS[emp.employment_type] ?? humanize(emp.employment_type)} />
                <div className="col-span-2">
                  <Detail label="About Me" value={emp.bio ? <span className="whitespace-pre-line">{emp.bio}</span> : null} />
                </div>
              </div>
            </div>
            <div className="p-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#3753b8]">Private &amp; Statutory</h3>
              <div className="grid grid-cols-2 gap-4">
                <Detail label="Personal Email" value={priv?.personal_email} />
                <Detail
                  label="Emergency Contact"
                  value={priv?.emergency_contact_name ? `${priv.emergency_contact_name} (${priv.emergency_contact_phone ?? "—"})` : null}
                />
                <div className="col-span-2">
                  <Detail label="Address" value={priv?.address ? <span className="whitespace-pre-line">{priv.address}</span> : null} />
                </div>
                <Detail label="PAN" value={priv?.pan_number ? mask(priv.pan_number) : null} />
                <Detail label="Aadhaar" value={priv?.aadhaar_last4 ? `XXXX XXXX ${priv.aadhaar_last4}` : null} />
                <Detail label="Bank" value={priv?.bank_name} />
                <Detail label="Account Number" value={priv?.bank_account ? mask(priv.bank_account) : null} />
                <Detail label="IFSC" value={priv?.ifsc} />
                <Detail label="UAN" value={priv?.uan ? mask(priv.uan) : null} />
              </div>
              <p className="mt-4 text-[11px] text-slate-400">Visible only to {isSelf ? "you" : "this employee"} and HR.</p>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
