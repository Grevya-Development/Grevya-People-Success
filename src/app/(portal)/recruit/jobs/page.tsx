import Link from "next/link";
import { Briefcase, Clock, Gift, MapPin, Search, Users } from "lucide-react";
import { Card, EmptyState, Input, PageHeader, Select, buttonClass } from "@/components/ui";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatCurrency, formatDate, humanize } from "@/lib/utils";
import { experienceLabel, recruitTheme } from "../_components/constants";

export const metadata = { title: "Employee Referral Jobs" };

export default async function ReferralJobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const department = sp.department ?? "";
  const location = sp.location ?? "";
  const supabase = await createClient();

  let query = supabase
    .from("job_openings")
    .select(
      "id, title, description, employment_type, experience_min, experience_max, openings, referral_bonus, created_at, department:departments(name), location:locations(name)",
    )
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (q) query = query.ilike("title", `%${q.replace(/[%_,()]/g, " ")}%`);
  if (department) query = query.eq("department_id", department);
  if (location) query = query.eq("location_id", location);

  const [jobsRes, deptRes, locRes, myRefsRes] = await Promise.all([
    query,
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("locations").select("id, name").order("name"),
    supabase.from("candidates").select("job_id").eq("referred_by", me.id),
  ]);
  const jobs = jobsRes.data ?? [];
  const myRefs = new Map<string, number>();
  for (const r of myRefsRes.data ?? []) myRefs.set(r.job_id, (myRefs.get(r.job_id) ?? 0) + 1);
  const filtered = Boolean(q || department || location);

  return (
    <div>
      <PageHeader
        title="Employee Referral Jobs"
        description="Open positions at Grevya. Refer someone you know and earn a referral bonus when they're hired."
        breadcrumbs={[{ label: "Recruit", href: "/recruit" }, { label: "Employee Referral Jobs" }]}
        actions={
          <Link href="/recruit/referrals" className={buttonClass("outline")}>
            <Users className="h-4 w-4" /> My referrals
          </Link>
        }
      />

      <Card className="mb-5 p-4">
        <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px_200px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={q} placeholder="Search job title" className="pl-9" aria-label="Search job title" />
          </div>
          <Select name="department" defaultValue={department} aria-label="Department">
            <option value="">All departments</option>
            {(deptRes.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select name="location" defaultValue={location} aria-label="Location">
            <option value="">All locations</option>
            {(locRes.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("primary", "md", "flex-1 sm:flex-none")}>
              Search
            </button>
            {filtered && (
              <Link href="/recruit/jobs" className={buttonClass("ghost")}>
                Clear
              </Link>
            )}
          </div>
        </form>
      </Card>

      <p className="mb-3 text-sm text-slate-500">
        {jobs.length} open position{jobs.length === 1 ? "" : "s"}
        {filtered ? " matching your filters" : ""}
      </p>

      {jobs.length === 0 ? (
        <Card>
          <EmptyState
            icon={Briefcase}
            title={filtered ? "No jobs match your filters" : "No open positions right now"}
            description={filtered ? "Try a different search or clear the filters." : "Check back soon — new roles are posted regularly."}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((j) => {
            const referred = myRefs.get(j.id) ?? 0;
            return (
              <Card key={j.id} className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
                <div className={cn("h-1.5", recruitTheme.solid)} />
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/recruit/jobs/${j.id}`} className="font-semibold text-slate-800 hover:text-[#6a4fa3]">
                      {j.title}
                    </Link>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", recruitTheme.pill, recruitTheme.text)}>
                      {humanize(j.employment_type)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    {j.department?.name && (
                      <span className="inline-flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5" /> {j.department.name}
                      </span>
                    )}
                    {j.location?.name && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {j.location.name}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {experienceLabel(j.experience_min, j.experience_max)}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm text-slate-600">{j.description}</p>
                  <div className="mt-auto pt-4">
                    {Number(j.referral_bonus) > 0 && (
                      <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        <Gift className="h-4 w-4" />
                        Referral bonus <span className="font-semibold">{formatCurrency(j.referral_bonus)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-400">
                        {j.openings} opening{j.openings === 1 ? "" : "s"} · Posted {formatDate(j.created_at)}
                        {referred > 0 && <span className="ml-1 text-[#6a4fa3]">· You referred {referred}</span>}
                      </span>
                      <Link href={`/recruit/jobs/${j.id}#refer`} className={buttonClass("primary", "sm")}>
                        Refer
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
