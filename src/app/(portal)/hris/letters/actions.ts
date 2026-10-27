"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str } from "@/lib/utils";
import { REQUESTABLE, isLetterType, letterCategory, letterTypeLabel } from "../_lib/letter-templates";

function revalidateLetters() {
  revalidatePath("/hris/letters");
  revalidatePath("/hris/salary-letters");
  revalidatePath("/hris/admin/letters");
  revalidatePath("/hris");
}

export async function requestLetter(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (me.status === "exited") return fail("Exited employees can't raise new requests. Please contact HR.");

  const type = str(fd, "letter_type");
  if (!isLetterType(type)) return fail("Choose a letter type");
  if (!REQUESTABLE[letterCategory(type)].includes(type)) return fail("This letter can't be requested");
  const purpose = str(fd, "purpose");
  if (!purpose) return fail("Please tell us what the letter is for");
  if (purpose.length > 500) return fail("Purpose must be under 500 characters");

  const supabase = await createClient();
  const { count } = await supabase
    .from("letter_requests")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", me.id)
    .eq("letter_type", type)
    .eq("status", "pending");
  if ((count ?? 0) > 0) return fail(`You already have a pending ${letterTypeLabel(type).toLowerCase()} request`);

  const { error } = await supabase.from("letter_requests").insert({ employee_id: me.id, letter_type: type, purpose, status: "pending" });
  if (error) return fail(dbError(error));
  revalidateLetters();
  return ok("Request submitted to HR");
}

export async function cancelLetterRequest(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const id = str(fd, "id");
  if (!id) return fail("Missing request");

  const supabase = await createClient();
  const { data: req } = await supabase.from("letter_requests").select("id, employee_id, status").eq("id", id).maybeSingle();
  if (!req || req.employee_id !== me.id) return fail("Request not found");
  if (req.status !== "pending") return fail("Only pending requests can be cancelled");

  const { error } = await supabase.from("letter_requests").update({ status: "cancelled" }).eq("id", id).eq("status", "pending");
  if (error) return fail(dbError(error));
  revalidateLetters();
  return ok("Request cancelled");
}
