"use client";

import { useRef } from "react";
import { Save, Send } from "lucide-react";
import { SubmitButton } from "@/components/ui/action-form";

/**
 * "Save draft" + "Submit" for an <ActionForm>. ActionForm builds FormData from
 * the form element (the submitter isn't included), so the chosen intent is
 * written to a hidden input just before the submit event.
 */
export function IntentButtons({ submitLabel = "Submit", disabled, submitDisabled }: { submitLabel?: string; disabled?: boolean; submitDisabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const set = (v: string) => {
    if (ref.current) ref.current.value = v;
  };
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <input ref={ref} type="hidden" name="intent" defaultValue="draft" />
      <span className="contents" onClickCapture={() => set("draft")}>
        <SubmitButton variant="outline" disabled={disabled}>
          <Save className="h-4 w-4" />
          Save draft
        </SubmitButton>
      </span>
      <span className="contents" onClickCapture={() => set("submit")}>
        <SubmitButton disabled={disabled || submitDisabled}>
          <Send className="h-4 w-4" />
          {submitLabel}
        </SubmitButton>
      </span>
    </div>
  );
}
