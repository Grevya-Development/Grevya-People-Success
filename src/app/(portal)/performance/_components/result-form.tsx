"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Form for actions whose success removes the form from the page (e.g. submitting
 * a review swaps the editor for a read-only view). The shared <ActionForm> toasts
 * and redirects from an effect, which never runs once the form unmounts, so this
 * one handles the result right after the action resolves.
 */
export function ResultForm({ action, children, className }: { action: Action; children: ReactNode; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const res = await action(null, fd);
          if (res?.ok) {
            toast.success(res.message ?? "Saved successfully");
            if (res.redirectTo) router.push(res.redirectTo);
          } else if (res?.error) {
            toast.error(res.error);
          }
        });
      }}
    >
      <fieldset disabled={pending} aria-busy={pending} className={cn("m-0 min-w-0 border-0 p-0", className)}>
        {children}
      </fieldset>
    </form>
  );
}
