"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str, num, bool, orgToday } from "@/lib/utils";
import { POLICY_DOC_EXT, POLICY_DOC_MAX_BYTES } from "../../policies/_lib/files";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function hrContext() {
  const me = await getCurrentEmployee();
  if (!me) return { error: "Not signed in" } as const;
  if (!me.isHR) return { error: "Only HR can manage policies and FAQs" } as const;
  return { me, supabase: await createClient() } as const;
}

type DocFields = { document_path: string | null; document_name: string | null; document_size: number | null; document_type: string | null };

/**
 * Validate a document the HR user just uploaded straight to storage (files up to
 * 20 MB exceed the server-action body limit, so the browser uploads them to the
 * user's own folder and sends only the path). Size and type come from storage.
 */
async function verifyUploadedDocument(userId: string | null, path: string, name: string | null): Promise<DocFields | string> {
  if (!userId) return "Your login is not linked to an employee record";
  const prefix = `${userId}/policies/`;
  if (!path.startsWith(prefix) || path.includes("..") || path.slice(prefix.length).includes("/")) return "Invalid document upload";
  if (!name || name.length > 255) return "Document name is missing or too long";
  if (!POLICY_DOC_EXT.test(name) || !POLICY_DOC_EXT.test(path)) return "Upload a PDF, Word, Excel, ZIP or image file";
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("documents").info(path);
  if (error || !data) return "Uploaded document not found — please try again";
  const size = Number(data.size ?? 0);
  if (size > POLICY_DOC_MAX_BYTES) {
    await admin.storage.from("documents").remove([path]);
    return "Document must be 20 MB or smaller";
  }
  return { document_path: path, document_name: name, document_size: size, document_type: data.contentType ?? null };
}

async function removeStoredDocument(path: string | null | undefined) {
  if (!path) return;
  // Files may sit in another HR user's folder, so use the service role (HR verified by the caller).
  await createAdminClient().storage.from("documents").remove([path]);
}

function revalidateAll(id?: string) {
  revalidatePath("/hris/admin/policies");
  revalidatePath("/hris/policies");
  if (id) revalidatePath(`/hris/policies/${id}`);
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------
export async function savePolicy(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return fail(ctx.error!);
  const { supabase } = ctx;

  const id = str(fd, "id");
  if (id && !UUID.test(id)) return fail("Invalid policy");
  const title = str(fd, "title");
  const category = str(fd, "category") ?? "General";
  const summary = str(fd, "summary");
  const content = str(fd, "content");
  const version = str(fd, "version") ?? "1.0";
  const effective_date = str(fd, "effective_date") ?? orgToday();
  const requires_acknowledgement = bool(fd, "requires_acknowledgement");
  const published = bool(fd, "published");
  const resetAcks = bool(fd, "reset_acknowledgements");

  if (!title) return fail("Title is required");
  if (title.length > 200) return fail("Title must be under 200 characters");
  if (category.length > 60) return fail("Category must be under 60 characters");
  if (summary && summary.length > 600) return fail("Summary must be under 600 characters");
  if (content && content.length > 200_000) return fail("Policy content is too long");
  if (version.length > 20) return fail("Version must be under 20 characters");
  if (!DATE.test(effective_date) || Number.isNaN(Date.parse(effective_date))) return fail("Enter a valid effective date");

  const newPath = str(fd, "document_path");
  const removeDoc = bool(fd, "remove_document");
  let doc: DocFields | null = null;
  if (newPath) {
    const checked = await verifyUploadedDocument(ctx.me.user_id, newPath, str(fd, "document_name"));
    if (typeof checked === "string") return fail(checked);
    doc = checked;
  } else if (removeDoc) {
    doc = { document_path: null, document_name: null, document_size: null, document_type: null };
  }

  let oldPath: string | null = null;
  if (id) {
    const { data: current } = await supabase.from("policies").select("document_path").eq("id", id).maybeSingle();
    if (!current) return fail("Policy not found");
    oldPath = current.document_path;
  }
  const finalPath = doc ? doc.document_path : oldPath;
  if (!content && !finalPath) return fail("Add policy content or upload a document");

  const row = { title, category, summary, content, version, effective_date, requires_acknowledgement, published, ...(doc ?? {}) };

  if (id) {
    const { data, error } = await supabase.from("policies").update(row).eq("id", id).select("id").maybeSingle();
    if (error) return fail(dbError(error));
    if (!data) return fail("Policy not found");
    if (doc && oldPath && oldPath !== doc.document_path) await removeStoredDocument(oldPath);
    if (resetAcks) {
      // No RLS delete policy exists for acknowledgements; HR verified above.
      const admin = createAdminClient();
      const { error: delErr } = await admin.from("policy_acknowledgements").delete().eq("policy_id", id);
      if (delErr) return fail(dbError(delErr));
    }
    revalidateAll(id);
    return ok(resetAcks ? "Policy updated — acknowledgements reset" : "Policy updated", "/hris/admin/policies");
  }

  const { data, error } = await supabase.from("policies").insert(row).select("id").single();
  if (error) return fail(dbError(error));
  revalidateAll(data.id);
  return ok("Policy created", "/hris/admin/policies");
}

export async function setPolicyPublished(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return fail(ctx.error!);
  const id = str(fd, "id");
  if (!id || !UUID.test(id)) return fail("Invalid policy");
  const published = bool(fd, "published");
  const { data, error } = await ctx.supabase.from("policies").update({ published }).eq("id", id).select("id").maybeSingle();
  if (error) return fail(dbError(error));
  if (!data) return fail("Policy not found");
  revalidateAll(id);
  return ok(published ? "Policy published" : "Policy moved to draft");
}

export async function deletePolicy(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return fail(ctx.error!);
  const id = str(fd, "id");
  if (!id || !UUID.test(id)) return fail("Invalid policy");
  const { data: existing } = await ctx.supabase.from("policies").select("document_path").eq("id", id).maybeSingle();
  const { error } = await ctx.supabase.from("policies").delete().eq("id", id);
  if (error) return fail(dbError(error));
  await removeStoredDocument(existing?.document_path);
  revalidateAll(id);
  return ok("Policy deleted", "/hris/admin/policies");
}

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------
export async function saveFaq(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return fail(ctx.error!);
  const id = str(fd, "id");
  if (id && !UUID.test(id)) return fail("Invalid FAQ");
  const category = str(fd, "category") ?? "General";
  const question = str(fd, "question");
  const answer = str(fd, "answer");
  const sort = num(fd, "sort_order") ?? 0;

  if (!question) return fail("Question is required");
  if (question.length > 300) return fail("Question must be under 300 characters");
  if (!answer) return fail("Answer is required");
  if (answer.length > 5000) return fail("Answer must be under 5000 characters");
  if (category.length > 60) return fail("Category must be under 60 characters");
  if (!Number.isInteger(sort) || sort < 0 || sort > 9999) return fail("Sort order must be a whole number between 0 and 9999");

  const row = { category, question, answer, sort_order: sort };
  if (id) {
    const { data, error } = await ctx.supabase.from("faqs").update(row).eq("id", id).select("id").maybeSingle();
    if (error) return fail(dbError(error));
    if (!data) return fail("FAQ not found");
  } else {
    const { error } = await ctx.supabase.from("faqs").insert(row);
    if (error) return fail(dbError(error));
  }
  revalidateAll();
  return ok(id ? "FAQ updated" : "FAQ added");
}

export async function deleteFaq(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return fail(ctx.error!);
  const id = str(fd, "id");
  if (!id || !UUID.test(id)) return fail("Invalid FAQ");
  const { error } = await ctx.supabase.from("faqs").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidateAll();
  return ok("FAQ deleted");
}
