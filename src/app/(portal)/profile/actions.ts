"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { uploadAvatar } from "@/lib/storage";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str, bool, orgToday } from "@/lib/utils";
import { UUID_RE, BLOOD_GROUPS, MARITAL_STATUSES, GENDERS } from "./_lib/shared";

const PHONE_RE = /^\+?[0-9][0-9\s-]{6,17}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Who is editing whose profile. Owners edit their own, HR edits anyone. */
async function editContext(fd: FormData) {
  const me = await getCurrentEmployee();
  if (!me) return { error: "Not signed in" } as const;
  const target = str(fd, "employee_id") ?? me.id;
  if (!UUID_RE.test(target)) return { error: "Invalid employee" } as const;
  if (target !== me.id && !me.isHR) return { error: "You can only edit your own profile" } as const;
  const supabase = await createClient();
  return { me, target, supabase } as const;
}

function revalidateProfile(target: string) {
  revalidatePath("/profile", "layout");
  revalidatePath(`/directory/${target}`);
  revalidatePath("/directory");
  revalidatePath("/settings");
}

function validDate(v: string | null) {
  return v === null || (DATE_RE.test(v) && !Number.isNaN(Date.parse(v)));
}

// ---------------------------------------------------------------------------
// Personal details
// ---------------------------------------------------------------------------
export async function updatePersonal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await editContext(fd);
  if ("error" in ctx) return fail(ctx.error!);
  const { supabase, target } = ctx;

  const phone = str(fd, "phone");
  const gender = str(fd, "gender");
  const dob = str(fd, "date_of_birth");
  const bloodGroup = str(fd, "blood_group");
  const marital = str(fd, "marital_status");
  const bio = str(fd, "bio");

  if (phone && !PHONE_RE.test(phone)) return fail("Enter a valid mobile number (digits, spaces, + or -)");
  if (gender && !GENDERS.some((g) => g.value === gender)) return fail("Choose a valid gender");
  if (bloodGroup && !(BLOOD_GROUPS as readonly string[]).includes(bloodGroup)) return fail("Choose a valid blood group");
  if (marital && !MARITAL_STATUSES.some((m) => m.value === marital)) return fail("Choose a valid marital status");
  if (!validDate(dob)) return fail("Enter a valid date of birth");
  if (dob) {
    const today = orgToday();
    if (dob >= today) return fail("Date of birth must be in the past");
    const minAge = `${Number(today.slice(0, 4)) - 14}${today.slice(4)}`;
    if (dob > minAge) return fail("Employee must be at least 14 years old");
    if (dob < "1900-01-01") return fail("Enter a valid date of birth");
  }
  if (bio && bio.length > 1000) return fail("About me must be 1000 characters or fewer");

  const { error } = await supabase
    .from("employees")
    .update({ phone, gender, date_of_birth: dob, blood_group: bloodGroup, marital_status: marital, bio })
    .eq("id", target);
  if (error) return fail(dbError(error));
  revalidateProfile(target);
  return ok("Personal details updated");
}

// ---------------------------------------------------------------------------
// Private details (employee_private)
// ---------------------------------------------------------------------------
export async function updatePrivate(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await editContext(fd);
  if ("error" in ctx) return fail(ctx.error!);
  const { supabase, target } = ctx;

  const personalEmail = str(fd, "personal_email");
  const address = str(fd, "address");
  const ecName = str(fd, "emergency_contact_name");
  const ecPhone = str(fd, "emergency_contact_phone");
  const pan = str(fd, "pan_number")?.toUpperCase() ?? null;
  const aadhaar = str(fd, "aadhaar_last4");
  const bankName = str(fd, "bank_name");
  const bankAccount = str(fd, "bank_account")?.replace(/\s+/g, "") ?? null;
  const ifsc = str(fd, "ifsc")?.toUpperCase() ?? null;
  const uan = str(fd, "uan")?.replace(/\s+/g, "") ?? null;
  // When HR edits someone else, sensitive values are shown masked; blank means "keep".
  const keepSensitive = bool(fd, "keep_sensitive");

  if (personalEmail && !EMAIL_RE.test(personalEmail)) return fail("Enter a valid personal email");
  if (address && address.length > 500) return fail("Address must be 500 characters or fewer");
  if (ecPhone && !PHONE_RE.test(ecPhone)) return fail("Enter a valid emergency contact phone");
  if ((ecName && !ecPhone) || (!ecName && ecPhone)) return fail("Add both the emergency contact name and phone");
  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return fail("PAN must look like ABCDE1234F");
  if (aadhaar && !/^\d{4}$/.test(aadhaar)) return fail("Enter only the last 4 digits of Aadhaar");
  if (bankAccount && !/^\d{6,18}$/.test(bankAccount)) return fail("Bank account number must be 6–18 digits");
  if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return fail("IFSC must look like HDFC0001234");
  if (uan && !/^\d{12}$/.test(uan)) return fail("UAN must be 12 digits");
  if (bankAccount && !ifsc && !keepSensitive) return fail("Add the IFSC code for the bank account");

  const row: Record<string, string | null> = {
    personal_email: personalEmail,
    address,
    emergency_contact_name: ecName,
    emergency_contact_phone: ecPhone,
    bank_name: bankName,
    ifsc,
    uan,
  };
  const sensitive = { pan_number: pan, aadhaar_last4: aadhaar, bank_account: bankAccount };
  for (const [k, v] of Object.entries(sensitive)) {
    if (keepSensitive && v === null) continue;
    row[k] = v;
  }

  const { error } = await supabase
    .from("employee_private")
    .upsert({ employee_id: target, ...row }, { onConflict: "employee_id" });
  if (error) return fail(dbError(error));
  revalidateProfile(target);
  return ok("Private details updated");
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
export async function updateAvatar(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await editContext(fd);
  if ("error" in ctx) return fail(ctx.error!);
  const { supabase, target } = ctx;
  const file = fd.get("avatar");
  if (!file || typeof file === "string" || file.size === 0) return fail("Choose an image to upload");
  let url: string | null;
  try {
    url = await uploadAvatar(file);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Upload failed");
  }
  if (!url) return fail("Choose an image to upload");
  const { error } = await supabase.from("employees").update({ avatar_url: url }).eq("id", target);
  if (error) return fail(dbError(error));
  revalidateProfile(target);
  revalidatePath("/", "layout");
  return ok("Profile photo updated");
}

export async function removeAvatar(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await editContext(fd);
  if ("error" in ctx) return fail(ctx.error!);
  const { supabase, target } = ctx;
  const { error } = await supabase.from("employees").update({ avatar_url: null }).eq("id", target);
  if (error) return fail(dbError(error));
  revalidateProfile(target);
  revalidatePath("/", "layout");
  return ok("Profile photo removed");
}

// ---------------------------------------------------------------------------
// Education
// ---------------------------------------------------------------------------
function readPeriod(fd: FormData): { start: string | null; end: string | null; error?: string } {
  const start = str(fd, "start_date");
  const end = str(fd, "end_date");
  if (!validDate(start) || !validDate(end)) return { start, end, error: "Enter valid dates" };
  if (start && end && end < start) return { start, end, error: "End date can't be before the start date" };
  if (start && start > orgToday()) return { start, end, error: "Start date can't be in the future" };
  return { start, end };
}

export async function saveEducation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await editContext(fd);
  if ("error" in ctx) return fail(ctx.error!);
  const { supabase, target } = ctx;
  const id = str(fd, "id");
  const degree = str(fd, "degree");
  const institution = str(fd, "institution");
  const grade = str(fd, "grade");
  if (!degree) return fail("Degree is required");
  if (!institution) return fail("Institution is required");
  if (degree.length > 150 || institution.length > 200) return fail("Degree or institution is too long");
  if (grade && grade.length > 50) return fail("Grade must be 50 characters or fewer");
  const period = readPeriod(fd);
  if (period.error) return fail(period.error);

  const values = { degree, institution, grade, start_date: period.start, end_date: period.end };
  if (id) {
    if (!UUID_RE.test(id)) return fail("Invalid record");
    const { data, error } = await supabase
      .from("employee_education")
      .update(values)
      .eq("id", id)
      .eq("employee_id", target)
      .select("id");
    if (error) return fail(dbError(error));
    if (!data?.length) return fail("Education record not found");
  } else {
    const { error } = await supabase.from("employee_education").insert({ ...values, employee_id: target });
    if (error) return fail(dbError(error));
  }
  revalidateProfile(target);
  return ok(id ? "Education updated" : "Education added");
}

export async function deleteEducation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await editContext(fd);
  if ("error" in ctx) return fail(ctx.error!);
  const { supabase, target } = ctx;
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid record");
  const { data, error } = await supabase.from("employee_education").delete().eq("id", id).eq("employee_id", target).select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Education record not found");
  revalidateProfile(target);
  return ok("Education removed");
}

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------
export async function saveExperience(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await editContext(fd);
  if ("error" in ctx) return fail(ctx.error!);
  const { supabase, target } = ctx;
  const id = str(fd, "id");
  const company = str(fd, "company");
  const designation = str(fd, "designation");
  const description = str(fd, "description");
  if (!company) return fail("Company is required");
  if (!designation) return fail("Designation is required");
  if (company.length > 200 || designation.length > 150) return fail("Company or designation is too long");
  if (description && description.length > 1000) return fail("Description must be 1000 characters or fewer");
  const period = readPeriod(fd);
  if (period.error) return fail(period.error);
  if (!period.start) return fail("Start date is required");

  const values = { company, designation, description, start_date: period.start, end_date: period.end };
  if (id) {
    if (!UUID_RE.test(id)) return fail("Invalid record");
    const { data, error } = await supabase
      .from("employee_experience")
      .update(values)
      .eq("id", id)
      .eq("employee_id", target)
      .select("id");
    if (error) return fail(dbError(error));
    if (!data?.length) return fail("Experience record not found");
  } else {
    const { error } = await supabase.from("employee_experience").insert({ ...values, employee_id: target });
    if (error) return fail(dbError(error));
  }
  revalidateProfile(target);
  return ok(id ? "Experience updated" : "Experience added");
}

export async function deleteExperience(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await editContext(fd);
  if ("error" in ctx) return fail(ctx.error!);
  const { supabase, target } = ctx;
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid record");
  const { data, error } = await supabase.from("employee_experience").delete().eq("id", id).eq("employee_id", target).select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Experience record not found");
  revalidateProfile(target);
  return ok("Experience removed");
}
