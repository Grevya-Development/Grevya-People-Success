"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { RATING_LABEL } from "./shared";

/** 1–5 star rating input. Submits `name` as a number (empty when unset). */
export function StarRatingInput({
  name,
  defaultValue,
  disabled,
  label,
}: {
  name: string;
  defaultValue?: number | null;
  disabled?: boolean;
  label?: string;
}) {
  const [value, setValue] = useState<number>(defaultValue ? Math.round(Number(defaultValue)) : 0);
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div>
      <input type="hidden" name={name} value={value || ""} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1" role="radiogroup" aria-label={label ?? "Rating"} onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} star${n > 1 ? "s" : ""} — ${RATING_LABEL[n]}`}
              disabled={disabled}
              onMouseEnter={() => setHover(n)}
              onClick={() => setValue(value === n ? 0 : n)}
              className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:pointer-events-none"
            >
              <Star className={cn("h-7 w-7", n <= shown ? "fill-amber-400 text-amber-400" : "fill-slate-100 text-slate-300")} />
            </button>
          ))}
        </div>
        <span className="text-sm text-slate-600">{shown ? `${shown}/5 · ${RATING_LABEL[shown]}` : "Not rated"}</span>
      </div>
    </div>
  );
}
