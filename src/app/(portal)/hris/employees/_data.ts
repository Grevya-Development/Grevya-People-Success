import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Option } from "./_lib";

/** Dropdown options for the employee form. `excludeId` drops the employee from the manager list. */
export async function loadFormOptions(excludeId?: string) {
  const supabase = await createClient();
  const [deps, desigs, locs, mgrs] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("designations").select("id, title, level").order("level").order("title"),
    supabase.from("locations").select("id, name, city").order("name"),
    supabase.from("employees").select("id, full_name, employee_code").neq("status", "exited").order("full_name"),
  ]);
  const managers: Option[] = (mgrs.data ?? [])
    .filter((m) => m.id !== excludeId)
    .map((m) => ({ id: m.id, label: `${m.full_name ?? ""} (${m.employee_code})` }));
  return {
    departments: (deps.data ?? []).map((d) => ({ id: d.id, label: d.name })),
    designations: (desigs.data ?? []).map((d) => ({ id: d.id, label: `${d.title} · L${d.level}` })),
    locations: (locs.data ?? []).map((l) => ({ id: l.id, label: l.city && l.city !== l.name ? `${l.name} (${l.city})` : l.name })),
    managers,
  };
}

/** Next employee code: increments the highest numeric suffix, keeping prefix and padding (e.g. GRV0042 → GRV0043). */
export async function suggestEmployeeCode() {
  const supabase = await createClient();
  const { data } = await supabase.from("employees").select("employee_code");
  let best: { prefix: string; n: number; width: number } | null = null;
  for (const { employee_code } of data ?? []) {
    const m = /^(.*?)(\d+)$/.exec(employee_code);
    if (!m) continue;
    const n = Number(m[2]);
    if (!best || n > best.n) best = { prefix: m[1], n, width: m[2].length };
  }
  if (!best) return "GRV0001";
  return best.prefix + String(best.n + 1).padStart(best.width, "0");
}
