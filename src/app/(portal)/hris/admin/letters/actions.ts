"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { orgToday, str } from "@/lib/utils";
import { EXTRA_FIELDS, isLetterType, letterCategory, letterTypeLabel } from "../../_lib/letter-templates";
import { formatExtras, generateFor, loadLetterData } from "../../_lib/letter-data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CONTENT = 100_000;

function revalidateLetters() {
  revalidatePath("/hris/admin/letters");
  revalidatePath("/hris/letters");
  revalidatePath("/hris/salary-letters");
  revalidatePath("/hris");
}

async function hrContext() {
  const me = await getCurrentEmployee();
  if (!me) return { error: "Not signed in" } as const;
  if (!me.isHR) return { error: "Only HR can manage letters" } as const;
  return { me, supabase: await createClient() } as const;
}

function validDate(v: string | null) {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

function readLetterBody(fd: FormData): { title: string; content: string } | { error: string } {
  const title = str(fd, "title");
  const content = str(fd, "content");
  if (!title) return { error: "Title is required" };
  if (title.length > 200) return { error: "Title must be under 200 characters" };
  if (!content || content.replace(/<[^>]*>/g, "").trim().length < 20) return { error: "Letter content is too short" };
  if (content.length > MAX_CONTENT) return { error: "Letter content is too long" };
  return { title, content };
}

export type DraftResult = { ok: true; title: string; content: string } | { ok: false; error: string };

/** Build an editable draft for an employee + letter type, filled from their records. */
export async function generateLetterDraft(employeeId: string, type: string, extras: Record<string, string>): Promise<DraftResult> {
  const ctx = await hrContext();
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  if (!UUID.test(employeeId)) return { ok: false, error: "Choose an employee" };
  if (!isLetterType(type)) return { ok: false, error: "Choose a letter type" };

  const allowed = new Set((EXTRA_FIELDS[type] ?? []).map((f) => f.key));
  const clean: Record<string, string> = {};
  for (const f of EXTRA_FIELDS[type] ?? []) {
    const v = (extras[f.key] ?? "").toString().trim().slice(0, 200);
    if (f.required && !v) return { ok: false, error: `${f.label} is required` };
    if (v && f.type === "number" && !(Number(v) >= 0)) return { ok: false, error: `${f.label} must be a positive number` };
    if (v && f.type === "date" && !validDate(v)) return { ok: false, error: `${f.label} is not a valid date` };
    if (v && allowed.has(f.key)) clean[f.key] = v;
  }

  const data = await loadLetterData(ctx.supabase, [employeeId], ctx.me);
  const draft = generateFor(type, data.get(employeeId), formatExtras(type, clean));
  if (!draft) return { ok: false, error: "Employee not found" };
  return { ok: true, title: draft.title, content: draft.content };
}

export async function issueLetter(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return fail(ctx.error!);
  const { me, supabase } = ctx;

  const employeeId = str(fd, "employee_id");
  const type = str(fd, "letter_type");
  const issuedOn = str(fd, "issued_on") ?? orgToday();
  if (!employeeId || !UUID.test(employeeId)) return fail("Choose an employee");
  if (!isLetterType(type)) return fail("Choose a letter type");
  if (!validDate(issuedOn)) return fail("Issue date is not valid");
  const body = readLetterBody(fd);
  if ("error" in body) return fail(body.error);

  const { data: emp } = await supabase.from("employees").select("id, full_name").eq("id", employeeId).maybeSingle();
  if (!emp) return fail("Employee not found");

  const { error } = await supabase.from("letters").insert({
    employee_id: employeeId,
    letter_type: type,
    category: letterCategory(type),
    title: body.title,
    content: body.content,
    issued_on: issuedOn,
    issued_by: me.id,
  });
  if (error) return fail(dbError(error));
  revalidateLetters();
  return ok(`${letterTypeLabel(type)} issued to ${emp.full_name}`);
}

export async function approveLetterRequest(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return fail(ctx.error!);
  const { me, supabase } = ctx;

  const id = str(fd, "request_id");
  if (!id || !UUID.test(id)) return fail("Missing request");
  const body = readLetterBody(fd);
  if ("error" in body) return fail(body.error);
  const remarks = str(fd, "remarks");
  if (remarks && remarks.length > 500) return fail("Remarks must be under 500 characters");

  const { data: req } = await supabase.from("letter_requests").select("id, employee_id, letter_type, status").eq("id", id).maybeSingle();
  if (!req) return fail("Request not found");
  if (req.status !== "pending") return fail("This request has already been processed");
  const type = isLetterType(req.letter_type) ? req.letter_type : "other";

  const { data: letter, error } = await supabase
    .from("letters")
    .insert({
      employee_id: req.employee_id,
      letter_type: type,
      category: letterCategory(type),
      title: body.title,
      content: body.content,
      issued_on: orgToday(),
      issued_by: me.id,
    })
    .select("id")
    .single();
  if (error || !letter) return fail(dbError(error));

  const { data: updated, error: upErr } = await supabase
    .from("letter_requests")
    .update({
      status: "approved",
      letter_id: letter.id,
      approver_id: me.id,
      approver_remarks: remarks,
      actioned_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (upErr || !updated?.length) {
    // Roll back the letter so we never leave an orphan issued twice.
    await supabase.from("letters").delete().eq("id", letter.id);
    return fail(upErr ? dbError(upErr) : "This request was processed by someone else");
  }
  revalidateLetters();
  return ok("Letter issued and request approved");
}

export async function rejectLetterRequest(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return fail(ctx.error!);
  const { me, supabase } = ctx;

  const id = str(fd, "id");
  const remarks = str(fd, "remarks");
  if (!id || !UUID.test(id)) return fail("Missing request");
  if (!remarks) return fail("Please give a reason for rejecting");
  if (remarks.length > 500) return fail("Remarks must be under 500 characters");

  const { data, error } = await supabase
    .from("letter_requests")
    .update({ status: "rejected", approver_id: me.id, approver_remarks: remarks, actioned_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("This request has already been processed");
  revalidateLetters();
  return ok("Request rejected");
}

export async function deleteLetter(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return fail(ctx.error!);
  const id = str(fd, "id");
  if (!id || !UUID.test(id)) return fail("Missing letter");
  const { data, error } = await ctx.supabase.from("letters").delete().eq("id", id).select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Letter not found");
  revalidateLetters();
  return ok("Letter withdrawn");
}
