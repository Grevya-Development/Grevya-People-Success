"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/form";
import { PHASE_LABEL } from "./shared";

/** Switches the `?cycle=` query param. */
export function CycleSelect({
  cycles,
  value,
}: {
  cycles: { id: string; name: string; status: string }[];
  value: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (cycles.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="cycle-select" className="text-xs font-medium text-slate-500">
        Cycle
      </label>
      <Select
        id="cycle-select"
        className="w-auto min-w-48"
        value={value ?? ""}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set("cycle", e.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
      >
        {cycles.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {PHASE_LABEL[c.status] ?? c.status}
          </option>
        ))}
      </Select>
    </div>
  );
}
