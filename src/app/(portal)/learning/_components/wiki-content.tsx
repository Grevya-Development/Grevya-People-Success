import type { ReactNode } from "react";
import { parseWiki } from "../_lib/wiki";

/** Inline **bold** and `code`, rendered as React text nodes (no HTML injection). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code key={i} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-[#25708a]">
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

export function WikiContent({ content }: { content: string }) {
  const blocks = parseWiki(content);
  if (blocks.length === 0) return <p className="text-sm italic text-slate-400">This article has no content yet.</p>;
  return (
    <div className="space-y-4 break-words text-[15px] leading-7 text-slate-700">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "h1":
            return <h2 key={i} className="pt-2 text-xl font-semibold text-slate-900">{inline(b.text)}</h2>;
          case "h2":
            return <h3 key={i} className="pt-1 text-lg font-semibold text-slate-900">{inline(b.text)}</h3>;
          case "h3":
            return <h4 key={i} className="text-base font-semibold text-slate-800">{inline(b.text)}</h4>;
          case "quote":
            return (
              <blockquote key={i} className="border-l-4 border-[#3a95b3] bg-[#d5e9f0]/40 px-4 py-2 text-slate-600">
                {inline(b.text)}
              </blockquote>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-1 pl-6 marker:text-[#3a95b3]">
                {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-1 pl-6 marker:font-medium marker:text-[#25708a]">
                {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
              </ol>
            );
          default:
            return <p key={i}>{inline(b.text)}</p>;
        }
      })}
    </div>
  );
}
