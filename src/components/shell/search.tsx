"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Search, Loader2, LayoutGrid } from "lucide-react";
import { allLeaves, moduleFor, type Viewer } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { searchEmployees, type EmployeeHit } from "@/app/(portal)/_actions";

type Result = { kind: "module"; key: string; label: string; sub: string; href: string } | { kind: "employee"; hit: EmployeeHit; href: string };

export function GlobalSearch({ viewer }: { viewer: Viewer }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<EmployeeHit[]>([]);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const leaves = useMemo(() => allLeaves(viewer), [viewer]);

  const moduleHits = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const seen = new Set<string>();
    return leaves
      .filter((l) => l.label.toLowerCase().includes(term) || l.moduleLabel.toLowerCase().includes(term))
      .filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true)))
      .slice(0, 7);
  }, [q, leaves]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(() => {
      startTransition(async () => setPeople(await searchEmployees(term)));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const results: Result[] = [
    ...moduleHits.map((l) => ({ kind: "module" as const, key: l.key, label: l.label, sub: l.moduleLabel, href: l.href })),
    ...(q.trim().length >= 2 ? people : []).map((p) => ({ kind: "employee" as const, hit: p, href: `/directory/${p.id}` })),
  ];

  const go = (r: Result) => {
    setOpen(false);
    setQ("");
    router.push(r.href);
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-2xl">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              go(results[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder="Search by module name or employee name/ID"
          className="h-10 w-full rounded-lg border border-transparent bg-slate-100/80 pl-11 pr-10 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/15"
          aria-label="Search"
        />
        {pending && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
      </div>

      {open && q.trim() && (
        <div className="absolute left-0 right-0 top-12 z-[60] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          {results.length === 0 && !pending && <p className="px-4 py-6 text-center text-sm text-slate-500">No matches for “{q}”</p>}
          {moduleHits.length > 0 && <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Modules</p>}
          {results.map((r, i) =>
            r.kind === "module" ? (
              <Link
                key={r.key}
                href={r.href}
                onClick={() => {
                  setOpen(false);
                  setQ("");
                }}
                onMouseEnter={() => setActive(i)}
                className={cn("flex items-center gap-3 px-4 py-2 text-sm", active === i ? "bg-primary-50" : "hover:bg-slate-50")}
              >
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-md", moduleFor(leaves.find((l) => l.key === r.key)?.moduleKey ?? "")?.theme.pill)}>
                  <LayoutGrid className="h-3.5 w-3.5 text-slate-600" />
                </span>
                <span className="flex-1 text-slate-800">{r.label}</span>
                <span className="text-xs text-slate-400">{r.sub}</span>
              </Link>
            ) : (
              <div key={r.hit.id}>
                {i === moduleHits.length && <p className="border-t border-slate-100 px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Employees</p>}
                <Link
                  href={r.href}
                  onClick={() => {
                    setOpen(false);
                    setQ("");
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex items-center gap-3 px-4 py-2 text-sm", active === i ? "bg-primary-50" : "hover:bg-slate-50")}
                >
                  <Avatar name={r.hit.full_name} src={r.hit.avatar_url} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-slate-800">{r.hit.full_name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {r.hit.employee_code}
                      {r.hit.designation ? ` · ${r.hit.designation}` : ""}
                      {r.hit.department ? ` · ${r.hit.department}` : ""}
                    </span>
                  </span>
                </Link>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
