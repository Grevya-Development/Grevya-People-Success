import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export type Role = "employee" | "manager" | "hr_admin" | "super_admin";

export type CurrentEmployee = Tables<"employees"> & {
  department: { name: string } | null;
  designation: { title: string } | null;
  location: { name: string } | null;
  manager: { id: string; full_name: string; avatar_url: string | null } | null;
  /** number of direct reports */
  reportCount: number;
  /** HR, or has at least one direct report */
  isManager: boolean;
  /** HR admin or Super Admin */
  isHR: boolean;
  /** Owns user accounts and admin rights */
  isSuperAdmin: boolean;
};

/** Signed-in employee for this request (deduplicated per request). */
export const getCurrentEmployee = cache(async (): Promise<CurrentEmployee | null> => {
  const supabase = await createClient();
  // getClaims() verifies the JWT locally (asymmetric keys), saving a round trip to Supabase Auth.
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return null;

  // One query: the employee, their manager, and a count of their (non-exited) direct reports.
  const { data } = await supabase
    .from("employees")
    .select(
      "*, department:departments(name), designation:designations(title), location:locations(name), manager:manager_id(id, full_name, avatar_url), reports:employees!manager_id(count)",
    )
    .eq("user_id", userId)
    .neq("reports.status", "exited")
    .maybeSingle();
  if (!data) return null;

  const { reports, ...emp } = data as typeof data & { reports: { count: number }[] | null };
  const reportCount = reports?.[0]?.count ?? 0;
  const isSuperAdmin = emp.role === "super_admin";
  const isHR = isSuperAdmin || emp.role === "hr_admin";
  return {
    ...(emp as unknown as CurrentEmployee),
    reportCount,
    isHR,
    isSuperAdmin,
    isManager: isHR || emp.role === "manager" || reportCount > 0,
  };
});

/** Use at the top of every portal page / server action. */
export async function requireEmployee(): Promise<CurrentEmployee> {
  const me = await getCurrentEmployee();
  if (!me) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    redirect(data?.claims?.sub ? "/no-access" : "/login");
  }
  return me;
}

/** Managers (anyone with reports) and HR. Others are sent home. */
export async function requireManager(): Promise<CurrentEmployee> {
  const me = await requireEmployee();
  if (!me.isManager) redirect("/home?denied=1");
  return me;
}

export async function requireHR(): Promise<CurrentEmployee> {
  const me = await requireEmployee();
  if (!me.isHR) redirect("/home?denied=1");
  return me;
}

export async function requireSuperAdmin(): Promise<CurrentEmployee> {
  const me = await requireEmployee();
  if (!me.isSuperAdmin) redirect("/home?denied=1");
  return me;
}

/** For server actions: returns the user-scoped client and the employee, or throws. */
export async function actionContext() {
  const me = await getCurrentEmployee();
  if (!me) throw new Error("Not signed in");
  const supabase = await createClient();
  return { supabase, me };
}
