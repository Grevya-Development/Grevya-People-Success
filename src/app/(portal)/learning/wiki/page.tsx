import Link from "next/link";
import { BookMarked, Clock, Eye, PenLine, Search, SearchX, ThumbsUp } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Button, Card, EmptyState, Input, PageHeader, buttonClass } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { categoryStyle } from "../_lib/course";
import { readMinutes, wikiExcerpt } from "../_lib/wiki";

export const metadata = { title: "Knowledge Wiki" };

export default async function WikiPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireEmployee();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");
  const q = one(sp.q).slice(0, 100);
  const category = one(sp.category);

  const supabase = await createClient();
  const { data } = await supabase
    .from("wiki_articles")
    .select("id, title, category, tags, content, view_count, like_count, published_at, author:employees!wiki_articles_author_id_fkey(full_name, avatar_url)")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(500);
  const articles = data ?? [];

  const counts = new Map<string, number>();
  articles.forEach((a) => counts.set(a.category, (counts.get(a.category) ?? 0) + 1));
  const categories = [...counts.keys()].sort();
  const needle = q.toLowerCase();
  const shown = articles.filter(
    (a) =>
      (!category || a.category === category) &&
      (!needle ||
        a.title.toLowerCase().includes(needle) ||
        a.content.toLowerCase().includes(needle) ||
        a.tags.some((t) => t.includes(needle)) ||
        (a.author?.full_name ?? "").toLowerCase().includes(needle)),
  );

  const href = (patch: { q?: string; category?: string }) => {
    const p = new URLSearchParams();
    const nq = patch.q ?? q;
    const nc = patch.category ?? category;
    if (nq) p.set("q", nq);
    if (nc) p.set("category", nc);
    const s = p.toString();
    return `/learning/wiki${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Read Articles"
        description="Know-how written by your colleagues — guides, playbooks and lessons learned."
        breadcrumbs={[{ label: "Learning", href: "/learning" }, { label: "Knowledge Wiki" }, { label: "Read Articles" }]}
        actions={
          <>
            <Link href="/learning/wiki/mine" className={buttonClass("outline")}>
              My Articles
            </Link>
            <Link href="/learning/wiki/new" className={buttonClass("primary")}>
              <PenLine className="h-4 w-4" /> Write article
            </Link>
          </>
        }
      />

      <Card className="mb-5 p-4">
        <form action="/learning/wiki" className="flex gap-2">
          {category && <input type="hidden" name="category" value={category} />}
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={q} placeholder="Search titles, content, tags or authors" className="pl-9" aria-label="Search articles" />
          </div>
          <Button type="submit">Search</Button>
        </form>
        {categories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={href({ category: "" })}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
                !category ? "bg-[#3a95b3] text-white ring-[#3a95b3]" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
              )}
            >
              All ({articles.length})
            </Link>
            {categories.map((c) => (
              <Link
                key={c}
                href={href({ category: c })}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
                  category === c ? "bg-[#3a95b3] text-white ring-[#3a95b3]" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                )}
              >
                {c} ({counts.get(c)})
              </Link>
            ))}
          </div>
        )}
      </Card>

      {shown.length === 0 ? (
        <Card>
          {articles.length === 0 ? (
            <EmptyState
              icon={BookMarked}
              title="No articles yet"
              description="Be the first to share what you know with the team."
              action={
                <Link href="/learning/wiki/new" className={buttonClass("secondary", "sm")}>
                  Write the first article
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="No articles match"
              description="Try a different search or category."
              action={
                <Link href="/learning/wiki" className={buttonClass("outline", "sm")}>
                  Clear filters
                </Link>
              }
            />
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((a) => {
            const style = categoryStyle(a.category);
            return (
              <Card key={a.id} className="flex flex-col p-4 transition hover:shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", style.chip)}>{a.category}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock className="h-3 w-3" /> {readMinutes(a.content)} min read
                  </span>
                </div>
                <Link href={`/learning/wiki/${a.id}`} className="mt-3 line-clamp-2 text-[15px] font-semibold leading-5 text-slate-800 hover:text-[#25708a]">
                  {a.title}
                </Link>
                <p className="mt-2 line-clamp-3 flex-1 text-xs leading-5 text-slate-500">{wikiExcerpt(a.content)}</p>
                {a.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {a.tags.slice(0, 4).map((t) => (
                      <Link key={t} href={href({ q: t })} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-[#d5e9f0]">
                        #{t}
                      </Link>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar name={a.author?.full_name} src={a.author?.avatar_url} size="xs" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-700">{a.author?.full_name ?? "Former employee"}</p>
                      <p className="text-[11px] text-slate-400">{formatDate(a.published_at)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1" title="Views">
                      <Eye className="h-3.5 w-3.5" /> {a.view_count}
                    </span>
                    <span className="inline-flex items-center gap-1" title="Found helpful">
                      <ThumbsUp className="h-3.5 w-3.5" /> {a.like_count}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
