"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, type ActionState } from "@/lib/actions";
import { str } from "@/lib/utils";
import { safeNext } from "@/lib/safe-next";
import { clearMustChangePassword } from "@/lib/password-flag";

/** Passwords are used exactly as typed (Settings → Change password doesn't trim either). */
function rawPassword(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export async function signIn(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email");
  const password = rawPassword(fd, "password");
  const next = str(fd, "next");
  if (!email || !password) return fail("Enter your email and password");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return fail(signInError(error.code, error.message));
  return ok("Welcome back!", safeNext(next));
}

function signInError(code: string | undefined, message: string) {
  if (code === "invalid_credentials" || message === "Invalid login credentials") return "Incorrect email or password";
  if (code === "user_banned" || /banned/i.test(message)) return "Your login has been disabled. Please contact HR.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || /rate limit/i.test(message)) return "Too many attempts. Please wait a minute and try again.";
  return message;
}

export async function requestPasswordReset(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email");
  if (!email) return fail("Enter your work email");
  const h = await headers();
  const origin = h.get("origin") ?? `http://${h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/auth/reset` });
  if (error) return fail(error.message);
  return ok("If that email has an account, a reset link is on its way.");
}

export async function updatePassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const password = rawPassword(fd, "password");
  const confirm = rawPassword(fd, "confirm");
  if (password.length < 8) return fail("Password must be at least 8 characters");
  if (password.length > 72) return fail("Password must be 72 characters or fewer");
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return fail("Use letters and numbers");
  if (password !== confirm) return fail("Passwords don't match");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
  if (error) return fail(error.code === "same_password" ? "Choose a password different from your current one" : error.message);
  try {
    await clearMustChangePassword(data.user).catch(() => clearMustChangePassword(data.user));
  } catch {
    return fail("Your password was changed, but we couldn't finish setting up your account. Please try again with a different new password.");
  }
  // Refresh so the session's claims drop the "must change password" flag straight away.
  await supabase.auth.refreshSession();
  return ok("Password updated", "/home");
}
