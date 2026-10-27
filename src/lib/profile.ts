import type { Tables } from "@/lib/database.types";

/**
 * Profile completion used on Home ("86% PROFILE COMPLETED") and My Profile.
 * Each check is one equal-weight item.
 */
export function profileCompletion(
  emp: Pick<Tables<"employees">, "phone" | "avatar_url" | "date_of_birth" | "blood_group" | "marital_status" | "gender" | "bio">,
  priv: Pick<Tables<"employee_private">, "address" | "emergency_contact_name" | "emergency_contact_phone" | "pan_number" | "bank_account" | "personal_email"> | null,
  educationCount: number,
  experienceCount: number,
): { percent: number; missing: string[] } {
  const checks: [string, boolean][] = [
    ["Mobile number", !!emp.phone],
    ["Profile photo", !!emp.avatar_url],
    ["Date of birth", !!emp.date_of_birth],
    ["Gender", !!emp.gender],
    ["Blood group", !!emp.blood_group],
    ["Marital status", !!emp.marital_status],
    ["About me", !!emp.bio],
    ["Personal email", !!priv?.personal_email],
    ["Address", !!priv?.address],
    ["Emergency contact", !!(priv?.emergency_contact_name && priv?.emergency_contact_phone)],
    ["PAN", !!priv?.pan_number],
    ["Bank account", !!priv?.bank_account],
    ["Education", educationCount > 0],
    ["Work experience", experienceCount > 0],
  ];
  const done = checks.filter(([, v]) => v).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    missing: checks.filter(([, v]) => !v).map(([k]) => k),
  };
}
