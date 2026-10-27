import { cn } from "@/lib/utils";
import type { FileKind } from "../_lib/files";

const STYLES: Record<FileKind, { label: string; tag: string; sheet: string; fold: string }> = {
  pdf: { label: "PDF", tag: "bg-red-600", sheet: "bg-red-50 border-red-200", fold: "bg-red-200" },
  zip: { label: "ZIP", tag: "bg-emerald-600", sheet: "bg-emerald-50 border-emerald-200", fold: "bg-emerald-200" },
  xlsx: { label: "XLS", tag: "bg-emerald-600", sheet: "bg-emerald-50 border-emerald-200", fold: "bg-emerald-200" },
  docx: { label: "DOC", tag: "bg-blue-600", sheet: "bg-blue-50 border-blue-200", fold: "bg-blue-200" },
  image: { label: "IMG", tag: "bg-violet-600", sheet: "bg-violet-50 border-violet-200", fold: "bg-violet-200" },
  file: { label: "TXT", tag: "bg-slate-500", sheet: "bg-slate-50 border-slate-200", fold: "bg-slate-200" },
};

/** A small "document sheet" with a folded corner and a coloured type tag — drawn with CSS only. */
export function FileBadge({ kind, className }: { kind: FileKind; className?: string }) {
  const s = STYLES[kind];
  return (
    <span className={cn("relative inline-block h-14 w-11 shrink-0", className)} aria-label={`${s.label} file`} data-kind={kind}>
      <span
        className={cn("absolute inset-0 rounded-[5px] border", s.sheet)}
        style={{ clipPath: "polygon(0 0, 68% 0, 100% 24%, 100% 100%, 0 100%)" }}
      />
      <span className={cn("absolute right-0 top-0 h-[24%] w-[32%] rounded-bl-[4px]", s.fold)} />
      <span className="absolute left-2 right-3 top-[38%] h-[2px] rounded bg-slate-300/70" />
      <span className="absolute left-2 right-4 top-[48%] h-[2px] rounded bg-slate-300/70" />
      <span
        className={cn(
          "absolute -left-1.5 bottom-2 rounded-[3px] px-1 py-[1px] text-[9px] font-bold leading-tight tracking-wide text-white shadow-sm",
          s.tag,
        )}
      >
        {s.label}
      </span>
    </span>
  );
}
