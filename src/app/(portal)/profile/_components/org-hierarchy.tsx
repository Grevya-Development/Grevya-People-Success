import Link from "next/link";
import { Users } from "lucide-react";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";

export type HierarchyPerson = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  employee_code?: string;
  designation: { title: string } | null;
};

function PersonCard({ p, highlight, href }: { p: HierarchyPerson; highlight?: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex w-full max-w-[260px] items-center gap-2.5 rounded-lg border px-3 py-2 transition",
        highlight
          ? "border-[#5b74d6] bg-[#dce5fa] shadow-sm"
          : "border-slate-200 bg-white hover:border-[#5b74d6]/60 hover:bg-[#f5f7fe]",
      )}
    >
      <Avatar name={p.full_name} src={p.avatar_url} size="sm" />
      <div className="min-w-0">
        <p className={cn("truncate text-sm font-medium", highlight ? "text-[#3753b8]" : "text-slate-800")}>{p.full_name}</p>
        <p className="truncate text-[11px] text-slate-500">{p.designation?.title ?? "—"}</p>
      </div>
    </Link>
  );
}

const Connector = () => <span aria-hidden className="mx-auto block h-4 w-px bg-slate-300" />;

/** Manager above, the person (highlighted), then direct reports. */
export function OrgHierarchy({
  person,
  manager,
  reports,
  limit = 6,
  selfId,
}: {
  person: HierarchyPerson;
  manager: HierarchyPerson | null;
  reports: HierarchyPerson[];
  limit?: number;
  /** signed-in employee id — their own card links to /profile */
  selfId?: string;
}) {
  const href = (id: string) => (id === selfId ? "/profile" : `/directory/${id}`);
  const shown = reports.slice(0, limit);
  return (
    <div className="flex flex-col items-center">
      {manager ? (
        <>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Reports to</p>
          <PersonCard p={manager} href={href(manager.id)} />
          <Connector />
        </>
      ) : (
        <p className="mb-2 text-[11px] text-slate-400">Top of the organisation</p>
      )}
      <PersonCard p={person} highlight href={href(person.id)} />
      {reports.length > 0 ? (
        <>
          <Connector />
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Direct reports ({reports.length})
          </p>
          <div className="grid w-full grid-cols-1 justify-items-center gap-2 sm:grid-cols-2">
            {shown.map((r) => (
              <PersonCard key={r.id} p={r} href={href(r.id)} />
            ))}
          </div>
          {reports.length > shown.length && (
            <Link href="/hris/org-chart" className="mt-2 text-xs font-medium text-[#3753b8] hover:underline">
              +{reports.length - shown.length} more in the organisation chart
            </Link>
          )}
        </>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
          <Users className="h-3.5 w-3.5" /> No direct reports
        </p>
      )}
    </div>
  );
}
