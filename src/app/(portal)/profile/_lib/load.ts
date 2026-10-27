import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import { UUID_RE } from "./shared";

/**
 * Whose profile is being viewed. Employees always see their own; HR may pass
 * ?id=<employeeId>. Anyone else asking for another id is sent to the public
 * directory profile.
 */
export async function resolveTarget(id: string | string[] | undefined) {
  const me = await requireEmployee();
  const raw = Array.isArray(id) ? id[0] : id;
  if (!raw || raw === me.id) return { me, targetId: me.id, isSelf: true };
  if (!UUID_RE.test(raw)) notFound();
  if (!me.isHR) redirect(`/directory/${raw}`);
  return { me, targetId: raw, isSelf: false };
}

export type ProfileEmployee = Tables<"employees"> & {
  department: { name: string } | null;
  designation: { title: string } | null;
  location: { name: string } | null;
  manager: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    employee_code: string;
    designation: { title: string } | null;
  } | null;
};

export type ReportPerson = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  employee_code: string;
  designation: { title: string } | null;
};

export async function loadEmployee(targetId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select(
      "*, department:departments(name), designation:designations(title), location:locations(name), manager:manager_id(id, full_name, avatar_url, employee_code, designation:designations(title))",
    )
    .eq("id", targetId)
    .maybeSingle();
  if (!data) notFound();
  return data as unknown as ProfileEmployee;
}

export async function loadReports(targetId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, full_name, avatar_url, employee_code, designation:designations(title)")
    .eq("manager_id", targetId)
    .neq("status", "exited")
    .order("full_name");
  return (data ?? []) as unknown as ReportPerson[];
}

/** Only call after resolveTarget() — RLS also restricts this to owner / HR. */
export async function loadPrivate(targetId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("employee_private").select("*").eq("employee_id", targetId).maybeSingle();
  return data;
}

export async function loadEducation(targetId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_education")
    .select("*")
    .eq("employee_id", targetId)
    .order("end_date", { ascending: false, nullsFirst: true })
    .order("start_date", { ascending: false });
  return data ?? [];
}

export async function loadExperience(targetId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_experience")
    .select("*")
    .eq("employee_id", targetId)
    .order("end_date", { ascending: false, nullsFirst: true })
    .order("start_date", { ascending: false });
  return data ?? [];
}
