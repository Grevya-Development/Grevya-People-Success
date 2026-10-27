import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export type Role = "employee" | "manager" | "hr_admin";

export type CurrentEmployee = Tables<"employees"> & {
  department: { name: string } | null;
  designation: { title: string } | null;
  location: { name: string } | null;
  manager: { id: string; full_name: string; avatar_url: string | null } | null;
  /** number of direct reports */
  reportCount: number;
  /** HR, or has at least one direct report */
  isManager: boolean;
  isHR: boolean;
};

/** Signed-in employee for this request (deduplicated per request). */
export const getCurrentEmployee = cache(async (): Promise<CurrentEmployee | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: emp } = await supabase
    .from("employees")
    .select(
      "*, department:departments(name), designation:designations(title), location:locations(name), manager:manager_id(id, full_name, avatar_url)",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (!emp) return null;

  const { count } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("manager_id", emp.id)
    .neq("status", "exited");

  const reportCount = count ?? 0;
  const isHR = emp.role === "hr_admin";
  return {
    ...(emp as unknown as CurrentEmployee),
    reportCount,
    isHR,
    isManager: isHR || emp.role === "manager" || reportCount > 0,
  };
});

/** Use at the top of every portal page / server action. */
export async function requireEmployee(): Promise<CurrentEmployee> {
  const me = await getCurrentEmployee();
  if (!me) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    redirect(user ? "/no-access" : "/login");
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

/** For server actions: returns the user-scoped client and the employee, or throws. */
export async function actionContext() {
  const me = await getCurrentEmployee();
  if (!me) throw new Error("Not signed in");
  const supabase = await createClient();
  return { supabase, me };
}
