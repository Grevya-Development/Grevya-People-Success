"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, SendHorizontal, Sparkles, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = ["How many leaves do I have?", "When is the next holiday?", "Show my latest payslip", "How do I apply comp-off?", "What's pending for me?", "How do I raise a reimbursement claim?"];

/** Inline formatting: **bold** and [label](/internal/path). External links render as plain text. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={`${keyBase}-${i++}`}>{tok.slice(2, -2)}</strong>);
    else {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      const href = lm[2].trim();
      out.push(
        href.startsWith("/") && !href.startsWith("//") ? (
          <Link key={`${keyBase}-${i++}`} href={href} className="font-medium text-primary-600 underline-offset-2 hover:underline">
            {lm[1]}
          </Link>
        ) : (
          <span key={`${keyBase}-${i++}`}>{lm[1]}</span>
        ),
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Rich({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((b, bi) => {
        const lines = b.split("\n");
        const isList = lines.every((l) => /^\s*[-*•]\s+/.test(l) || !l.trim());
        if (isList) {
          return (
            <ul key={bi} className="list-disc space-y-0.5 pl-4">
              {lines
                .filter((l) => l.trim())
                .map((l, li) => (
                  <li key={li}>{inline(l.replace(/^\s*[-*•]\s+/, ""), `${bi}-${li}`)}</li>
                ))}
            </ul>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <span key={li}>
                {li > 0 && <br />}
                {inline(l.replace(/^#+\s*/, ""), `${bi}-${li}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export function Assistant({ firstName }: { firstName: string }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"ai" | "quick" | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: q }];
    setTurns(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next }) });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; mode?: "ai" | "quick"; error?: string };
      setTurns([...next, { role: "assistant", content: data.reply ?? data.error ?? "Something went wrong. Please try again." }]);
      if (data.mode) setMode(data.mode);
    } catch {
      setTurns([...next, { role: "assistant", content: "I couldn't reach the server. Check your connection and try again." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="no-print">
      {open && (
        <div className="fixed inset-x-2 bottom-24 z-[70] flex h-[min(600px,calc(100vh-8rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:right-6 sm:w-[400px]" role="dialog" aria-label="Gia assistant">
          <div className="flex items-center gap-3 bg-gradient-to-r from-[#4b2a9e] to-[#6a3fd1] px-4 py-3 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Gia</p>
              <p className="text-[11px] text-white/80">Your People Success assistant{mode === "quick" ? " · quick answers" : ""}</p>
            </div>
            {turns.length > 0 && (
              <button type="button" onClick={() => setTurns([])} className="rounded-md p-1.5 text-white/80 hover:bg-white/10" aria-label="New conversation" title="New conversation">
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-white/80 hover:bg-white/10" aria-label="Close assistant">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-4 py-4 text-sm thin-scroll">
            {turns.length === 0 && (
              <div>
                <div className="rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 text-slate-700 shadow-sm">
                  Hi {firstName}! I can tell you your leave balance, holidays, payslips, attendance and pending requests, or explain any HR policy. What would you like to know?
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-[#d9ccf5] bg-white px-3 py-1.5 text-xs font-medium text-[#5a35b8] hover:bg-[#f4effe]">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 leading-relaxed shadow-sm",
                    t.role === "user" ? "rounded-br-sm bg-[#6a3fd1] text-white" : "rounded-tl-sm bg-white text-slate-700",
                  )}
                >
                  {t.role === "assistant" ? <Rich text={t.content} /> : t.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Gia is thinking…
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="flex items-end gap-2 border-t border-slate-100 bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              maxLength={1000}
              placeholder="Ask about leave, pay, policies…"
              className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-[#6a3fd1] focus:outline-none focus:ring-2 focus:ring-[#6a3fd1]/15"
              aria-label="Message Gia"
            />
            <button type="submit" disabled={busy || !input.trim()} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6a3fd1] text-white hover:bg-[#5a35b8] disabled:opacity-40" aria-label="Send">
              <SendHorizontal className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="fixed bottom-5 right-5 z-[70] flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-2xl bg-gradient-to-br from-[#4b2a9e] to-[#6a3fd1] text-white shadow-lg shadow-[#4b2a9e]/30 ring-4 ring-white transition hover:scale-105"
        aria-label={open ? "Close Gia assistant" : "Open Gia assistant"}
        aria-expanded={open}
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
        <span className="text-[11px] font-semibold leading-none">Gia</span>
      </button>
    </div>
  );
}
