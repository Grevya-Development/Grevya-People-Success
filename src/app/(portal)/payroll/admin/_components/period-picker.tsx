import { Input, Button } from "@/components/ui";

/** Plain GET form so the month lives in the URL. */
export function PeriodPicker({ tab, period, max, label = "Show" }: { tab: string; period: string; max?: string; label?: string }) {
  return (
    <form method="get" action="/payroll/admin" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="tab" value={tab} />
      <label className="text-xs font-medium text-slate-600">
        <span className="mb-1.5 block">Payroll month</span>
        <Input type="month" name="period" defaultValue={period} max={max} required className="w-44" />
      </label>
      <Button type="submit" variant="outline">
        {label}
      </Button>
    </form>
  );
}
