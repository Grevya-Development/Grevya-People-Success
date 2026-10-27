import "server-only";
import type { CurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { RemoteSession } from "../_lib";

export type TeamSession = RemoteSession & {
  employee: { id: string; full_name: string | null; employee_code: string; avatar_url: string | null; department: { name: string } | null } | null;
};

/** Remote sessions the viewer may see (RLS: their reporting chain, or everyone for HR), excluding their own. */
export async function loadTeamSessions(me: CurrentEmployee, from: string, to: string, employeeId?: string | null) {
  const supabase = await createClient();
  let q = supabase
    .from("remote_work_sessions")
    .select("*, employee:employees!remote_work_sessions_employee_id_fkey(id, full_name, employee_code, avatar_url, department:departments(name))")
    .gte("work_date", from)
    .lte("work_date", to)
    .neq("employee_id", me.id)
    .order("check_in_at", { ascending: false })
    .limit(5000);
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data } = await q;
  return (data ?? []) as unknown as TeamSession[];
}
