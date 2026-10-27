"use client";

import { useMemo, useState } from "react";
import { ChevronDown, HelpCircle, Search } from "lucide-react";
import { Card, EmptyState, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

type Faq = { id: string; category: string; question: string; answer: string };

export function FaqList({ faqs }: { faqs: Faq[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = term
      ? faqs.filter((f) => `${f.question} ${f.answer} ${f.category}`.toLowerCase().includes(term))
      : faqs;
    const map = new Map<string, Faq[]>();
    for (const f of filtered) {
      const arr = map.get(f.category) ?? [];
      arr.push(f);
      map.set(f.category, arr);
    }
    return [...map.entries()];
  }, [faqs, q]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (faqs.length === 0) {
    return (
      <Card>
        <EmptyState icon={HelpCircle} title="No FAQs yet" description="Frequently asked questions added by HR will appear here." />
      </Card>
    );
  }

  const searching = q.trim().length > 0;

  return (
    <div className="space-y-5">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions and answers…" className="pl-9" aria-label="Search FAQs" />
      </div>

      {groups.length === 0 ? (
        <Card>
          <EmptyState icon={Search} title="No matching questions" description={`Nothing matches “${q.trim()}”. Try a different keyword.`} />
        </Card>
      ) : (
        groups.map(([category, items]) => (
          <section key={category}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[#3753b8]">
              <span className="h-4 w-1 rounded-full bg-[#5b74d6]" />
              {category}
            </h2>
            <Card className="divide-y divide-slate-100 overflow-hidden">
              {items.map((f) => {
                const isOpen = searching || open.has(f.id);
                return (
                  <div key={f.id}>
                    <button
                      type="button"
                      onClick={() => toggle(f.id)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
                    >
                      <span>{f.question}</span>
                      <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", isOpen && "rotate-180")} />
                    </button>
                    {isOpen && <div className="whitespace-pre-line px-4 pb-4 text-sm leading-relaxed text-slate-600">{f.answer}</div>}
                  </div>
                );
              })}
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
