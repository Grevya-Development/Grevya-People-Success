import { Mail, Paperclip, Phone } from "lucide-react";
import type { Tables } from "@/lib/database.types";

type Details = Pick<Tables<"resignations">, "id" | "correspondence_email" | "correspondence_phone" | "attachment_path" | "attachment_name">;

/** Correspondence details + attachment link for a resignation (employee, manager and HR views). */
export function ResignationDetails({ r, className }: { r: Details; className?: string }) {
  if (!r.correspondence_email && !r.correspondence_phone && !r.attachment_path) return null;
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
        {r.correspondence_email && (
          <span className="inline-flex min-w-0 items-center gap-1.5" title="Correspondence email">
            <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <a href={`mailto:${r.correspondence_email}`} className="truncate hover:text-primary-600 hover:underline">
              {r.correspondence_email}
            </a>
          </span>
        )}
        {r.correspondence_phone && (
          <span className="inline-flex items-center gap-1.5" title="Correspondence number">
            <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            {r.correspondence_phone}
          </span>
        )}
        {r.attachment_path && (
          <a
            href={`/exit/attachment/${r.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-primary-50 px-2 py-1 font-medium text-primary-700 hover:bg-primary-100"
            data-testid="resignation-attachment"
          >
            <Paperclip className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[16rem] truncate">{r.attachment_name ?? "Attachment"}</span>
          </a>
        )}
      </div>
    </div>
  );
}
