"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownAZ, ArrowUpZA, BookOpen, Download, Eye, FileText, FolderOpen, Search } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { fileKind, formatBytes, isViewable } from "../_lib/files";
import { FileBadge } from "./file-badge";

export type LibraryItem = {
  id: string;
  title: string;
  category: string;
  summary: string | null;
  version: string;
  effectiveDate: string;
  published: boolean;
  hasContent: boolean;
  requiresAck: boolean;
  ackedAt: string | null;
  docName: string | null;
  docSize: number | null;
  docType: string | null;
};

const BRAND = "#3753b8";

export function DocumentLibrary({ items }: { items: LibraryItem[] }) {
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.category, (m.get(i.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter(
      (i) =>
        (!category || i.category === category) &&
        (!q || [i.title, i.category, i.summary ?? "", i.docName ?? ""].some((s) => s.toLowerCase().includes(q))),
    );
    list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) * (order === "asc" ? 1 : -1));
    return list;
  }, [items, query, category, order]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 text-white" style={{ backgroundColor: BRAND }}>
        <FolderOpen className="h-4 w-4" />
        <h2 className="text-sm font-semibold tracking-wide">Documents</h2>
      </div>

      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm font-semibold text-slate-800">
          All Documents <span className="font-normal text-slate-400">({visible.length})</span>
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => setOrder((o) => (o === "asc" ? "desc" : "asc"))}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
            data-testid="sort-toggle"
            aria-label={`Sort alphabetically ${order === "asc" ? "Z to A" : "A to Z"}`}
          >
            {order === "asc" ? <ArrowDownAZ className="h-4 w-4 text-slate-500" /> : <ArrowUpZA className="h-4 w-4 text-slate-500" />}
            Alphabetically: {order === "asc" ? "A - Z" : "Z - A"}
          </button>
          <label className="relative block sm:w-64">
            <span className="sr-only">Search documents</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </label>
        </div>
      </div>

      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-5 pt-4 thin-scroll" role="tablist" aria-label="Filter by category">
          {[["All", items.length] as const, ...categories].map(([c, n]) => {
            const active = c === "All" ? category === null : category === c;
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(c === "All" ? null : c)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition",
                  active ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                )}
                style={active ? { backgroundColor: BRAND } : undefined}
              >
                {c} <span className={active ? "text-white/80" : "text-slate-400"}>{n}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="p-5">
        {visible.length === 0 ? (
          <EmptyState icon={Search} title="No documents found" description="Try a different search or category." className="py-10" />
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="doc-grid">
            {visible.map((i) => (
              <DocCard key={i.id} item={i} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function DocCard({ item: i }: { item: LibraryItem }) {
  const kind = i.docName ? fileKind(i.docName, i.docType) : null;
  const viewable = kind ? isViewable(kind) : false;
  const iconBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-[#5b74d6] hover:bg-[#dce5fa]/50 hover:text-[#3753b8]";

  return (
    <li
      className="flex flex-col rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition hover:border-[#5b74d6]/50 hover:shadow-md"
      data-testid="doc-card"
      data-title={i.title}
    >
      <div className="flex items-start gap-3">
        {kind ? (
          <FileBadge kind={kind} />
        ) : (
          <span className="flex h-14 w-11 shrink-0 items-center justify-center rounded-[5px] border border-[#5b74d6]/30 bg-[#dce5fa]/60 text-[#3753b8]">
            <FileText className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <Link href={`/hris/policies/${i.id}`} className="line-clamp-2 text-sm font-semibold text-slate-800 hover:text-[#3753b8]">
            {i.title}
          </Link>
          <p className="mt-0.5 text-xs text-slate-500">
            {i.category} · v{i.version} · Effective {formatDate(i.effectiveDate)}
          </p>
          {i.docName ? (
            <p className="mt-1 text-xs text-slate-600" data-testid="doc-size">
              Documents Size <span className="font-medium text-slate-800">{formatBytes(i.docSize)}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">Online policy</p>
          )}
        </div>
        {i.docName && (
          <a
            href={`/hris/policies/${i.id}/document`}
            target={viewable ? "_blank" : undefined}
            rel="noopener noreferrer"
            className={iconBtn}
            title={viewable ? `View ${i.docName}` : `Download ${i.docName}`}
            aria-label={viewable ? `View ${i.title}` : `Download ${i.title}`}
            data-testid={viewable ? "doc-view" : "doc-download"}
          >
            {viewable ? <Eye className="h-4 w-4" /> : <Download className="h-4 w-4" />}
          </a>
        )}
      </div>

      {i.summary && <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-600">{i.summary}</p>}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {i.hasContent && (
          <Link href={`/hris/policies/${i.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-[#3753b8] hover:underline">
            <BookOpen className="h-3.5 w-3.5" /> Read policy
          </Link>
        )}
        <span className="ml-auto flex flex-wrap justify-end gap-1.5">
          {!i.published && <Badge tone="gray">Draft</Badge>}
          {i.requiresAck &&
            (i.ackedAt ? (
              <span title={`Acknowledged ${formatDateTime(i.ackedAt)}`}>
                <Badge tone="green">Acknowledged</Badge>
              </span>
            ) : (
              <Link href={`/hris/policies/${i.id}`} title="Open to acknowledge">
                <Badge tone="yellow">Acknowledgement required</Badge>
              </Link>
            ))}
        </span>
      </div>
    </li>
  );
}
