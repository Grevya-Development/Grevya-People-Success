/**
 * Light defence-in-depth for HR-authored policy HTML: strips executable
 * elements, inline event handlers and javascript: URLs before rendering.
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form|input|button)\b[^>]*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|xlink:href)\s*=\s*("|')\s*(javascript|vbscript|data):[^"']*\2/gi, '$1="#"')
    .replace(/(href|src)\s*=\s*(javascript|vbscript|data):[^\s>]*/gi, '$1="#"');
}

/** True when the string looks like it already contains HTML tags. */
export function looksLikeHtml(s: string) {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

/** Render plain text (no tags) as paragraphs so line breaks survive. */
export function toDisplayHtml(content: string): string {
  if (looksLikeHtml(content)) return sanitizeHtml(content);
  const esc = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}
