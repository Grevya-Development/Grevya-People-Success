import { cookies } from "next/headers";
import type { PortalMode } from "@/lib/nav";

/** Cookie that remembers whether an HR admin is in the admin console or their own workspace. */
export const VIEW_COOKIE = "ps_view";

/**
 * HR admins and super admins work in the admin console by default. They can switch
 * to their own workspace (leave, payslips, ...) and back; everyone else only has "self".
 */
export async function portalMode(me: { isHR: boolean }): Promise<PortalMode> {
  if (!me.isHR) return "self";
  const jar = await cookies();
  return jar.get(VIEW_COOKIE)?.value === "self" ? "self" : "admin";
}
