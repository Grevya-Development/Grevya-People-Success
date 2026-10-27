import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, Clock, Eye, Pencil, ThumbsUp, Trash2 } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Card, CardBody, CardHeader, PageHeader, StatusBadge, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { cn, formatDate } from "@/lib/utils";
import { deleteWikiArticle, reviewWikiArticle, toggleWikiLike } from "../../wiki-actions";
import { WikiContent } from "../../_components/wiki-content";
import { WikiViewTracker } from "../../_components/wiki-view-tracker";
import { categoryStyle } from "../../_lib/course";
import { readMinutes } from "../../_lib/wiki";

export const metadata = { title: "Knowledge Wiki" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function WikiArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireEmployee();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();

  const { data: a } = await supabase
    .from("wiki_articles")
    .select(
      "id, title, category, tags, content, status, review_remarks, view_count, like_count, published_at, updated_at, author_id, author:employees!wiki_articles_author_id_fkey(full_name, avatar_url, designation:designations(title))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!a) notFound();

  const isAuthor = a.author_id === me.id;
  const published = a.status === "published";
  const [{ data: myLike }, { data: relatedData }] = await Promise.all([
    supabase.from("wiki_article_likes").select("article_id").eq("article_id", id).eq("employee_id", me.id).maybeSingle(),
    supabase
      .from("wiki_articles")
      .select("id, title, content")
      .eq("status", "published")
      .eq("category", a.category)
      .neq("id", id)
      .order("published_at", { ascending: false })
      .limit(4),
  ]);
  const related = relatedData ?? [];
  const style = categoryStyle(a.category);

  return (
    <div>
      {published && !isAuthor && <WikiViewTracker articleId={a.id} />}
      <PageHeader
        title={a.title}
        breadcrumbs={[
          { label: "Learning", href: "/learning" },
          { label: "Knowledge Wiki", href: "/learning/wiki" },
          ...(isAuthor && !published ? [{ label: "My Articles", href: "/learning/wiki/mine" }] : []),
          { label: a.title.length > 40 ? a.title.slice(0, 40) + "…" : a.title },
        ]}
        actions={
          isAuthor || me.isHR ? (
            <>
              {isAuthor && (
                <Link href={`/learning/wiki/${a.id}/edit`} className={buttonClass("outline")}>
                  <Pencil className="h-4 w-4" /> Edit
                </Link>
              )}
              <ActionButton action={deleteWikiArticle} fields={{ id: a.id, redirect: isAuthor ? "mine" : "wiki" }} confirm={`Delete "${a.title}"? This can't be undone.`} size="md">
                <Trash2 className="h-4 w-4 text-red-500" /> Delete
              </ActionButton>
            </>
          ) : undefined
        }
      />

      {!published && (
        <div
          className={cn(
            "mb-5 flex flex-wrap items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset",
            a.status === "rejected" ? "bg-red-50 text-red-800 ring-red-200" : "bg-amber-50 text-amber-900 ring-amber-200",
          )}
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">
                {a.status === "draft" && "Draft — only you can see this article."}
                {a.status === "submitted" && "Awaiting HR review — not visible to others yet."}
                {a.status === "rejected" && "HR asked for changes before publishing."}
              </p>
              {a.review_remarks && <p className="mt-1 text-xs">Remarks: {a.review_remarks}</p>}
            </div>
          </div>
          {me.isHR && a.status === "submitted" && (
            <div className="flex gap-2">
              <ActionButton action={reviewWikiArticle} fields={{ id: a.id, decision: "publish" }} variant="success" prompt="Note to the author (optional)">
                Publish
              </ActionButton>
              <ActionButton action={reviewWikiArticle} fields={{ id: a.id, decision: "reject" }} variant="danger" prompt="What should the author change?" promptRequired>
                Reject
              </ActionButton>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardBody className="p-5 sm:p-7">
            <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 pb-4 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <Avatar name={a.author?.full_name} src={a.author?.avatar_url} size="sm" />
                <div>
                  <p className="text-sm font-medium text-slate-800">{a.author?.full_name ?? "Former employee"}</p>
                  <p>{a.author?.designation?.title ?? ""}</p>
                </div>
              </div>
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", style.chip)}>{a.category}</span>
              {!published && <StatusBadge status={a.status} />}
              <span>{published ? `Published ${formatDate(a.published_at)}` : `Updated ${formatDate(a.updated_at)}`}</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {readMinutes(a.content)} min read
              </span>
              {published && (
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" /> {a.view_count} views
                </span>
              )}
            </div>
            <WikiContent content={a.content} />
            {a.tags.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-1.5">
                {a.tags.map((t) => (
                  <Link key={t} href={`/learning/wiki?q=${encodeURIComponent(t)}`} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-[#d5e9f0]">
                    #{t}
                  </Link>
                ))}
              </div>
            )}
            {published && (
              <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl bg-[#d5e9f0]/40 px-4 py-3">
                <p className="text-sm text-slate-700">Was this article helpful?</p>
                {isAuthor ? (
                  <span className="inline-flex items-center gap-1 text-sm text-slate-500">
                    <ThumbsUp className="h-4 w-4" /> {a.like_count} found this helpful
                  </span>
                ) : (
                  <ActionButton
                    action={toggleWikiLike}
                    fields={{ id: a.id }}
                    variant={myLike ? "primary" : "outline"}
                    className={myLike ? "bg-[#3a95b3] hover:bg-[#25708a]" : undefined}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" /> {myLike ? "Helpful" : "Mark helpful"} · {a.like_count}
                  </ActionButton>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title={`More in ${a.category}`} />
            {related.length === 0 ? (
              <p className="px-5 py-4 text-xs text-slate-500">No other articles in this category yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {related.map((r) => (
                  <li key={r.id} className="px-5 py-3">
                    <Link href={`/learning/wiki/${r.id}`} className="line-clamp-2 text-sm font-medium text-slate-700 hover:text-[#25708a]">
                      {r.title}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-slate-400">{readMinutes(r.content)} min read</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <p className="text-sm font-medium text-slate-800">Share what you know</p>
            <p className="mt-1 text-xs text-slate-500">Write a guide, a checklist or a lesson learned. HR reviews new articles before they go live.</p>
            <Link href="/learning/wiki/new" className={buttonClass("secondary", "sm", "mt-3")}>
              Write an article
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
