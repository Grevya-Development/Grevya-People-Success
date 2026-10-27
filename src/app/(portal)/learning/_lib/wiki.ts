/**
 * Knowledge-wiki content is stored as plain text with a tiny markdown subset:
 *   # / ## / ### headings, "- " or "* " bullets, "1. " numbered lists,
 *   "> " quotes, **bold** and `code` inline. Everything else is a paragraph.
 * It is parsed into blocks and rendered as React elements (never as HTML).
 */
export type WikiBlock =
  | { type: "h1" | "h2" | "h3" | "p" | "quote"; text: string }
  | { type: "ul" | "ol"; items: string[] };

export const WIKI_STATUSES = ["draft", "submitted", "published", "rejected"] as const;

export function parseWiki(content: string): WikiBlock[] {
  const blocks: WikiBlock[] = [];
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  for (const raw of content.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      blocks.push({ type: (["h1", "h2", "h3"] as const)[heading[1].length - 1], text: heading[2] });
    } else if (bullet || numbered) {
      flushPara();
      const type = bullet ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
    } else if (quote) {
      flushPara();
      flushList();
      blocks.push({ type: "quote", text: quote[1] });
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}

/** Plain-text preview without markdown markers. */
export function wikiExcerpt(content: string, max = 170) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const body = lines.filter((l) => !/^#{1,3}\s/.test(l));
  const text = (body.length ? body : lines)
    .map((l) => l.replace(/^#{1,3}\s+|^[-*]\s+|^\d+[.)]\s+|^>\s?/, ""))
    .join(" ")
    .replace(/\*\*|`/g, "");
  return text.length > max ? text.slice(0, max).replace(/\s+\S*$/, "") + "…" : text;
}

export function readMinutes(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function parseTags(raw: string | null) {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const t of raw.split(",")) {
    const tag = t.trim().replace(/^#/, "").slice(0, 30);
    if (tag) seen.add(tag.toLowerCase());
  }
  return [...seen].slice(0, 10);
}

export const WIKI_CATEGORIES = ["Engineering", "Gen AI", "Process", "Tools", "Onboarding", "Sales", "Design", "HR", "General"];
