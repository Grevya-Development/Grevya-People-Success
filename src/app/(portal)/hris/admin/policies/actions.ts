"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str, num, bool, orgToday } from "@/lib/utils";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function hrContext() {
  const me = await getCurrentEmployee();
  if (!me) return { error: "Not signed in" } as const;
  if (!me.isHR) return { error: "Only HR can manage policies and FAQs" } as const;
  return { me, supabase: await createClient() } as const;
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
  if (!content) return fail("Policy content is required");
  if (content.length > 200_000) return fail("Policy content is too long");
  if (version.length > 20) return fail("Version must be under 20 characters");
  if (!DATE.test(effective_date) || Number.isNaN(Date.parse(effective_date))) return fail("Enter a valid effective date");

  const row = { title, category, summary, content, version, effective_date, requires_acknowledgement, published };

  if (id) {
    const { data, error } = await supabase.from("policies").update(row).eq("id", id).select("id").maybeSingle();
    if (error) return fail(dbError(error));
    if (!data) return fail("Policy not found");
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
  const { error } = await ctx.supabase.from("policies").delete().eq("id", id);
  if (error) return fail(dbError(error));
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
