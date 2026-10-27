import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, FileText, Search, Eye, ChevronLeft, ChevronRight, FilePlus2 } from "lucide-react";
import { requireHR } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, orgToday } from "@/lib/utils";
import {
  Card,
  CardHeader,
  Badge,
  StatusBadge,
  EmptyState,
  PageHeader,
  Avatar,
  Input,
  Select,
  Button,
  buttonClass,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  StatCard,
} from "@/components/ui";
import { LinkTabs } from "@/components/ui/link-tabs";
import { ActionButton } from "@/components/ui/action-button";
import { LETTER_LABELS, LETTER_TYPES, isLetterType, letterTypeLabel } from "../../_lib/letter-templates";
import { generateFor, loadLetterData } from "../../_lib/letter-data";
import { deleteLetter, rejectLetterRequest } from "./actions";
import { ProcessRequestDialog } from "./_components/process-request";
import { IssueLetterForm, type EmployeeOption } from "./_components/issue-letter-form";

export const metadata: Metadata = { title: "Letters Administration" };

const PAGE_SIZE = 25;

type Emp = { full_name: string | null; employee_code: string; avatar_url: string | null } | null;

type SP = { tab?: string; q?: string; type?: string; category?: string; page?: string; employee?: string };

export default async function AdminLettersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const me = await requireHR();
  const supabase = await createClient();
  const tab = sp.tab === "issue" || sp.tab === "issued" ? sp.tab : "requests";

  const [{ count: pendingCount }, { count: issuedCount }, { count: monthCount }] = await Promise.all([
    supabase.from("letter_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("letters").select("id", { count: "exact", head: true }),
    supabase.from("letters").select("id", { count: "exact", head: true }).gte("issued_on", orgToday().slice(0, 8) + "01"),
  ]);

  return (
    <div>
      <PageHeader
        title="Letters & Requests"
        description="Process employee letter requests, issue letters from templates and review everything issued."
        breadcrumbs={[{ label: "HR Admin" }, { label: "HRIS", href: "/hris" }, { label: "Letters" }]}
        actions={
          <Link href="/hris/contracts" className={buttonClass("outline", "sm")}>
            Contracts
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Pending requests" value={pendingCount ?? 0} icon={Inbox} tone="bg-amber-50 text-amber-600" />
        <StatCard label="Issued this month" value={monthCount ?? 0} icon={FilePlus2} tone="bg-[#dce5fa] text-[#3753b8]" />
        <StatCard label="Total letters issued" value={issuedCount ?? 0} icon={FileText} tone="bg-emerald-50 text-emerald-600" />
      </div>

      <LinkTabs
        tabs={[
          { label: "Requests", href: "/hris/admin/letters", count: pendingCount ?? 0 },
          { label: "Issue a letter", href: "/hris/admin/letters?tab=issue" },
          { label: "Issued letters", href: "/hris/admin/letters?tab=issued" },
        ]}
      />

      {tab === "requests" && <RequestsTab me={me} />}
      {tab === "issue" && <IssueTab defaultEmployeeId={sp.employee} />}
      {tab === "issued" && <IssuedTab sp={sp} />}
    </div>
  );
}

async function RequestsTab({ me }: { me: Awaited<ReturnType<typeof requireHR>> }) {
  const supabase = await createClient();
  const [{ data: pending }, { data: history }] = await Promise.all([
    supabase
      .from("letter_requests")
      .select("id, employee_id, letter_type, purpose, created_at, employee:employees!letter_requests_employee_id_fkey(full_name, employee_code, avatar_url)")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("letter_requests")
      .select(
        "id, letter_type, purpose, status, approver_remarks, actioned_at, created_at, letter_id, employee:employees!letter_requests_employee_id_fkey(full_name, employee_code, avatar_url), approver:employees!letter_requests_approver_id_fkey(full_name)",
      )
      .neq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const data = await loadLetterData(
    supabase,
    (pending ?? []).map((r) => r.employee_id),
    me,
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Pending requests" description="Oldest first. Approving opens an editable draft generated from the employee's record." />
        {pending && pending.length > 0 ? (
          <Table>
            <THead>
              <TR>
                <TH>Employee</TH>
                <TH>Letter</TH>
                <TH>Purpose</TH>
                <TH>Requested</TH>
                <TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody>
              {pending.map((r) => {
                const emp = r.employee as Emp;
                const purpose = r.purpose ?? "official purposes";
                const draft = generateFor(r.letter_type, data.get(r.employee_id), {
                  purpose,
                  subject: isLetterType(r.letter_type) && r.letter_type !== "other" ? letterTypeLabel(r.letter_type) : `Letter for ${purpose}`.slice(0, 120),
                });
                return (
                  <TR key={r.id}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={emp?.full_name} src={emp?.avatar_url} size="sm" />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800">{emp?.full_name ?? "—"}</p>
                          <p className="text-xs text-slate-500">{emp?.employee_code}</p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <Badge tone="blue">{letterTypeLabel(r.letter_type)}</Badge>
                    </TD>
                    <TD className="max-w-xs">
                      <p className="line-clamp-2 text-xs text-slate-600">{r.purpose ?? "—"}</p>
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.created_at)}</TD>
                    <TD>
                      <div className="flex justify-end gap-2">
                        {draft && (
                          <ProcessRequestDialog
                            requestId={r.id}
                            employeeName={emp?.full_name ?? "employee"}
                            typeLabel={letterTypeLabel(r.letter_type)}
                            draftTitle={draft.title}
                            draftContent={draft.content}
                          />
                        )}
                        <ActionButton
                          action={rejectLetterRequest}
                          fields={{ id: r.id }}
                          prompt="Reason for rejection"
                          promptRequired
                          variant="danger"
                          successMessage="Request rejected"
                        >
                          Reject
                        </ActionButton>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={Inbox} title="All caught up" description="There are no pending letter requests." />
        )}
      </Card>

      <Card>
        <CardHeader title="Recently processed" description="Last 30 requests that were approved, rejected or cancelled." />
        {history && history.length > 0 ? (
          <Table>
            <THead>
              <TR>
                <TH>Employee</TH>
                <TH>Letter</TH>
                <TH>Status</TH>
                <TH>Processed</TH>
                <TH>Remarks</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {history.map((r) => {
                const emp = r.employee as Emp;
                const approver = r.approver as { full_name: string | null } | null;
                return (
                  <TR key={r.id}>
                    <TD>
                      <p className="font-medium text-slate-800">{emp?.full_name ?? "—"}</p>
                      <p className="text-xs text-slate-500">{emp?.employee_code}</p>
                    </TD>
                    <TD className="text-xs">{letterTypeLabel(r.letter_type)}</TD>
                    <TD>
                      <StatusBadge status={r.status} />
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-slate-500">
                      {r.actioned_at ? formatDateTime(r.actioned_at) : formatDateTime(r.created_at)}
                      {approver?.full_name && <span className="block">by {approver.full_name}</span>}
                    </TD>
                    <TD className="max-w-xs text-xs text-slate-600">{r.approver_remarks ?? "—"}</TD>
                    <TD className="text-right">
                      {r.letter_id && (
                        <Link href={`/hris/letters/${r.letter_id}`} className={buttonClass("ghost", "sm")}>
                          <Eye className="h-3.5 w-3.5" /> View
                        </Link>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : (
          <EmptyState title="No processed requests yet" className="py-8" />
        )}
      </Card>
    </div>
  );
}

async function IssueTab({ defaultEmployeeId }: { defaultEmployeeId?: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("employees").select("id, full_name, employee_code, status").order("first_name").order("last_name").limit(5000);
  const employees: EmployeeOption[] = (data ?? []).map((e) => ({ id: e.id, full_name: e.full_name ?? "", employee_code: e.employee_code, status: e.status }));

  return (
    <Card>
      <CardHeader
        title="Issue a letter"
        description="Offer, appointment, confirmation, experience, relieving, address proof, employment verification, salary certificate, increment, bonus or promotion."
      />
      <div className="p-5">
        {employees.length ? (
          <IssueLetterForm employees={employees} defaultEmployeeId={defaultEmployeeId} today={orgToday()} />
        ) : (
          <EmptyState title="No employees yet" description="Add employees before issuing letters." action={<Link href="/hris/employees/new" className={buttonClass("primary", "sm")}>Add employee</Link>} />
        )}
      </div>
    </Card>
  );
}

async function IssuedTab({ sp }: { sp: SP }) {
  const supabase = await createClient();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const q = (sp.q ?? "").trim().replace(/[%,()*]/g, " ").slice(0, 60);
  const type = isLetterType(sp.type) ? sp.type : "";
  const category = sp.category === "general" || sp.category === "salary" ? sp.category : "";

  let employeeIds: string[] | null = null;
  if (q) {
    const { data: matches } = await supabase
      .from("employees")
      .select("id")
      .or(`full_name.ilike.%${q}%,employee_code.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(500);
    employeeIds = (matches ?? []).map((m) => m.id);
  }

  let rows: {
    id: string;
    title: string;
    letter_type: string;
    category: string;
    issued_on: string;
    employee: unknown;
    issuer: unknown;
  }[] = [];
  let total = 0;
  if (employeeIds === null || employeeIds.length > 0) {
    let query = supabase
      .from("letters")
      .select(
        "id, title, letter_type, category, issued_on, employee:employees!letters_employee_id_fkey(full_name, employee_code, avatar_url), issuer:employees!letters_issued_by_fkey(full_name)",
        { count: "exact" },
      )
      .order("issued_on", { ascending: false })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (employeeIds) query = query.in("employee_id", employeeIds);
    if (type) query = query.eq("letter_type", type);
    if (category) query = query.eq("category", category);
    const { data, count } = await query;
    rows = data ?? [];
    total = count ?? 0;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => {
    const params = new URLSearchParams({ tab: "issued" });
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    if (category) params.set("category", category);
    if (p > 1) params.set("page", String(p));
    return `/hris/admin/letters?${params}`;
  };
  const filtered = Boolean(q || type || category);

  return (
    <Card>
      <form className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center" action="/hris/admin/letters">
        <input type="hidden" name="tab" value="issued" />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input name="q" defaultValue={q} placeholder="Search employee name, code or email" className="pl-8" />
        </div>
        <Select name="category" defaultValue={category} className="sm:w-40" aria-label="Category">
          <option value="">All categories</option>
          <option value="general">General</option>
          <option value="salary">Salary</option>
        </Select>
        <Select name="type" defaultValue={type} className="sm:w-56" aria-label="Letter type">
          <option value="">All letter types</option>
          {LETTER_TYPES.map((t) => (
            <option key={t} value={t}>
              {LETTER_LABELS[t]}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button type="submit" size="md">
            Filter
          </Button>
          {filtered && (
            <Link href="/hris/admin/letters?tab=issued" className={buttonClass("ghost", "md")}>
              Clear
            </Link>
          )}
        </div>
      </form>

      {rows.length > 0 ? (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Employee</TH>
                <TH>Title</TH>
                <TH>Type</TH>
                <TH>Issued on</TH>
                <TH>Issued by</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((l) => {
                const emp = l.employee as Emp;
                const issuer = l.issuer as { full_name: string | null } | null;
                return (
                  <TR key={l.id}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={emp?.full_name} src={emp?.avatar_url} size="sm" />
                        <div>
                          <p className="font-medium text-slate-800">{emp?.full_name ?? "—"}</p>
                          <p className="text-xs text-slate-500">{emp?.employee_code}</p>
                        </div>
                      </div>
                    </TD>
                    <TD className="max-w-[16rem] truncate">{l.title}</TD>
                    <TD>
                      <Badge tone={l.category === "salary" ? "green" : "blue"}>{letterTypeLabel(l.letter_type)}</Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-xs">{formatDate(l.issued_on)}</TD>
                    <TD className="text-xs text-slate-500">{issuer?.full_name ?? "—"}</TD>
                    <TD>
                      <div className="flex justify-end gap-2">
                        <Link href={`/hris/letters/${l.id}`} className={buttonClass("outline", "sm")}>
                          <Eye className="h-3.5 w-3.5" /> View
                        </Link>
                        <ActionButton action={deleteLetter} fields={{ id: l.id }} confirm="Withdraw this letter? The employee will no longer see it." variant="ghost">
                          Withdraw
                        </ActionButton>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link href={link(page - 1)} className={buttonClass("outline", "sm")}>
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous
                </Link>
              ) : null}
              {page < pages ? (
                <Link href={link(page + 1)} className={buttonClass("outline", "sm")}>
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          icon={FileText}
          title={page > 1 ? "No letters on this page" : filtered ? "No letters match these filters" : "No letters issued yet"}
          description={
            page > 1 ? (
              <Link href={link(1)} className="text-primary-600 hover:underline">
                Go to the first page
              </Link>
            ) : filtered ? (
              "Try a different search or clear the filters."
            ) : (
              "Letters you issue or approve will be listed here."
            )
          }
          action={
            !filtered && page === 1 && (
              <Link href="/hris/admin/letters?tab=issue" className={buttonClass("primary", "sm")}>
                Issue a letter
              </Link>
            )
          }
        />
      )}
    </Card>
  );
}
