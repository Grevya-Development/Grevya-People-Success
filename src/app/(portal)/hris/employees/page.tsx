import type { Metadata } from "next";
import Link from "next/link";
import Form from "next/form";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, UserCheck, UserMinus, Users, UserX } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  StatCard,
  StatusBadge,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  buttonClass,
} from "@/components/ui";
import { cn, formatDate, humanize } from "@/lib/utils";
import { ROLES, ROLE_LABELS, STATUSES, UUID_RE, roleTone } from "./_lib";

export const metadata: Metadata = { title: "Employee List" };

const PAGE_SIZE = 20;

type SP = { q?: string; dept?: string; loc?: string; status?: string; role?: string; page?: string };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const supabase = await createClient();

  const q = (sp.q ?? "").trim().slice(0, 60);
  const term = q.replace(/[%,()*\\]/g, " ").trim();
  const dept = sp.dept && UUID_RE.test(sp.dept) ? sp.dept : "";
  const loc = sp.loc && UUID_RE.test(sp.loc) ? sp.loc : "";
  const status = sp.status === "all" || (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as string) : "current";
  const role = (ROLES as readonly string[]).includes(sp.role ?? "") ? (sp.role as string) : "";
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));

  let query = supabase
    .from("employees")
    .select(
      "id, full_name, employee_code, email, phone, avatar_url, role, status, employment_type, date_of_joining, department:departments(name), designation:designations(title), location:locations(name), manager:manager_id(id, full_name)",
      { count: "exact" },
    );
  if (term) query = query.or(`full_name.ilike.%${term}%,employee_code.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  if (dept) query = query.eq("department_id", dept);
  if (loc) query = query.eq("location_id", loc);
  if (status === "current") query = query.neq("status", "exited");
  else if (status !== "all") query = query.eq("status", status);
  if (role) query = query.eq("role", role);

  const from = (page - 1) * PAGE_SIZE;
  const [list, deps, locs, stats] = await Promise.all([
    query.order("full_name").range(from, from + PAGE_SIZE - 1),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("locations").select("id, name").order("name"),
    me.isHR ? supabase.from("employees").select("status") : Promise.resolve(null),
  ]);

  const rows = list.data ?? [];
  const total = list.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(term || dept || loc || role || status !== "current");

  const statusCounts = { active: 0, notice_period: 0, exited: 0 };
  for (const r of stats?.data ?? []) {
    if (r.status in statusCounts) statusCounts[r.status as keyof typeof statusCounts]++;
  }

  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (dept) params.set("dept", dept);
    if (loc) params.set("loc", loc);
    if (status !== "current") params.set("status", status);
    if (role) params.set("role", role);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return `/hris/employees${s ? `?${s}` : ""}`;
  };

  // Out-of-range page (e.g. after filtering) → jump to the last page. PostgREST answers an
  // out-of-range `range()` with an error and no count, so fall back to the first page then.
  if (rows.length === 0 && page > 1) redirect(hrefFor(total > 0 ? pages : 1));

  return (
    <div>
      <PageHeader
        title="Employee List"
        description={me.isHR ? "Manage employee records, reporting lines and logins." : "Find colleagues across Grevya."}
        breadcrumbs={[{ label: "HRIS", href: "/hris" }, { label: "Employee List" }]}
        actions={
          me.isHR && (
            <Link href="/hris/employees/new" className={buttonClass("primary")}>
              <Plus className="h-4 w-4" />
              Add Employee
            </Link>
          )
        }
      />

      {me.isHR && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Headcount" value={statusCounts.active + statusCounts.notice_period} icon={Users} tone="bg-[#dce5fa] text-[#3753b8]" />
          <StatCard label="Active" value={statusCounts.active} icon={UserCheck} tone="bg-emerald-50 text-emerald-600" />
          <StatCard label="Notice period" value={statusCounts.notice_period} icon={UserMinus} tone="bg-orange-50 text-orange-600" />
          <StatCard label="Exited" value={statusCounts.exited} icon={UserX} tone="bg-slate-100 text-slate-500" />
        </div>
      )}

      <Card>
        <Form action="/hris/employees" className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={q} placeholder="Search name, code, email or phone" className="pl-9" aria-label="Search employees" />
          </div>
          <Select name="dept" defaultValue={dept} aria-label="Department">
            <option value="">All departments</option>
            {(deps.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select name="loc" defaultValue={loc} aria-label="Location">
            <option value="">All locations</option>
            {(locs.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={status} aria-label="Status">
            <option value="current">Current employees</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
            <option value="all">All statuses</option>
          </Select>
          <Select name="role" defaultValue={role} aria-label="Role">
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("primary", "md", "flex-1 lg:flex-none")}>
              Apply
            </button>
            {filtered && (
              <Link href="/hris/employees" className={buttonClass("ghost", "md")}>
                Reset
              </Link>
            )}
          </div>
        </Form>

        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={filtered ? "No employees match these filters" : "No employees yet"}
            description={filtered ? "Try a different search or clear the filters." : me.isHR ? "Add your first employee to get started." : undefined}
            action={
              filtered ? (
                <Link href="/hris/employees" className={buttonClass("outline", "sm")}>
                  Clear filters
                </Link>
              ) : me.isHR ? (
                <Link href="/hris/employees/new" className={buttonClass("primary", "sm")}>
                  <Plus className="h-4 w-4" />
                  Add Employee
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Designation</TH>
                  <TH>Department</TH>
                  <TH>Location</TH>
                  <TH>Manager</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH>Joined</TH>
                  {me.isHR && <TH className="text-right">Actions</TH>}
                </TR>
              </THead>
              <TBody>
                {rows.map((e) => {
                  const href = me.isHR ? `/hris/employees/${e.id}/edit` : `/directory/${e.id}`;
                  const manager = e.manager as unknown as { id: string; full_name: string } | null;
                  return (
                    <TR key={e.id}>
                      <TD>
                        <Link href={href} className="flex items-center gap-3">
                          <Avatar name={e.full_name} src={e.avatar_url} size="sm" />
                          <span className="min-w-0">
                            <span className="block whitespace-nowrap font-medium text-slate-900 hover:text-primary-600">{e.full_name}</span>
                            <span className="block text-xs text-slate-500">
                              {e.employee_code} · {e.email}
                            </span>
                          </span>
                        </Link>
                      </TD>
                      <TD className="whitespace-nowrap">{(e.designation as { title: string } | null)?.title ?? "—"}</TD>
                      <TD className="whitespace-nowrap">{(e.department as { name: string } | null)?.name ?? "—"}</TD>
                      <TD className="whitespace-nowrap">{(e.location as { name: string } | null)?.name ?? "—"}</TD>
                      <TD className="whitespace-nowrap">
                        {manager ? (
                          <Link href={me.isHR ? `/hris/employees/${manager.id}/edit` : `/directory/${manager.id}`} className="hover:text-primary-600">
                            {manager.full_name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD>
                        <Badge tone={roleTone(e.role)}>{ROLE_LABELS[e.role] ?? humanize(e.role)}</Badge>
                      </TD>
                      <TD>
                        <StatusBadge status={e.status} />
                      </TD>
                      <TD className="whitespace-nowrap text-slate-500">{formatDate(e.date_of_joining)}</TD>
                      {me.isHR && (
                        <TD className="text-right">
                          <Link href={`/hris/employees/${e.id}/edit`} className={buttonClass("outline", "sm")}>
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Link>
                        </TD>
                      )}
                    </TR>
                  );
                })}
              </TBody>
            </Table>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              <span>
                Showing {from + 1}–{from + rows.length} of {total}
              </span>
              <div className="flex items-center gap-1">
                <PageLink href={hrefFor(page - 1)} disabled={page <= 1} label="Previous">
                  <ChevronLeft className="h-4 w-4" />
                </PageLink>
                <span className="px-2 font-medium text-slate-700">
                  Page {Math.min(page, pages)} of {pages}
                </span>
                <PageLink href={hrefFor(page + 1)} disabled={page >= pages} label="Next">
                  <ChevronRight className="h-4 w-4" />
                </PageLink>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span aria-disabled className={cn(buttonClass("outline", "icon"), "h-8 w-8 opacity-40")} aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={cn(buttonClass("outline", "icon"), "h-8 w-8")} aria-label={label}>
      {children}
    </Link>
  );
}
