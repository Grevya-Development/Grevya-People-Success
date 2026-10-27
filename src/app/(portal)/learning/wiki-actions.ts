"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str } from "@/lib/utils";
import { parseTags } from "./_lib/wiki";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateWiki() {
  revalidatePath("/learning", "layout");
}

/** Create or update one of my articles. intent = draft | submit | publish (HR only). */
export async function saveWikiArticle(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const title = str(fd, "title");
  if (!title) return fail("Title is required");
  if (title.length > 200) return fail("Title is too long (max 200 characters)");
  const category = str(fd, "category") ?? "General";
  if (category.length > 60) return fail("Category is too long");
  const content = (fd.get("content") as string | null)?.replace(/\r\n?/g, "\n").trim() ?? "";
  if (content.length > 50000) return fail("Content is too long (max 50,000 characters)");
  const tags = parseTags(str(fd, "tags"));
  const intent = str(fd, "intent") ?? "draft";
  if (!["draft", "submit", "publish"].includes(intent)) return fail("Unknown action");
  if (intent === "publish" && !me.isHR) return fail("Only HR can publish directly — submit it for review instead");
  if (intent !== "draft" && content.length < 50) return fail("Write at least a few sentences (50+ characters) before submitting");

  const status = intent === "publish" ? "published" : intent === "submit" ? "submitted" : "draft";
  const supabase = await createClient();
  const id = str(fd, "id");
  let articleId = id;
  if (id) {
    if (!UUID_RE.test(id)) return fail("Invalid article");
    const { data: existing } = await supabase.from("wiki_articles").select("id, author_id").eq("id", id).maybeSingle();
    if (!existing || existing.author_id !== me.id) return fail("Article not found");
    const { error } = await supabase.from("wiki_articles").update({ title, category, content, tags, status }).eq("id", id);
    if (error) return fail(dbError(error));
  } else {
    const { data, error } = await supabase.from("wiki_articles").insert({ author_id: me.id, title, category, content, tags, status }).select("id").single();
    if (error) return fail(dbError(error));
    articleId = data.id;
  }
  revalidateWiki();
  if (status === "published") return ok("Article published", `/learning/wiki/${articleId}`);
  if (status === "submitted") return ok("Submitted for HR review", "/learning/wiki/mine");
  return ok("Draft saved", "/learning/wiki/mine");
}

export async function submitWikiArticle(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid article");
  const supabase = await createClient();
  const { data: a } = await supabase.from("wiki_articles").select("id, author_id, status, content").eq("id", id).maybeSingle();
  if (!a || a.author_id !== me.id) return fail("Article not found");
  if (!["draft", "rejected"].includes(a.status)) return fail("Only drafts and rejected articles can be submitted");
  if (a.content.trim().length < 50) return fail("Write at least a few sentences (50+ characters) before submitting");
  const { error } = await supabase.from("wiki_articles").update({ status: "submitted" }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidateWiki();
  return ok("Submitted for HR review");
}

export async function withdrawWikiArticle(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid article");
  const supabase = await createClient();
  const { data: a } = await supabase.from("wiki_articles").select("id, author_id, status").eq("id", id).maybeSingle();
  if (!a || a.author_id !== me.id) return fail("Article not found");
  if (a.status !== "submitted") return fail("Only submitted articles can be moved back to draft");
  const { error } = await supabase.from("wiki_articles").update({ status: "draft" }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidateWiki();
  return ok("Moved back to drafts");
}

export async function deleteWikiArticle(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid article");
  const supabase = await createClient();
  const { data: a } = await supabase.from("wiki_articles").select("id, author_id").eq("id", id).maybeSingle();
  if (!a || (a.author_id !== me.id && !me.isHR)) return fail("Article not found");
  const { error, count } = await supabase.from("wiki_articles").delete({ count: "exact" }).eq("id", id);
  if (error) return fail(dbError(error));
  if (!count) return fail("You don't have permission to do that.");
  revalidateWiki();
  const to = str(fd, "redirect");
  return ok("Article deleted", to === "mine" ? "/learning/wiki/mine" : to === "wiki" ? "/learning/wiki" : undefined);
}

/** HR: publish / reject a submitted article, or unpublish a published one. */
export async function reviewWikiArticle(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can moderate wiki articles");
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid article");
  const decision = str(fd, "decision");
  const remarks = str(fd, "remarks");
  if (decision !== "publish" && decision !== "reject") return fail("Unknown decision");
  if (decision === "reject" && !remarks) return fail("Remarks are required to reject an article");
  if (remarks && remarks.length > 2000) return fail("Remarks are too long");
  const supabase = await createClient();
  const { data: a } = await supabase.from("wiki_articles").select("id, status").eq("id", id).maybeSingle();
  if (!a) return fail("Article not found");
  if (decision === "publish" && a.status !== "submitted") return fail("Only submitted articles can be published");
  if (decision === "reject" && !["submitted", "published"].includes(a.status)) return fail("This article is not awaiting review");
  const { error } = await supabase
    .from("wiki_articles")
    .update({ status: decision === "publish" ? "published" : "rejected", review_remarks: remarks })
    .eq("id", id);
  if (error) return fail(dbError(error));
  revalidateWiki();
  return ok(decision === "publish" ? "Article published" : a.status === "published" ? "Article unpublished" : "Article rejected");
}

export async function toggleWikiLike(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid article");
  const supabase = await createClient();
  const { data: existing } = await supabase.from("wiki_article_likes").select("article_id").eq("article_id", id).eq("employee_id", me.id).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("wiki_article_likes").delete().eq("article_id", id).eq("employee_id", me.id);
    if (error) return fail(dbError(error));
  } else {
    const { error } = await supabase.from("wiki_article_likes").insert({ article_id: id, employee_id: me.id });
    if (error) return fail(dbError(error));
  }
  revalidatePath(`/learning/wiki/${id}`);
  revalidatePath("/learning/wiki");
  return ok(existing ? "Removed from helpful" : "Marked as helpful");
}

/** Called once per article page visit (client effect). Not counted for the author. */
export async function recordWikiView(articleId: string): Promise<void> {
  if (typeof articleId !== "string" || !UUID_RE.test(articleId)) return;
  const me = await getCurrentEmployee();
  if (!me) return;
  const supabase = await createClient();
  await supabase.rpc("wiki_record_view", { p_article: articleId });
}
