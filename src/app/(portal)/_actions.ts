"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { allLeaves } from "@/lib/nav";

export async function toggleFavorite(key: string): Promise<{ ok: boolean; favorite?: boolean; error?: string }> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, error: "Not signed in" };
  if (!allLeaves().some((l) => l.key === key)) return { ok: false, error: "Unknown page" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("favorites").select("id").eq("employee_id", me.id).eq("module_key", key).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("favorites").delete().eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/home");
    return { ok: true, favorite: false };
  }
  const { error } = await supabase.from("favorites").insert({ employee_id: me.id, module_key: key });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/home");
  return { ok: true, favorite: true };
}

export async function markNotificationRead(id: string) {
  const me = await getCurrentEmployee();
  if (!me) return;
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead() {
  const me = await getCurrentEmployee();
  if (!me) return;
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("employee_id", me.id).is("read_at", null);
  revalidatePath("/", "layout");
}

export type EmployeeHit = {
  id: string;
  full_name: string;
  employee_code: string;
  avatar_url: string | null;
  designation: string | null;
  department: string | null;
};

export async function searchEmployees(q: string): Promise<EmployeeHit[]> {
  const me = await getCurrentEmployee();
  if (!me) return [];
  const term = q.trim().replace(/[%,()]/g, " ").slice(0, 60);
  if (term.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, full_name, employee_code, avatar_url, designation:designations(title), department:departments(name)")
    .or(`full_name.ilike.%${term}%,employee_code.ilike.%${term}%,email.ilike.%${term}%`)
    .neq("status", "exited")
    .order("full_name")
    .limit(6);
  return (data ?? []).map((e) => ({
    id: e.id,
    full_name: e.full_name ?? "",
    employee_code: e.employee_code,
    avatar_url: e.avatar_url,
    designation: (e.designation as { title: string } | null)?.title ?? null,
    department: (e.department as { name: string } | null)?.name ?? null,
  }));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
