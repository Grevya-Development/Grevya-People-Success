"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { uploadDocument } from "@/lib/storage";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { num, str } from "@/lib/utils";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = ["course", "certification", "conference", "workshop"];
const MODES = ["online", "in_person", "hybrid"];

function revalidateExternal() {
  revalidatePath("/learning/external", "layout");
  revalidatePath("/learning");
}

export async function requestExternalTraining(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const title = str(fd, "title");
  const provider = str(fd, "provider");
  const type = str(fd, "training_type");
  const mode = str(fd, "mode") ?? "online";
  const start = str(fd, "start_date");
  const end = str(fd, "end_date");
  const cost = num(fd, "cost") ?? 0;
  const justification = str(fd, "justification");
  const link = str(fd, "link");

  if (!title) return fail("Title is required");
  if (title.length > 200) return fail("Title is too long");
  if (!provider) return fail("Provider is required");
  if (provider.length > 120) return fail("Provider name is too long");
  if (!type || !TYPES.includes(type)) return fail("Choose a training type");
  if (!MODES.includes(mode)) return fail("Choose a mode");
  if (!start || !DATE_RE.test(start)) return fail("Start date is required");
  if (!end || !DATE_RE.test(end)) return fail("End date is required");
  if (end < start) return fail("End date can't be before the start date");
  if (cost < 0 || cost > 10_000_000) return fail("Enter a valid cost");
  if (!justification) return fail("Tell your manager why this training helps you");
  if (justification.length > 4000) return fail("Justification is too long");
  if (link) {
    try {
      const u = new URL(link);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    } catch {
      return fail("Link must start with http:// or https://");
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("external_trainings").insert({
    employee_id: me.id,
    title,
    provider,
    training_type: type,
    mode,
    start_date: start,
    end_date: end,
    cost: Math.round(cost * 100) / 100,
    justification,
    link,
  });
  if (error) return fail(dbError(error));
  revalidateExternal();
  return ok(me.manager ? `Request sent to ${me.manager.full_name} for approval` : "Request submitted for approval");
}

export async function cancelExternalTraining(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid request");
  const supabase = await createClient();
  const { data: t } = await supabase.from("external_trainings").select("id, employee_id, status").eq("id", id).maybeSingle();
  if (!t || t.employee_id !== me.id) return fail("Request not found");
  if (!["pending", "approved"].includes(t.status)) return fail("This request can no longer be cancelled");
  const { error } = await supabase.from("external_trainings").update({ status: "cancelled" }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidateExternal();
  return ok("Request cancelled");
}

/** Employee: mark an approved training completed, optionally attaching the certificate. */
export async function completeExternalTraining(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid request");
  const notes = str(fd, "completion_notes");
  if (notes && notes.length > 2000) return fail("Notes are too long");
  const supabase = await createClient();
  const { data: t } = await supabase.from("external_trainings").select("id, employee_id, status, start_date, certificate_path").eq("id", id).maybeSingle();
  if (!t || t.employee_id !== me.id) return fail("Request not found");
  if (t.status !== "approved" && t.status !== "completed") return fail("Only approved trainings can be completed");

  let path: string | null = null;
  try {
    path = await uploadDocument(fd.get("certificate"), "external-training");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Upload failed");
  }
  if (t.status === "completed") {
    if (!path) return fail("Choose a certificate file to upload");
    const { error } = await supabase.from("external_trainings").update({ certificate_path: path }).eq("id", id);
    if (error) return fail(dbError(error));
    revalidateExternal();
    return ok("Certificate uploaded");
  }
  const { error } = await supabase
    .from("external_trainings")
    .update({ status: "completed", certificate_path: path ?? t.certificate_path, completion_notes: notes })
    .eq("id", id);
  if (error) return fail(dbError(error));
  revalidateExternal();
  return ok(path ? "Marked completed — certificate saved" : "Marked completed");
}

/** Manager (reporting chain) or HR: approve / reject a pending request. */
export async function decideExternalTraining(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isManager) return fail("Only managers can approve training requests");
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid request");
  const decision = str(fd, "decision");
  if (decision !== "approved" && decision !== "rejected") return fail("Unknown decision");
  const remarks = str(fd, "remarks");
  if (decision === "rejected" && !remarks) return fail("Remarks are required to reject a request");
  if (remarks && remarks.length > 2000) return fail("Remarks are too long");

  const supabase = await createClient();
  const { data: t } = await supabase.from("external_trainings").select("id, employee_id, status").eq("id", id).maybeSingle();
  if (!t) return fail("Request not found");
  if (t.employee_id === me.id && !me.isHR) return fail("You can't approve your own request");
  if (!me.isHR) {
    const { data: allowed } = await supabase.rpc("is_manager_of", { emp: t.employee_id });
    if (!allowed) return fail("You don't have permission to do that.");
  }
  if (t.status !== "pending") return fail("This request has already been processed");
  const { error } = await supabase.from("external_trainings").update({ status: decision, approver_remarks: remarks }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidateExternal();
  return ok(decision === "approved" ? "Request approved" : "Request rejected");
}
