"use server";

import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { clearMustChangePassword } from "@/lib/password-flag";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { revalidatePath } from "next/cache";
import type { Database } from "@/lib/database.types";

function rawPassword(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export async function changePassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return fail("Not signed in");

  const current = rawPassword(fd, "current_password");
  const next = rawPassword(fd, "new_password");
  const confirm = rawPassword(fd, "confirm_password");

  if (!current) return fail("Enter your current password");
  if (next.length < 8) return fail("New password must be at least 8 characters");
  if (next.length > 72) return fail("New password must be 72 characters or fewer");
  if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) return fail("New password must contain letters and numbers");
  if (next !== confirm) return fail("New passwords don't match");
  if (next === current) return fail("New password must be different from the current one");

  // Re-check the current password with a throwaway client so the user's own
  // session cookies are left untouched.
  const verifier = createStatelessClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: verifyError } = await verifier.auth.signInWithPassword({ email: user.email, password: current });
  if (verifyError) return fail("Current password is incorrect");
  // Revoke only the throwaway session.
  await verifier.auth.signOut({ scope: "local" });

  const { data: updated, error } = await supabase.auth.updateUser({ password: next, data: { must_change_password: false } });
  if (error) return fail(error.message || "Could not update password");
  if (updated.user?.app_metadata?.must_change_password === true) {
    try {
      await clearMustChangePassword(updated.user);
    } catch {
      return fail("Your password was changed, but we couldn't finish updating your account. Please try again.");
    }
    await supabase.auth.refreshSession();
  }
  return ok("Password changed successfully");
}

export async function signOutEverywhere(): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return fail(error.message || "Could not sign out");
  return ok("Signed out of all devices", "/login");
}

/** Turn notification emails on or off for yourself. */
export async function setEmailNotifications(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const enabled = fd.get("enabled") === "on";
  const supabase = await createClient();
  const { error } = await supabase.from("email_preferences").upsert({ employee_id: me.id, email_enabled: enabled });
  if (error) return fail(dbError(error));
  revalidatePath("/settings");
  return ok(enabled ? "Emails on. We'll email you about approvals, payslips and other updates." : "Emails off. You'll still see updates under Alerts.");
}
