import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Building2, CalendarDays, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { Avatar, buttonClass, Card, CardBody, CardHeader, PageHeader, StatusBadge, WidgetCard } from "@/components/ui";
import { requireEmployee } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { UUID_RE } from "../../profile/_lib/shared";
import { loadEducation, loadEmployee, loadExperience, loadReports } from "../../profile/_lib/load";
import { EducationTimeline, ExperienceTimeline } from "../../profile/_components/timeline";
import { OrgHierarchy } from "../../profile/_components/org-hierarchy";

export const metadata: Metadata = { title: "Colleague Profile" };

function InfoRow({ icon: Icon, label, children }: { icon: typeof Mail; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <div className="break-words text-sm text-slate-800">{children}</div>
      </div>
    </div>
  );
}

export default async function ColleaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const me = await requireEmployee();

  // Public profile only: no employee_private data is loaded here.
  const [emp, education, experience, reports] = await Promise.all([
    loadEmployee(id),
    loadEducation(id),
    loadExperience(id),
    loadReports(id),
  ]);
  const name = emp.full_name ?? emp.first_name;
  const isSelf = emp.id === me.id;

  return (
    <div>
      <PageHeader
        title={name}
        breadcrumbs={[{ label: "Directory", href: "/directory" }, { label: name }]}
        actions={
          <>
            <Link href="/directory" className={buttonClass("outline")}>
              <ArrowLeft className="h-4 w-4" /> Directory
            </Link>
            {isSelf && (
              <Link href="/profile" className={buttonClass("primary")}>
                Edit my profile
              </Link>
            )}
            {!isSelf && me.isHR && (
              <Link href={`/profile?id=${emp.id}`} className={buttonClass("primary")}>
                View full profile
              </Link>
            )}
          </>
        }
      />

      <Card className="mb-5 overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-[#0c1755] via-[#2a3ca3] to-[#5b74d6]" />
        <div className="flex flex-col items-center gap-4 px-5 pb-5 sm:flex-row sm:items-end">
          <Avatar name={name} src={emp.avatar_url} size="xl" className="-mt-10 h-24 w-24 ring-4 ring-white" />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h2 className="text-xl font-semibold text-slate-900">{name}</h2>
              {emp.status !== "active" && <StatusBadge status={emp.status} />}
            </div>
            <p className="text-sm text-slate-500">
              {emp.designation?.title ?? "—"}
              {emp.department ? ` · ${emp.department.name}` : ""}
            </p>
            <p className="text-xs text-slate-400">{emp.employee_code}</p>
          </div>
          <div className="flex gap-2">
            <a href={`mailto:${emp.email}`} className={buttonClass("secondary", "sm")}>
              <Mail className="h-3.5 w-3.5" /> Email
            </a>
            {emp.phone && (
              <a href={`tel:${emp.phone}`} className={buttonClass("secondary", "sm")}>
                <Phone className="h-3.5 w-3.5" /> Call
              </a>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Contact & Work" />
            <CardBody className="divide-y divide-slate-100 py-2">
              <InfoRow icon={Mail} label="Email">
                <a href={`mailto:${emp.email}`} className="text-primary-600 hover:underline">
                  {emp.email}
                </a>
              </InfoRow>
              <InfoRow icon={Phone} label="Mobile">
                {emp.phone ? (
                  <a href={`tel:${emp.phone}`} className="hover:underline">
                    {emp.phone}
                  </a>
                ) : (
                  "—"
                )}
              </InfoRow>
              <InfoRow icon={Building2} label="Department">
                {emp.department?.name ?? "—"}
              </InfoRow>
              <InfoRow icon={MapPin} label="Location">
                {emp.location?.name ?? "—"}
              </InfoRow>
              <InfoRow icon={UserRound} label="Reporting Manager">
                {emp.manager ? (
                  <Link href={emp.manager.id === me.id ? "/profile" : `/directory/${emp.manager.id}`} className="text-primary-600 hover:underline">
                    {emp.manager.full_name}
                  </Link>
                ) : (
                  "—"
                )}
              </InfoRow>
              <InfoRow icon={CalendarDays} label="Joined">
                {formatDate(emp.date_of_joining)}
              </InfoRow>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="About" />
            <CardBody>
              {emp.bio ? (
                <p className="whitespace-pre-line text-sm text-slate-700">{emp.bio}</p>
              ) : (
                <p className="text-sm text-slate-400">{name} hasn&apos;t added an introduction yet.</p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <WidgetCard title="Organization Chart" color="bg-[#5b74d6]" bodyClassName="p-5">
            <OrgHierarchy
              person={{ id: emp.id, full_name: name, avatar_url: emp.avatar_url, designation: emp.designation }}
              manager={emp.manager}
              reports={reports}
              limit={8}
              selfId={me.id}
            />
          </WidgetCard>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <WidgetCard title="Education Summary" color="bg-[#5b74d6]" bodyClassName="p-5">
              <EducationTimeline items={education} />
            </WidgetCard>
            <WidgetCard title="Employment Details" color="bg-[#5b74d6]" bodyClassName="p-5">
              <ExperienceTimeline items={experience} showDescription />
            </WidgetCard>
          </div>
        </div>
      </div>
    </div>
  );
}
