import Link from "next/link";
import { BookMarked, CheckCircle2, Eye, FileClock, ThumbsUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Card, CardHeader, EmptyState, StatCard } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { formatDate } from "@/lib/utils";
import { reviewWikiArticle } from "../wiki-actions";
import { readMinutes, wikiExcerpt } from "../_lib/wiki";

/** HR: Wiki moderation tab of /learning/admin. */
export async function AdminWiki() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wiki_articles")
    .select("id, title, category, content, status, view_count, like_count, submitted_at, published_at, author:employees!wiki_articles_author_id_fkey(full_name, avatar_url)")
    .in("status", ["submitted", "published"])
    .order("submitted_at", { ascending: true, nullsFirst: false });
  const rows = data ?? [];
  const pending = rows.filter((r) => r.status === "submitted");
  const published = rows.filter((r) => r.status === "published").sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  const totalViews = published.reduce((s, a) => s + a.view_count, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Awaiting review" value={pending.length} icon={FileClock} tone="bg-amber-50 text-amber-600" />
        <StatCard label="Published" value={published.length} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" />
        <StatCard label="Total views" value={totalViews} icon={Eye} tone="bg-[#d5e9f0] text-[#25708a]" className="col-span-2 lg:col-span-1" />
      </div>

      <Card>
        <CardHeader title="Awaiting review" description="Publish to make an article visible to everyone, or send it back with remarks." />
        {pending.length === 0 ? (
          <EmptyState icon={BookMarked} title="Nothing to review" description="New submissions from employees will appear here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                <div className="min-w-0 flex-1">
                  <Link href={`/learning/wiki/${a.id}`} className="text-sm font-semibold text-slate-800 hover:text-[#25708a]">
                    {a.title}
                  </Link>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{wikiExcerpt(a.content, 220)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar name={a.author?.full_name} src={a.author?.avatar_url} size="xs" /> {a.author?.full_name}
                    </span>
                    <span>{a.category}</span>
                    <span>{readMinutes(a.content)} min read</span>
                    <span>Submitted {formatDate(a.submitted_at)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link href={`/learning/wiki/${a.id}`} className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    Read
                  </Link>
                  <ActionButton action={reviewWikiArticle} fields={{ id: a.id, decision: "publish" }} variant="success" prompt="Note to the author (optional)">
                    Publish
                  </ActionButton>
                  <ActionButton action={reviewWikiArticle} fields={{ id: a.id, decision: "reject" }} variant="danger" prompt="What should the author change?" promptRequired>
                    Reject
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Published articles" description="Unpublishing sends the article back to its author with your remarks." />
        {published.length === 0 ? (
          <EmptyState icon={BookMarked} title="No published articles yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {published.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <Link href={`/learning/wiki/${a.id}`} className="block truncate text-sm font-medium text-slate-800 hover:text-[#25708a]">
                    {a.title}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
                    <span>{a.author?.full_name}</span>
                    <span>{a.category}</span>
                    <span>{formatDate(a.published_at)}</span>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3 w-3" /> {a.view_count}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ThumbsUp className="h-3 w-3" /> {a.like_count}
                    </span>
                  </p>
                </div>
                <ActionButton action={reviewWikiArticle} fields={{ id: a.id, decision: "reject" }} prompt="Why is this article being unpublished?" promptRequired confirm="Unpublish article">
                  Unpublish
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
