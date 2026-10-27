"use client";

import { useRef } from "react";
import { SubmitButton } from "@/components/ui/action-form";
import type { ButtonVariant } from "@/components/ui/button";

/**
 * Several submit buttons for one <ActionForm>, each sending a different
 * `intent` (ActionForm builds FormData without the submitter, so the value is
 * written to a hidden input just before the submit event fires).
 */
export function IntentSubmit({
  options,
  name = "intent",
  className,
}: {
  options: { value: string; label: string; variant?: ButtonVariant; disabled?: boolean }[];
  name?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className={className ?? "flex flex-wrap justify-end gap-2"}>
      <input ref={ref} type="hidden" name={name} defaultValue={options[0]?.value} />
      {options.map((o) => (
        <span
          key={o.value}
          className="contents"
          onClickCapture={() => {
            if (ref.current) ref.current.value = o.value;
          }}
        >
          <SubmitButton variant={o.variant ?? "primary"} disabled={o.disabled}>
            {o.label}
          </SubmitButton>
        </span>
      ))}
    </div>
  );
}
