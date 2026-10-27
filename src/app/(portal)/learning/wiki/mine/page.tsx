import Link from "next/link";
import { Eye, FileText, Pencil, PenLine, Send, ThumbsUp, Trash2, Undo2 } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState, PageHeader, StatusBadge, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { LinkTabs } from "@/components/ui/link-tabs";
import { formatDate } from "@/lib/utils";
import { deleteWikiArticle, submitWikiArticle, withdrawWikiArticle } from "../../wiki-actions";
import { readMinutes, wikiExcerpt } from "../../_lib/wiki";

export const metadata = { title: "My Articles" };

const TABS = ["all", "draft", "submitted", "published", "rejected"] as const;

export default async function MyArticlesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireEmployee();
  const { tab: rawTab } = await searchParams;
  const tab = (TABS as readonly string[]).includes(rawTab ?? "") ? rawTab! : "all";
  const supabase = await createClient();
  const { data } = await supabase
    .from("wiki_articles")
    .select("id, title, category, content, status, review_remarks, view_count, like_count, published_at, updated_at, submitted_at")
    .eq("author_id", me.id)
    .order("updated_at", { ascending: false });
  const articles = data ?? [];
  const count = (s: string) => articles.filter((a) => a.status === s).length;
  const shown = tab === "all" ? articles : articles.filter((a) => a.status === tab);

  return (
    <div>
      <PageHeader
        title="My Articles"
        description="Your drafts, articles awaiting review and everything you've published."
        breadcrumbs={[{ label: "Learning", href: "/learning" }, { label: "Knowledge Wiki", href: "/learning/wiki" }, { label: "My Articles" }]}
        actions={
          <Link href="/learning/wiki/new" className={buttonClass("primary")}>
            <PenLine className="h-4 w-4" /> Add new article
          </Link>
        }
      />
      <LinkTabs
        tabs={[
          { label: "All", href: "/learning/wiki/mine", count: articles.length },
          { label: "Drafts", href: "/learning/wiki/mine?tab=draft", count: count("draft") },
          { label: "Submitted", href: "/learning/wiki/mine?tab=submitted", count: count("submitted") },
          { label: "Published", href: "/learning/wiki/mine?tab=published", count: count("published") },
          { label: "Rejected", href: "/learning/wiki/mine?tab=rejected", count: count("rejected") },
        ]}
      />
      <Card>
        {shown.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={articles.length === 0 ? "You haven't written anything yet" : "Nothing here"}
            description={articles.length === 0 ? "Share a how-to, a checklist or a lesson learned with your colleagues." : "No articles with this status."}
            action={
              articles.length === 0 ? (
                <Link href="/learning/wiki/new" className={buttonClass("secondary", "sm")}>
                  Write your first article
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/learning/wiki/${a.id}`} className="text-sm font-semibold text-slate-800 hover:text-[#25708a]">
                      {a.title}
                    </Link>
                    <StatusBadge status={a.status} label={a.status === "submitted" ? "In review" : undefined} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{wikiExcerpt(a.content, 200) || "No content yet."}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    <span>{a.category}</span>
                    <span>{readMinutes(a.content)} min read</span>
                    {a.status === "published" ? (
                      <>
                        <span>Published {formatDate(a.published_at)}</span>
                        <span className="inline-flex items-center gap-1">
                          <Eye className="h-3 w-3" /> {a.view_count}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <ThumbsUp className="h-3 w-3" /> {a.like_count}
                        </span>
                      </>
                    ) : a.status === "submitted" ? (
                      <span>Submitted {formatDate(a.submitted_at)}</span>
                    ) : (
                      <span>Updated {formatDate(a.updated_at)}</span>
                    )}
                  </div>
                  {a.status === "rejected" && a.review_remarks && (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-inset ring-red-200">HR remarks: {a.review_remarks}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {(a.status === "draft" || a.status === "rejected") && (
                    <ActionButton action={submitWikiArticle} fields={{ id: a.id }} variant="secondary">
                      <Send className="h-3.5 w-3.5" /> Submit
                    </ActionButton>
                  )}
                  {a.status === "submitted" && (
                    <ActionButton action={withdrawWikiArticle} fields={{ id: a.id }} confirm="Move this article back to drafts?">
                      <Undo2 className="h-3.5 w-3.5" /> Withdraw
                    </ActionButton>
                  )}
                  <Link href={`/learning/wiki/${a.id}/edit`} className={buttonClass("outline", "sm")}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Link>
                  <ActionButton action={deleteWikiArticle} fields={{ id: a.id }} variant="ghost" confirm={`Delete "${a.title}"? This can't be undone.`} title="Delete">
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
