"use client";

import { useState } from "react";
import { Eye, Code2 } from "lucide-react";
import { Field, Input, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { toDisplayHtml } from "../../../policies/_lib/sanitize";

/** Title + HTML body editor with a live letter preview. Controlled. */
export function LetterEditor({
  title,
  content,
  onTitle,
  onContent,
}: {
  title: string;
  content: string;
  onTitle: (v: string) => void;
  onContent: (v: string) => void;
}) {
  const [mode, setMode] = useState<"edit" | "preview">("preview");

  return (
    <div className="space-y-4">
      <Field label="Letter title" htmlFor="title" required>
        <Input id="title" name="title" value={title} onChange={(e) => onTitle(e.target.value)} maxLength={200} required />
      </Field>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-600">
            Letter content<span className="ml-0.5 text-red-500">*</span>
          </span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
            {(
              [
                ["preview", "Preview", Eye],
                ["edit", "Edit HTML", Code2],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors",
                  mode === m ? "bg-white text-primary-700 shadow-sm" : "text-slate-500 hover:text-slate-700",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>
        {/* The textarea is always in the form so the content is submitted in either mode. */}
        <Textarea
          name="content"
          value={content}
          onChange={(e) => onContent(e.target.value)}
          rows={18}
          className={cn("font-mono text-xs leading-relaxed", mode === "preview" && "hidden")}
        />
        {mode === "preview" && (
          <div className="max-h-[480px] overflow-y-auto rounded-lg border border-slate-200 bg-white thin-scroll">
            <div className="flex items-center justify-between border-b-2 border-[#5b74d6] px-5 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/grevya-logo.png" alt="Grevya" className="h-7 w-auto" />
              <span className="text-xs font-semibold text-slate-700">Grevya</span>
            </div>
            {content.trim() ? (
              <div className="prose-doc px-5 py-4 text-[13px]" dangerouslySetInnerHTML={{ __html: toDisplayHtml(content) }} />
            ) : (
              <p className="px-5 py-10 text-center text-xs text-slate-400">Nothing to preview yet.</p>
            )}
          </div>
        )}
        <p className="mt-1 text-xs text-slate-500">Switch to “Edit HTML” to change any wording before issuing. Basic HTML (p, strong, ul, table) is supported.</p>
      </div>
    </div>
  );
}
