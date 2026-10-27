import type { ReactNode } from "react";
import { Input, Label } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";

/** GET form for ?from=&to= (plus any extra fields such as an employee select). */
export function RangeFilter({ from, to, children, action }: { from: string; to: string; children?: ReactNode; action: string }) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/80 bg-white p-4">
      <div>
        <Label htmlFor="from">From</Label>
        <Input id="from" name="from" type="date" defaultValue={from} className="w-40" />
      </div>
      <div>
        <Label htmlFor="to">To</Label>
        <Input id="to" name="to" type="date" defaultValue={to} className="w-40" />
      </div>
      {children}
      <button type="submit" className={buttonClass("primary")}>
        Apply
      </button>
    </form>
  );
}
