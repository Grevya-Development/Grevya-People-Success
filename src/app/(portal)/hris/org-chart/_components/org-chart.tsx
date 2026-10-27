"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Crosshair, Minus, Plus, Search, Users } from "lucide-react";
import { Avatar, Button, Card, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

export type OrgPerson = {
  id: string;
  name: string;
  code: string;
  avatar: string | null;
  managerId: string | null;
  designation: string | null;
  department: string | null;
};

type Graph = {
  byId: Map<string, OrgPerson>;
  roots: string[];
  kids: Map<string, string[]>;
  parent: Map<string, string>;
  depthOf: Map<string, number>;
  maxDepth: number;
};

/**
 * Build a forest from manager links. Orphans (manager missing / exited) become
 * roots; anything unreachable (a reporting cycle) is attached as an extra root
 * so every person appears exactly once.
 */
function buildGraph(people: OrgPerson[]): Graph {
  const byId = new Map(people.map((p) => [p.id, p]));
  const rawKids = new Map<string, string[]>();
  const seedRoots: string[] = [];
  for (const p of people) {
    if (p.managerId && p.managerId !== p.id && byId.has(p.managerId)) {
      const arr = rawKids.get(p.managerId) ?? [];
      arr.push(p.id);
      rawKids.set(p.managerId, arr);
    } else {
      seedRoots.push(p.id);
    }
  }
  const byName = (a: string, b: string) => (byId.get(a)!.name || "").localeCompare(byId.get(b)!.name || "");
  for (const arr of rawKids.values()) arr.sort(byName);
  seedRoots.sort(byName);

  const kids = new Map<string, string[]>();
  const parent = new Map<string, string>();
  const depthOf = new Map<string, number>();
  const roots: string[] = [];
  let maxDepth = 0;

  const walk = (root: string) => {
    roots.push(root);
    depthOf.set(root, 0);
    const queue = [root];
    while (queue.length) {
      const id = queue.shift()!;
      const d = depthOf.get(id)!;
      maxDepth = Math.max(maxDepth, d);
      const list: string[] = [];
      for (const c of rawKids.get(id) ?? []) {
        if (depthOf.has(c)) continue;
        depthOf.set(c, d + 1);
        parent.set(c, id);
        list.push(c);
        queue.push(c);
      }
      if (list.length) kids.set(id, list);
    }
  };
  for (const r of seedRoots) walk(r);
  for (const p of people) if (!depthOf.has(p.id)) walk(p.id);

  return { byId, roots, kids, parent, depthOf, maxDepth };
}

function ancestorsOf(g: Graph, id: string): string[] {
  const out: string[] = [];
  let cur = g.parent.get(id);
  while (cur && out.length < 100) {
    out.unshift(cur);
    cur = g.parent.get(cur);
  }
  return out;
}

const TREE_CSS = `
.oc-tree ul { position: relative; display: flex; justify-content: center; padding-top: 22px; margin: 0; }
.oc-tree > ul { padding-top: 0; gap: 28px; }
.oc-tree li { position: relative; display: flex; flex-direction: column; align-items: center; flex-shrink: 0; list-style: none; padding: 22px 7px 0; }
.oc-tree > ul > li { padding-top: 0; }
.oc-tree li::before, .oc-tree li::after { content: ""; position: absolute; top: 0; right: 50%; width: 50%; height: 22px; border-top: 1.5px solid #b9c6ee; }
.oc-tree li::after { right: auto; left: 50%; border-left: 1.5px solid #b9c6ee; }
.oc-tree li:only-child::before, .oc-tree li:only-child::after { display: none; }
.oc-tree li:only-child { padding-top: 0; }
.oc-tree li:first-child::before, .oc-tree li:last-child::after { border: 0 none; }
.oc-tree li:last-child::before { border-right: 1.5px solid #b9c6ee; border-radius: 0 6px 0 0; }
.oc-tree li:first-child::after { border-radius: 6px 0 0 0; }
.oc-tree ul ul::before { content: ""; position: absolute; top: 0; left: 50%; height: 22px; border-left: 1.5px solid #b9c6ee; }
.oc-tree > ul > li::before, .oc-tree > ul > li::after { display: none; }
@keyframes oc-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.55); } 50% { box-shadow: 0 0 0 8px rgba(245, 158, 11, 0); } }
.oc-focus { animation: oc-pulse 1.2s ease-in-out 3; }
`;

const ZOOMS = [0.5, 0.65, 0.8, 1, 1.15];

export function OrgChart({ people, meId }: { people: OrgPerson[]; meId: string }) {
  const g = useMemo(() => buildGraph(people), [people]);
  const containerRef = useRef<HTMLDivElement>(null);

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (g.byId.has(meId)) {
      for (const a of ancestorsOf(g, meId)) s.add(a);
      if (g.kids.has(meId)) s.add(meId);
    }
    if (s.size === 0) for (const r of g.roots) if (g.kids.has(r)) s.add(r);
    return s;
  });
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(3);

  const matches = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (t.length < 1) return [];
    return people
      .filter((p) => `${p.name} ${p.code} ${p.designation ?? ""} ${p.department ?? ""}`.toLowerCase().includes(t))
      .slice(0, 8);
  }, [people, query]);

  // Centre the signed-in user's card inside the scroll area on first paint.
  useEffect(() => {
    const box = containerRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-node="${meId}"]`);
    if (!box || !el) return;
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    box.scrollLeft += r.left - b.left - b.width / 2 + r.width / 2;
    box.scrollTop += r.top - b.top - b.height / 3;
  }, [meId]);

  useEffect(() => {
    if (!focus) return;
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-node="${focus.id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [focus]);

  const jumpTo = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const a of ancestorsOf(g, id)) next.add(a);
      return next;
    });
    setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }));
    setQuery("");
    setShowResults(false);
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandAll = () => setExpanded(new Set(g.kids.keys()));
  const collapseAll = () => setExpanded(new Set());

  const chainId = focus?.id ?? (g.byId.has(meId) ? meId : null);
  const chain = chainId ? [...ancestorsOf(g, chainId), chainId] : [];

  const renderNode = (id: string): ReactNode => {
    const p = g.byId.get(id)!;
    const children = g.kids.get(id) ?? [];
    const isOpen = expanded.has(id) && children.length > 0;
    const isMe = id === meId;
    const isFocus = focus?.id === id;
    return (
      <li key={id}>
        <div
          data-node={id}
          className={cn(
            "relative w-52 overflow-hidden rounded-xl border bg-white text-center shadow-[0_1px_3px_rgba(15,23,42,0.08)] transition",
            isMe ? "border-[#5b74d6] ring-2 ring-[#5b74d6]/40" : "border-slate-200",
            isFocus && "oc-focus border-amber-400 ring-2 ring-amber-400/70",
          )}
        >
          <div className={cn("h-1.5", isMe ? "bg-[#5b74d6]" : "bg-[#dce5fa]")} />
          {isMe && (
            <span className="absolute right-2 top-3 rounded-full bg-[#5b74d6] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
              You
            </span>
          )}
          <div className="flex flex-col items-center px-3 pb-2.5 pt-3">
            <Avatar name={p.name} src={p.avatar} size="lg" />
            <Link href={`/directory/${p.id}`} className="mt-2 line-clamp-1 text-sm font-semibold text-slate-800 hover:text-[#3753b8]" title={p.name}>
              {p.name}
            </Link>
            <p className="line-clamp-1 text-xs text-slate-600" title={p.designation ?? undefined}>
              {p.designation ?? "—"}
            </p>
            <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">
              {p.code}
              {p.department ? ` · ${p.department}` : ""}
            </p>
          </div>
          {children.length > 0 ? (
            <button
              type="button"
              onClick={() => toggle(id)}
              aria-expanded={isOpen}
              className={cn(
                "flex w-full items-center justify-center gap-1.5 border-t border-slate-100 py-1.5 text-xs font-medium transition-colors",
                isOpen ? "bg-[#dce5fa]/60 text-[#3753b8]" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              <Users className="h-3.5 w-3.5" />
              {children.length} {children.length === 1 ? "report" : "reports"}
              {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <div className="border-t border-slate-100 py-1.5 text-[11px] text-slate-400">No direct reports</div>
          )}
        </div>
        {isOpen && <ul>{children.map(renderNode)}</ul>}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <style>{TREE_CSS}</style>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) {
                  e.preventDefault();
                  jumpTo(matches[0].id);
                } else if (e.key === "Escape") {
                  setShowResults(false);
                }
              }}
              placeholder="Find a person by name, code or role…"
              className="pl-9"
              aria-label="Search organisation"
            />
            {showResults && query.trim() && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                {matches.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-slate-500">No one matches “{query.trim()}”.</p>
                ) : (
                  <ul className="max-h-72 overflow-y-auto thin-scroll">
                    {matches.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => jumpTo(m.id)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50"
                        >
                          <Avatar name={m.name} src={m.avatar} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-800">{m.name}</span>
                            <span className="block truncate text-[11px] text-slate-500">
                              {m.code}
                              {m.designation ? ` · ${m.designation}` : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {g.byId.has(meId) && (
              <Button variant="outline" size="sm" onClick={() => jumpTo(meId)}>
                <Crosshair className="h-3.5 w-3.5" /> My position
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={expandAll}>
              <ChevronsUpDown className="h-3.5 w-3.5" /> Expand all
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>
              <ChevronsDownUp className="h-3.5 w-3.5" /> Collapse all
            </Button>
            <div className="flex items-center rounded-lg border border-slate-300 bg-white">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                onClick={() => setZoomIdx((z) => Math.max(0, z - 1))}
                disabled={zoomIdx === 0}
                aria-label="Zoom out"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-11 text-center text-xs tabular-nums text-slate-600">{Math.round(ZOOMS[zoomIdx] * 100)}%</span>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                onClick={() => setZoomIdx((z) => Math.min(ZOOMS.length - 1, z + 1))}
                disabled={zoomIdx === ZOOMS.length - 1}
                aria-label="Zoom in"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>
            <strong className="text-slate-700">{people.length}</strong> people
          </span>
          <span>
            <strong className="text-slate-700">{g.maxDepth + 1}</strong> {g.maxDepth === 0 ? "level" : "levels"}
          </span>
          <span>
            <strong className="text-slate-700">{g.roots.length}</strong> top-level
          </span>
          {chain.length > 1 && (
            <span className="flex min-w-0 flex-wrap items-center gap-1">
              <span className="mr-1">{focus ? "Reporting line:" : "Your reporting line:"}</span>
              {chain.map((id, i) => (
                <span key={id} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
                  <button
                    type="button"
                    onClick={() => jumpTo(id)}
                    className={cn(
                      "rounded-full px-2 py-0.5 font-medium",
                      i === chain.length - 1 ? "bg-[#5b74d6] text-white" : "bg-[#dce5fa] text-[#3753b8] hover:bg-[#c9d7f7]",
                    )}
                  >
                    {g.byId.get(id)?.name}
                  </button>
                </span>
              ))}
            </span>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div ref={containerRef} className="max-h-[calc(100vh-260px)] min-h-[420px] overflow-auto bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:18px_18px] thin-scroll">
          <div className="oc-tree inline-block min-w-full p-8" style={{ zoom: ZOOMS[zoomIdx] }}>
            <ul>{g.roots.map(renderNode)}</ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
