"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/** A <select> that runs a server action as soon as its value changes. */
export function InlineSelect({
  action,
  name,
  value,
  options,
  fields = {},
  className,
  ariaLabel,
  disabled,
}: {
  action: Action;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  fields?: Record<string, string>;
  className?: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const [current, setCurrent] = useState(value);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <span className="relative inline-flex items-center">
      <select
        aria-label={ariaLabel}
        value={current}
        disabled={pending || disabled}
        onChange={(e) => {
          const next = e.target.value;
          const prev = current;
          setCurrent(next);
          const fd = new FormData();
          for (const [k, v] of Object.entries(fields)) fd.set(k, v);
          fd.set(name, next);
          startTransition(async () => {
            const res = await action(null, fd);
            if (res?.ok) {
              toast.success(res.message ?? "Updated");
              router.refresh();
            } else {
              setCurrent(prev);
              toast.error(res?.error ?? "Could not update");
            }
          });
        }}
        className={cn(
          "h-8 rounded-lg border border-slate-300 bg-white pl-2.5 pr-7 text-xs text-slate-700 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-60",
          className,
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {pending && <Loader2 className="pointer-events-none absolute -right-5 h-3.5 w-3.5 animate-spin text-slate-400" />}
    </span>
  );
}
