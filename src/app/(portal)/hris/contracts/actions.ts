"use server";

import { createAdminClient } from "@/lib/supabase/admin";

import { revalidatePath } from "next/cache";
import { addDays, format, parseISO } from "date-fns";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { uploadDocument } from "@/lib/storage";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { formatDate, orgToday, str } from "@/lib/utils";
import type { TablesInsert } from "@/lib/database.types";
import { CONTRACT_TYPES } from "./_lib";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function hrContext() {
  const me = await getCurrentEmployee();
  if (!me) return { error: "Not signed in" } as const;
  if (!me.isHR) return { error: "Only HR can manage contracts" } as const;
  return { me, supabase: await createClient() } as const;
}

function revalidate() {
  revalidatePath("/hris/contracts");
  revalidatePath("/hris");
}

function validDate(v: string | null): v is string {
  return !!v && DATE.test(v) && !Number.isNaN(Date.parse(v));
}

type Fields = { title: string; contract_type: string; start_date: string; end_date: string | null; terms: string | null };

function readFields(fd: FormData): Fields | { error: string } {
  const title = str(fd, "title");
  const contract_type = str(fd, "contract_type");
  const start_date = str(fd, "start_date");
  const end_date = str(fd, "end_date");
  const terms = str(fd, "terms");
  if (!title) return { error: "Title is required" };
  if (title.length > 200) return { error: "Title must be under 200 characters" };
  if (!contract_type || !(CONTRACT_TYPES as readonly string[]).includes(contract_type)) return { error: "Choose a contract type" };
  if (!validDate(start_date)) return { error: "Start date is required" };
  if (end_date && !validDate(end_date)) return { error: "End date is not valid" };
  if (end_date && end_date < start_date) return { error: "End date can't be before the start date" };
  if (terms && terms.length > 20000) return { error: "Terms are too long" };
  return { title, contract_type, start_date, end_date, terms };
}

async function readDocument(fd: FormData): Promise<{ path: string | null } | { error: string }> {
  try {
    return { path: await uploadDocument(fd.get("document"), "contracts") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed" };
  }
}

async function notifyEmployee(supabase: Awaited<ReturnType<typeof createClient>>, employeeId: string, title: string, body: string) {
  // Best effort — a failed notification must not fail the contract change.
  // Only reached from HR-checked actions; notifications have no client insert policy.
  void supabase;
  await createAdminClient().from("notifications").insert({ employee_id: employeeId, title, body, link: "/hris/contracts" });
}

export async function createContract(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return fail(ctx.error!);
  const { me, supabase } = ctx;

  const employeeId = str(fd, "employee_id");
  if (!employeeId || !UUID.test(employeeId)) return fail("Choose an employee");
  const f = readFields(fd);
  if ("error" in f) return fail(f.error);
  const status = str(fd, "status") ?? "active";
  if (!["draft", "active"].includes(status)) return fail("New contracts must be draft or active");

  const { data: emp } = await supabase.from("employees").select("id, full_name").eq("id", employeeId).maybeSingle();
  if (!emp) return fail("Employee not found");

  const doc = await readDocument(fd);
  if ("error" in doc) return fail(doc.error);

  const row: TablesInsert<"contracts"> = { ...f, employee_id: employeeId, status, document_url: doc.path, created_by: me.id };
  const { error } = await supabase.from("contracts").insert(row);
  if (error) return fail(dbError(error));
  if (status === "active") await notifyEmployee(supabase, employeeId, `New contract: ${f.title}`, `Effective from ${formatDate(f.start_date)}.`);
  revalidate();
  return ok(`Contract created for ${emp.full_name}`);
}

export async function updateContract(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return fail(ctx.error!);
  const { supabase } = ctx;

  const id = str(fd, "id");
  if (!id || !UUID.test(id)) return fail("Missing contract");
  const f = readFields(fd);
  if ("error" in f) return fail(f.error);
  const status = str(fd, "status");
  if (!status || !["draft", "active", "expired", "terminated", "renewed"].includes(status)) return fail("Choose a status");

  const { data: existing } = await supabase.from("contracts").select("id, status").eq("id", id).maybeSingle();
  if (!existing) return fail("Contract not found");
  if (status === "renewed" && existing.status !== "renewed") return fail("Use “Renew” to renew a contract");

  const doc = await readDocument(fd);
  if ("error" in doc) return fail(doc.error);

  const patch: Partial<TablesInsert<"contracts">> = { ...f, status };
  if (doc.path) patch.document_url = doc.path;
  else if (fd.get("remove_document") === "on") patch.document_url = null;

  const { error } = await supabase.from("contracts").update(patch).eq("id", id);
  if (error) return fail(dbError(error));
  revalidate();
  return ok("Contract updated");
}

export async function renewContract(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return fail(ctx.error!);
  const { me, supabase } = ctx;

  const id = str(fd, "id");
  if (!id || !UUID.test(id)) return fail("Missing contract");
  const { data: old } = await supabase.from("contracts").select("*").eq("id", id).maybeSingle();
  if (!old) return fail("Contract not found");
  if (!["active", "expired"].includes(old.status)) return fail("Only active or expired contracts can be renewed");

  const f = readFields(fd);
  if ("error" in f) return fail(f.error);
  if (f.start_date <= old.start_date) return fail("The renewal must start after the current contract started");

  const doc = await readDocument(fd);
  if ("error" in doc) return fail(doc.error);

  const { data: created, error } = await supabase
    .from("contracts")
    .insert({
      ...f,
      employee_id: old.employee_id,
      status: "active",
      document_url: doc.path ?? (fd.get("keep_document") === "on" ? old.document_url : null),
      created_by: me.id,
    })
    .select("id")
    .single();
  if (error || !created) return fail(dbError(error));

  // Close the previous contract the day before the renewal starts (if it ran past that).
  const dayBefore = format(addDays(parseISO(f.start_date), -1), "yyyy-MM-dd");
  const closeOn = !old.end_date || old.end_date > dayBefore ? (dayBefore >= old.start_date ? dayBefore : old.start_date) : old.end_date;
  const { error: upErr } = await supabase.from("contracts").update({ status: "renewed", end_date: closeOn }).eq("id", id);
  if (upErr) {
    await supabase.from("contracts").delete().eq("id", created.id);
    return fail(dbError(upErr));
  }
  await notifyEmployee(
    supabase,
    old.employee_id,
    `Contract renewed: ${f.title}`,
    `New term ${formatDate(f.start_date)}${f.end_date ? ` – ${formatDate(f.end_date)}` : " onwards"}.`,
  );
  revalidate();
  return ok("Contract renewed");
}

export async function terminateContract(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return fail(ctx.error!);
  const { me, supabase } = ctx;

  const id = str(fd, "id");
  const remarks = str(fd, "remarks");
  if (!id || !UUID.test(id)) return fail("Missing contract");
  if (!remarks) return fail("Please give a reason for termination");
  if (remarks.length > 1000) return fail("Reason must be under 1000 characters");

  const { data: c } = await supabase.from("contracts").select("id, employee_id, title, status, start_date, end_date, terms").eq("id", id).maybeSingle();
  if (!c) return fail("Contract not found");
  if (!["active", "draft"].includes(c.status)) return fail(`A ${c.status} contract can't be terminated`);

  const today = orgToday();
  const endOn = c.end_date && c.end_date < today ? c.end_date : today < c.start_date ? c.start_date : today;
  const note = `Terminated on ${formatDate(today)} by ${me.full_name}: ${remarks}`;
  const { error } = await supabase
    .from("contracts")
    .update({ status: "terminated", end_date: endOn, terms: c.terms ? `${c.terms}\n\n${note}` : note })
    .eq("id", id);
  if (error) return fail(dbError(error));
  if (c.status === "active") await notifyEmployee(supabase, c.employee_id, `Contract terminated: ${c.title}`, remarks.slice(0, 200));
  revalidate();
  return ok("Contract terminated");
}

export async function deleteContract(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return fail(ctx.error!);
  const id = str(fd, "id");
  if (!id || !UUID.test(id)) return fail("Missing contract");
  const { data: c } = await ctx.supabase.from("contracts").select("status").eq("id", id).maybeSingle();
  if (!c) return fail("Contract not found");
  if (c.status !== "draft") return fail("Only draft contracts can be deleted — terminate active ones instead");
  const { error } = await ctx.supabase.from("contracts").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidate();
  return ok("Draft deleted");
}
