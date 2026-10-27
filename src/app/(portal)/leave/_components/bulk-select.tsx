"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import type { ActionState } from "@/lib/actions";
import { Button, Label, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Selectable list with a sticky bulk bar. Each item is server-rendered content;
 * the bar sends every selected id (as repeated "id" fields) plus `decision`
 * and `remarks` to the given server action.
 */
export function BulkSelectList({
  items,
  action,
  extraFields,
  noun = "request",
}: {
  items: { id: string; node: ReactNode }[];
  action: Action;
  extraFields?: Record<string, string>;
  noun?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<null | "approve" | "reject">(null);
  const [remarks, setRemarks] = useState("");
  const [pending, startTransition] = useTransition();

  // Drop selections that disappeared after a refresh
  const live = new Set(items.map((i) => i.id));
  const chosen = [...selected].filter((id) => live.has(id));
  const allChecked = items.length > 0 && chosen.length === items.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = () => {
    if (!dialog) return;
    const fd = new FormData();
    chosen.forEach((id) => fd.append("id", id));
    fd.set("decision", dialog);
    if (remarks.trim()) fd.set("remarks", remarks.trim());
    for (const [k, v] of Object.entries(extraFields ?? {})) fd.set(k, v);
    startTransition(async () => {
      const res = await action(null, fd);
      if (res?.ok) {
        toast.success(res.message ?? "Done");
        setSelected(new Set());
        setDialog(null);
        setRemarks("");
      } else if (res?.error) toast.error(res.error);
    });
  };

  return (
    <div>
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white/95 px-4 py-2.5 backdrop-blur">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            checked={allChecked}
            onChange={() => setSelected(allChecked ? new Set() : new Set(items.map((i) => i.id)))}
          />
          {chosen.length ? `${chosen.length} selected` : "Select all"}
        </label>
        <div className="flex gap-2">
          <Button size="sm" variant="success" disabled={!chosen.length || pending} onClick={() => setDialog("approve")}>
            <Check className="h-3.5 w-3.5" /> Approve{chosen.length > 1 ? ` (${chosen.length})` : ""}
          </Button>
          <Button size="sm" variant="danger" disabled={!chosen.length || pending} onClick={() => setDialog("reject")}>
            <X className="h-3.5 w-3.5" /> Reject
          </Button>
        </div>
      </div>
      <ul className="divide-y divide-slate-100">
        {items.map((it) => (
          <li key={it.id} className={cn("flex gap-3 px-4 py-4 transition-colors", selected.has(it.id) && "bg-primary-50/40")}>
            <input
              type="checkbox"
              aria-label={`Select ${noun}`}
              className="mt-2.5 h-4 w-4 shrink-0 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              checked={selected.has(it.id)}
              onChange={() => toggle(it.id)}
            />
            <div className="min-w-0 flex-1">{it.node}</div>
          </li>
        ))}
      </ul>
      <Dialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`${dialog === "approve" ? "Approve" : "Reject"} ${chosen.length} ${noun}${chosen.length === 1 ? "" : "s"}`}
        size="sm"
      >
        <Label required={dialog === "reject"}>Remarks</Label>
        <Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={dialog === "reject" ? "Reason for rejection" : "Optional"} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button variant={dialog === "approve" ? "success" : "danger"} disabled={pending || (dialog === "reject" && !remarks.trim())} onClick={run}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
