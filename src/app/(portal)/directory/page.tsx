import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, Mail, MapPin, Phone, Search, Users } from "lucide-react";
import { Avatar, Badge, buttonClass, Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Directory" };

const PAGE_SIZE = 24;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SP = { q?: string; dept?: string; loc?: string; page?: string };

type Person = {
  id: string;
  full_name: string | null;
  employee_code: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  status: string;
  designation: { title: string } | null;
  department: { name: string } | null;
  location: { name: string } | null;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function DirectoryPage({ searchParams }: { searchParams: Promise<Record<keyof SP, string | string[] | undefined>> }) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 80);
  const dept = UUID_RE.test(one(sp.dept)) ? one(sp.dept) : "";
  const loc = UUID_RE.test(one(sp.loc)) ? one(sp.loc) : "";
  const page = Math.max(1, Math.floor(Number(one(sp.page)) || 1));

  const supabase = await createClient();
  let query = supabase
    .from("employees")
    .select(
      "id, full_name, employee_code, email, phone, avatar_url, status, designation:designations(title), department:departments(name), location:locations(name)",
      { count: "exact" },
    )
    .neq("status", "exited");

  // PostgREST `or` filter: strip characters that have meaning in the filter grammar.
  const term = q.replace(/[%,()*:"'\\]/g, " ").trim();
  if (term) {
    query = query.or(`full_name.ilike.%${term}%,employee_code.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  }
  if (dept) query = query.eq("department_id", dept);
  if (loc) query = query.eq("location_id", loc);

  const from = (page - 1) * PAGE_SIZE;
  const [{ data, count }, { data: departments }, { data: locations }] = await Promise.all([
    query.order("full_name").range(from, from + PAGE_SIZE - 1),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("locations").select("id, name").order("name"),
  ]);
  const people = (data ?? []) as unknown as Person[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(term || dept || loc);
  const outOfRange = page > 1 && people.length === 0;

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (dept) params.set("dept", dept);
    if (loc) params.set("loc", loc);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/directory?${s}` : "/directory";
  };

  return (
    <div>
      <PageHeader
        title="Directory"
        description="Find colleagues across Grevya."
        breadcrumbs={[{ label: "Home", href: "/home" }, { label: "Directory" }]}
      />

      <Card className="mb-5 p-4">
        <form method="get" action="/directory" className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_200px_200px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={q} placeholder="Search by name, employee code, email or phone" className="pl-9" aria-label="Search" />
          </div>
          <Select name="dept" defaultValue={dept} aria-label="Department">
            <option value="">All departments</option>
            {(departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select name="loc" defaultValue={loc} aria-label="Location">
            <option value="">All locations</option>
            {(locations ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1 md:flex-none">
              Search
            </Button>
            {filtered && (
              <Link href="/directory" className={buttonClass("ghost")}>
                Clear
              </Link>
            )}
          </div>
        </form>
      </Card>

      <p className="mb-3 text-xs text-slate-500">
        {people.length === 0 ? "No people found" : `Showing ${from + 1}–${Math.min(from + people.length, total)} of ${total} ${total === 1 ? "person" : "people"}`}
      </p>

      {people.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={outOfRange ? "This page is empty" : filtered ? "No one matches your search" : "The directory is empty"}
            description={
              outOfRange ? "There are fewer results than this page number." : filtered ? "Try a different name or clear the filters." : "Employees will appear here once HR adds them."
            }
            action={
              outOfRange ? (
                <Link href={pageHref(1)} className={buttonClass("outline", "sm")}>
                  Go to first page
                </Link>
              ) : filtered ? (
                <Link href="/directory" className={buttonClass("outline", "sm")}>
                  Clear filters
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {people.map((p) => {
            const href = p.id === me.id ? "/profile" : `/directory/${p.id}`;
            return (
              <Card key={p.id} className="flex flex-col overflow-hidden transition hover:shadow-md">
                <div className="h-1.5 bg-[#64748b]/70" />
                <div className="flex flex-1 flex-col p-4">
                  <Link href={href} className="group flex items-center gap-3">
                    <Avatar name={p.full_name} src={p.avatar_url} size="lg" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800 group-hover:text-primary-600">
                        {p.full_name}
                        {p.id === me.id && <span className="ml-1 text-xs font-normal text-slate-400">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-slate-500">{p.designation?.title ?? "—"}</p>
                      <p className="text-[11px] text-slate-400">{p.employee_code}</p>
                    </div>
                  </Link>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.department && <Badge tone="gray">{p.department.name}</Badge>}
                    {p.status === "notice_period" && <Badge tone="orange">Notice period</Badge>}
                  </div>
                  <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs">
                    <a href={`mailto:${p.email}`} className="flex items-center gap-2 text-slate-600 hover:text-primary-600">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{p.email}</span>
                    </a>
                    {p.phone ? (
                      <a href={`tel:${p.phone}`} className="flex items-center gap-2 text-slate-600 hover:text-primary-600">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        {p.phone}
                      </a>
                    ) : (
                      <p className="flex items-center gap-2 text-slate-400">
                        <Phone className="h-3.5 w-3.5 shrink-0" />—
                      </p>
                    )}
                    <p className="flex items-center gap-2 text-slate-600">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {p.location?.name ?? "—"}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pagination">
          <Link
            href={pageHref(page - 1)}
            aria-disabled={page <= 1}
            className={cn(buttonClass("outline", "sm"), page <= 1 && "pointer-events-none opacity-50")}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Previous
          </Link>
          <span className="px-2 text-xs text-slate-500">
            Page {Math.min(page, pages)} of {pages}
          </span>
          <Link
            href={pageHref(page + 1)}
            aria-disabled={page >= pages}
            className={cn(buttonClass("outline", "sm"), page >= pages && "pointer-events-none opacity-50")}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </nav>
      )}
    </div>
  );
}
