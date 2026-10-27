import "server-only";
import { redirect } from "next/navigation";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** HR, or an employee who is the hiring manager of at least one job. */
export async function requireRecruiter() {
  const me = await requireEmployee();
  if (me.isHR) return me;
  const supabase = await createClient();
  const { count } = await supabase
    .from("job_openings")
    .select("id", { count: "exact", head: true })
    .eq("hiring_manager_id", me.id);
  if (!count) redirect("/home?denied=1");
  return me;
}

/** Reference data for job / interview forms. */
export async function loadFormOptions() {
  const supabase = await createClient();
  const [d, l, p] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("locations").select("id, name").order("name"),
    supabase.from("employees").select("id, full_name, employee_code").neq("status", "exited").order("first_name"),
  ]);
  return { departments: d.data ?? [], locations: l.data ?? [], people: p.data ?? [] };
}
