import Link from "next/link";
import { Gift, Hourglass, PartyPopper, UserPlus, Users } from "lucide-react";
import { Card, EmptyState, PageHeader, StatCard, StatusBadge, buttonClass } from "@/components/ui";
import { LinkTabs } from "@/components/ui/link-tabs";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatCurrency, formatDate, humanize } from "@/lib/utils";
import { isStage, recruitTheme } from "../_components/constants";
import { StageStepper } from "../_components/stage-stepper";

export const metadata = { title: "My Referrals" };

const FILTERS = ["all", "active", "hired", "rejected"] as const;

export default async function MyReferralsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireEmployee();
  const { tab: rawTab } = await searchParams;
  const tab = (FILTERS as readonly string[]).includes(rawTab ?? "") ? (rawTab as (typeof FILTERS)[number]) : "all";
  const supabase = await createClient();

  const { data } = await supabase
    .from("candidates")
    .select(
      "id, full_name, email, current_company, stage, source, created_at, updated_at, job:job_openings!candidates_job_id_fkey(id, title, status, referral_bonus)",
    )
    .eq("referred_by", me.id)
    .order("created_at", { ascending: false });
  const all = data ?? [];

  const active = all.filter((r) => r.stage !== "hired" && r.stage !== "rejected");
  const hired = all.filter((r) => r.stage === "hired");
  const rejected = all.filter((r) => r.stage === "rejected");
  const bonus = hired.reduce((s, r) => s + Number(r.job?.referral_bonus ?? 0), 0);
  const list = tab === "active" ? active : tab === "hired" ? hired : tab === "rejected" ? rejected : all;

  return (
    <div>
      <PageHeader
        title="My Referrals"
        description="Track every candidate you've referred as they move through hiring."
        breadcrumbs={[{ label: "Recruit", href: "/recruit" }, { label: "My Referrals" }]}
        actions={
          <Link href="/recruit/jobs" className={buttonClass("primary")}>
            <UserPlus className="h-4 w-4" /> Refer someone
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total referrals" value={all.length} icon={Users} tone={cn(recruitTheme.pill, recruitTheme.text)} />
        <StatCard label="In process" value={active.length} icon={Hourglass} tone="bg-sky-50 text-sky-600" />
        <StatCard label="Hired" value={hired.length} icon={PartyPopper} tone="bg-emerald-50 text-emerald-600" />
        <StatCard label="Bonus eligible" value={formatCurrency(bonus)} icon={Gift} tone="bg-amber-50 text-amber-600" />
      </div>

      <LinkTabs
        tabs={[
          { label: "All", href: "/recruit/referrals", count: all.length },
          { label: "In process", href: "/recruit/referrals?tab=active", count: active.length },
          { label: "Hired", href: "/recruit/referrals?tab=hired", count: hired.length },
          { label: "Not selected", href: "/recruit/referrals?tab=rejected", count: rejected.length },
        ]}
      />

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={UserPlus}
            title={all.length === 0 ? "You haven't referred anyone yet" : "Nothing here"}
            description={all.length === 0 ? "Browse open roles and refer people you'd love to work with." : "No referrals in this category."}
            action={
              all.length === 0 && (
                <Link href="/recruit/jobs" className={buttonClass("secondary", "sm")}>
                  Browse referral jobs
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {list.map((r) => {
            const stage = isStage(r.stage) ? r.stage : "applied";
            const bonusAmt = Number(r.job?.referral_bonus ?? 0);
            return (
              <Card key={r.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 lg:w-72 lg:shrink-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-slate-800">{r.full_name}</p>
                      <StatusBadge status={stage} />
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {r.email}
                      {r.current_company ? ` · ${r.current_company}` : ""}
                    </p>
                    <p className="mt-1 text-sm">
                      {r.job ? (
                        <Link href={`/recruit/jobs/${r.job.id}`} className="font-medium text-[#6a4fa3] hover:underline">
                          {r.job.title}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {r.job && r.job.status !== "open" && <span className="ml-1 text-xs text-slate-400">({humanize(r.job.status)})</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Referred {formatDate(r.created_at)} · Updated {formatDate(r.updated_at)}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <StageStepper stage={stage} />
                  </div>
                  <div className="lg:w-48 lg:shrink-0 lg:text-right">
                    {stage === "hired" ? (
                      bonusAmt > 0 ? (
                        <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                          <Gift className="h-4 w-4" />
                          <span>
                            Eligible for <span className="font-semibold">{formatCurrency(bonusAmt)}</span>
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-emerald-700">Hired — no bonus on this role</span>
                      )
                    ) : stage === "rejected" ? (
                      <span className="text-xs text-slate-500">Not selected this time</span>
                    ) : (
                      <span className="text-xs text-slate-500">
                        {bonusAmt > 0 ? <>Bonus {formatCurrency(bonusAmt)} on hire</> : "In progress"}
                      </span>
                    )}
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
