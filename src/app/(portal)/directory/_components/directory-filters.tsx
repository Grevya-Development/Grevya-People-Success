"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type FormEvent, type ReactNode } from "react";
import { Loader2, Search } from "lucide-react";
import { Button, buttonClass, Card, Input, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

/**
 * Search + department/location filters. Submits as a client-side navigation
 * (no full page reload) and dims the current results while the new ones load.
 */
export function DirectoryFilters({
  q,
  dept,
  loc,
  departments,
  locations,
  filtered,
  children,
}: {
  q: string;
  dept: string;
  loc: string;
  departments: Option[];
  locations: Option[];
  filtered: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["q", "dept", "loc"]) {
      const v = String(fd.get(key) ?? "").trim();
      if (v) params.set(key, v);
    }
    const s = params.toString();
    startTransition(() => router.push(s ? `/directory?${s}` : "/directory"));
  }

  return (
    <>
      <Card className="mb-5 p-4">
        {/* key: reset the inputs when the URL changes (e.g. "Clear") */}
        <form
          key={`${q}|${dept}|${loc}`}
          method="get"
          action="/directory"
          onSubmit={onSubmit}
          className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_200px_200px_auto]"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={q} placeholder="Search by name, employee code, email or phone" className="pl-9" aria-label="Search" />
          </div>
          <Select name="dept" defaultValue={dept} aria-label="Department">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select name="loc" defaultValue={loc} aria-label="Location">
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1 md:flex-none" disabled={pending} aria-busy={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {pending ? "Searching…" : "Search"}
            </Button>
            {filtered && (
              <Link href="/directory" className={buttonClass("ghost")}>
                Clear
              </Link>
            )}
          </div>
        </form>
      </Card>
      <div aria-busy={pending} className={cn("transition-opacity", pending && "pointer-events-none opacity-50")}>
        {children}
      </div>
    </>
  );
}
