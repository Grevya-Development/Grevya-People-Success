import "server-only";
import type { CurrentEmployee } from "@/lib/auth";
import type { createClient } from "@/lib/supabase/server";
import type { GoalFormCycle, GoalFormMember, GoalFormParent, GoalWeightRow } from "./goal-form";
import { WEIGHTED_STATUSES, type Person } from "./shared";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type TeamMember = Person & { manager_id: string | null; status: string; designation: { title: string } | null };

/**
 * People in my reporting chain (direct + indirect), excluding me.
 * HR may pass scope "all" to get the whole organisation.
 */
export async function loadTeam(supabase: Supabase, me: CurrentEmployee, scope: "team" | "all" = "team"): Promise<TeamMember[]> {
  const { data } = await supabase
    .from("employees")
    .select("id, full_name, employee_code, avatar_url, manager_id, status, designation:designations(title)")
    .neq("status", "exited")
    .order("full_name");
  const all = (data ?? []) as unknown as TeamMember[];
  if (scope === "all" && me.isHR) return all.filter((e) => e.id !== me.id);

  const byManager = new Map<string, TeamMember[]>();
  for (const e of all) {
    if (!e.manager_id) continue;
    byManager.set(e.manager_id, [...(byManager.get(e.manager_id) ?? []), e]);
  }
  const out: TeamMember[] = [];
  const seen = new Set<string>([me.id]);
  const queue = [me.id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const r of byManager.get(cur) ?? []) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
      queue.push(r.id);
    }
  }
  return out.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
}

/** Everything the goal form needs: open cycles, alignable parents and weightage already used. */
export async function loadGoalFormData(
  supabase: Supabase,
  me: CurrentEmployee,
  opts: { ownerIds: string[]; parentOwnerIds: string[] },
): Promise<{ cycles: GoalFormCycle[]; parents: GoalFormParent[]; weights: GoalWeightRow[] }> {
  const phases = me.isHR ? ["draft", "goal_setting", "in_review"] : ["goal_setting", "in_review"];
  const parentOwners = [...new Set(opts.parentOwnerIds.filter(Boolean))];
  const owners = [...new Set(opts.ownerIds.filter(Boolean))];

  const [cyclesRes, orgRes, mgrRes, weightRes] = await Promise.all([
    supabase.from("review_cycles").select("id, name, status, start_date, end_date").in("status", phases).order("start_date", { ascending: false }),
    supabase.from("goals").select("id, title, employee_id, cycle_id").is("employee_id", null).in("status", ["approved", "completed"]).order("title"),
    parentOwners.length
      ? supabase
          .from("goals")
          .select("id, title, employee_id, cycle_id, owner:employees!employee_id(full_name)")
          .in("employee_id", parentOwners)
          .in("status", ["pending_approval", "approved", "completed"])
          .order("title")
      : Promise.resolve({ data: [] as { id: string; title: string; employee_id: string | null; cycle_id: string | null; owner: { full_name: string | null } | null }[] }),
    owners.length
      ? supabase.from("goals").select("id, employee_id, cycle_id, weightage").in("employee_id", owners).in("status", WEIGHTED_STATUSES)
      : Promise.resolve({ data: [] as GoalWeightRow[] }),
  ]);

  const parents: GoalFormParent[] = [
    ...(orgRes.data ?? []).map((g) => ({ ...g, owner: null })),
    ...(mgrRes.data ?? []).map((g) => ({
      id: g.id,
      title: g.title,
      employee_id: g.employee_id,
      cycle_id: g.cycle_id,
      owner: (g.owner as { full_name: string | null } | null)?.full_name ?? null,
    })),
  ];
  return {
    cycles: cyclesRes.data ?? [],
    parents,
    weights: (weightRes.data ?? []).map((w) => ({ ...w, weightage: Number(w.weightage) })),
  };
}

export function toFormMembers(team: TeamMember[]): GoalFormMember[] {
  return team.filter((t) => t.status !== "exited").map((t) => ({ id: t.id, full_name: t.full_name, employee_code: t.employee_code, manager_id: t.manager_id }));
}
