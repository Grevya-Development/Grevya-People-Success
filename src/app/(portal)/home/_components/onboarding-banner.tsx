import Link from "next/link";
import { ChevronRight, ListChecks, PartyPopper } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ProgressBar } from "@/components/ui";

/** "Welcome aboard" for joinees with tasks left, and a nudge for managers with joinees to help. */
export async function OnboardingBanner({ employeeId }: { employeeId: string }) {
  const supabase = await createClient();
  const [{ data: mine }, { data: team }] = await Promise.all([
    supabase.from("onboarding_tasks").select("owner, status").eq("employee_id", employeeId),
    supabase
      .from("onboarding_tasks")
      .select("employee_id, employee:employees!onboarding_tasks_employee_id_fkey!inner(manager_id, full_name)")
      .eq("owner", "manager")
      .eq("status", "pending")
      .eq("employee.manager_id", employeeId),
  ]);

  const own = mine ?? [];
  const ownLeft = own.filter((t) => t.status === "pending" && t.owner === "employee").length;
  const ownDone = own.filter((t) => t.status !== "pending").length;
  const joinees = new Map<string, string>();
  for (const t of team ?? []) joinees.set(t.employee_id, (t.employee as unknown as { full_name: string | null } | null)?.full_name ?? "");
  const teamTasks = team?.length ?? 0;

  if (!ownLeft && !teamTasks) return null;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {ownLeft > 0 && (
        <Link href={`/onboarding/${employeeId}`} className="flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-4 hover:bg-emerald-50">
          <PartyPopper className="h-6 w-6 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Welcome aboard! {ownLeft} onboarding task{ownLeft === 1 ? "" : "s"} for you</p>
            <ProgressBar value={own.length ? (ownDone / own.length) * 100 : 0} className="mt-2 bg-white" barClassName="bg-emerald-500" />
            <p className="mt-1 text-xs text-slate-600">
              {ownDone} of {own.length} done across HR, IT and your manager
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </Link>
      )}
      {teamTasks > 0 && (
        <Link href={joinees.size === 1 ? `/onboarding/${[...joinees.keys()][0]}` : "/onboarding"} className="flex items-center gap-4 rounded-xl border border-blue-200 bg-blue-50/60 px-5 py-4 hover:bg-blue-50">
          <ListChecks className="h-6 w-6 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">
              {teamTasks} onboarding task{teamTasks === 1 ? "" : "s"} for {joinees.size === 1 ? [...joinees.values()][0] : `${joinees.size} new joiners`}
            </p>
            <p className="mt-0.5 text-xs text-slate-600">Welcome call, buddy and first goals help them settle in.</p>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </Link>
      )}
    </div>
  );
}
