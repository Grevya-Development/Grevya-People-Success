import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The "choose your own password" flag lives in app_metadata, which only the service role can
 * write (user_metadata is editable by the user, so a flag there could be cleared without
 * changing the password). Clear it after the user has set a new password.
 */
export async function clearMustChangePassword(user: Pick<User, "id" | "app_metadata"> | null | undefined) {
  if (!user || user.app_metadata?.must_change_password !== true) return;
  const { error } = await createAdminClient().auth.admin.updateUserById(user.id, { app_metadata: { must_change_password: false } });
  if (error) throw new Error(error.message);
}
