import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, Clock, Gift, MapPin, UserCheck, Users } from "lucide-react";
import { Card, CardBody, CardHeader, PageHeader, StatusBadge, buttonClass } from "@/components/ui";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatCurrency, formatDate, humanize } from "@/lib/utils";
import { experienceLabel, recruitTheme } from "../../_components/constants";
import { ReferForm } from "../../_components/forms";

export const metadata = { title: "Job details" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const me = await requireEmployee();
  const supabase = await createClient();

  const [{ data: job }, { data: myRefs }] = await Promise.all([
    supabase
      .from("job_openings")
      .select(
        "*, department:departments(name), location:locations(name), hiring_manager:employees!job_openings_hiring_manager_id_fkey(full_name)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("candidates").select("id, full_name, stage, created_at").eq("job_id", id).eq("referred_by", me.id).order("created_at", { ascending: false }),
  ]);
  if (!job) notFound();

  const canManage = me.isHR || job.hiring_manager_id === me.id;
  const requirements = (job.requirements ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);

  const facts = [
    { icon: Briefcase, label: "Department", value: job.department?.name ?? "—" },
    { icon: MapPin, label: "Location", value: job.location?.name ?? "—" },
    { icon: Clock, label: "Experience", value: experienceLabel(job.experience_min, job.experience_max) },
    { icon: Users, label: "Openings", value: String(job.openings) },
    { icon: UserCheck, label: "Hiring manager", value: job.hiring_manager?.full_name ?? "—" },
  ];

  return (
    <div>
      <PageHeader
        title={job.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={job.status} />
            <span>
              {humanize(job.employment_type)} · Posted {formatDate(job.created_at)}
            </span>
          </span>
        }
        breadcrumbs={[
          { label: "Recruit", href: "/recruit" },
          { label: "Employee Referral Jobs", href: "/recruit/jobs" },
          { label: job.title },
        ]}
        actions={
          canManage && (
            <Link href={`/recruit/admin/jobs/${job.id}`} className={buttonClass("outline")}>
              Manage pipeline
            </Link>
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="About the role" />
            <CardBody>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{job.description}</p>
              {requirements.length > 0 && (
                <>
                  <h4 className="mb-2 mt-5 text-sm font-semibold text-slate-800">Requirements</h4>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {requirements.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </>
              )}
            </CardBody>
          </Card>

          <Card id="refer" className="scroll-mt-24">
            <CardHeader title="Refer a candidate" description="Share their details and resume — the recruiting team will take it from there." />
            <CardBody>
              {job.status === "open" ? (
                <ReferForm jobId={job.id} />
              ) : (
                <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  This position is {humanize(job.status).toLowerCase()} and isn&apos;t accepting referrals right now.
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className={cn("px-4 py-3", recruitTheme.pill)}>
              <p className={cn("text-xs font-medium", recruitTheme.text)}>Referral bonus</p>
              <p className="mt-0.5 flex items-center gap-2 text-2xl font-semibold text-slate-900">
                <Gift className={cn("h-5 w-5", recruitTheme.text)} />
                {Number(job.referral_bonus) > 0 ? formatCurrency(job.referral_bonus) : "—"}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">Paid when your referral is hired.</p>
            </div>
            <dl className="divide-y divide-slate-100">
              {facts.map((f) => (
                <div key={f.label} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <dt className="flex items-center gap-2 text-slate-500">
                    <f.icon className="h-4 w-4" /> {f.label}
                  </dt>
                  <dd className="text-right font-medium text-slate-800">{f.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Your referrals for this job" />
            {(myRefs ?? []).length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">You haven&apos;t referred anyone for this role yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {(myRefs ?? []).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{r.full_name}</p>
                      <p className="text-xs text-slate-500">Referred {formatDate(r.created_at)}</p>
                    </div>
                    <StatusBadge status={r.stage} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
