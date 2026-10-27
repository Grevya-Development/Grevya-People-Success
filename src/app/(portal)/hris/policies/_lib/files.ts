/** Policy documents: what can be uploaded and how each type is shown. */

export const POLICY_DOC_MAX_BYTES = 20 * 1024 * 1024;

export const POLICY_DOC_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.zip,.png,.jpg,.jpeg,.webp";

export const POLICY_DOC_EXT = /\.(pdf|docx?|xlsx?|zip|png|jpe?g|webp)$/i;

export type FileKind = "pdf" | "docx" | "xlsx" | "zip" | "image" | "file";

export function fileKind(name: string | null | undefined, mime?: string | null): FileKind {
  const n = (name ?? "").toLowerCase();
  const m = (mime ?? "").toLowerCase();
  if (n.endsWith(".pdf") || m === "application/pdf") return "pdf";
  if (/\.docx?$/.test(n) || m.includes("wordprocessingml") || m === "application/msword") return "docx";
  if (/\.xlsx?$/.test(n) || m.includes("spreadsheetml") || m === "application/vnd.ms-excel") return "xlsx";
  if (n.endsWith(".zip") || m.includes("zip")) return "zip";
  if (/\.(png|jpe?g|webp)$/.test(n) || m.startsWith("image/")) return "image";
  return "file";
}

/** Files the browser can display inline; everything else is downloaded. */
export function isViewable(kind: FileKind) {
  return kind === "pdf" || kind === "image";
}

/** 288972 -> "282.2 KB" */
export function formatBytes(bytes: number | null | undefined) {
  const b = Number(bytes ?? 0);
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

/** Storage-safe file name (mirrors uploadDocument). */
export function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}
