import type { Metadata } from "next";
import Link from "next/link";
import {
  FileSignature,
  Plus,
  Search,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FilePen,
  Paperclip,
  RefreshCw,
  Pencil,
  ChevronLeft,
  ChevronRight,
  CalendarX2,
} from "lucide-react";
import { requireEmployee, type CurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, orgToday } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";
import {
  Card,
  CardBody,
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
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ActionButton } from "@/components/ui/action-button";
import { CONTRACT_TYPES, CONTRACT_TYPE_LABELS, daysUntil, effectiveStatus, isExpiringSoon, plusDays } from "./_lib";
import { ContractFields } from "./_components/contract-fields";
import { createContract, deleteContract, renewContract, terminateContract, updateContract } from "./actions";

export const metadata: Metadata = { title: "Contract Management" };

const PAGE_SIZE = 25;
const STATUS_FILTERS = ["active", "expiring", "expired", "draft", "terminated", "renewed"] as const;

type SP = { q?: string; status?: string; type?: string; page?: string };
type Contract = Tables<"contracts">;
type Emp = { full_name: string | null; employee_code: string; avatar_url: string | null } | null;

export default async function ContractsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const me = await requireEmployee();
  return me.isHR ? <HRContracts sp={sp} /> : <MyContracts me={me} />;
}

/* ------------------------------------------------------------------------ */
/* Employee view                                                             */
/* ------------------------------------------------------------------------ */

async function MyContracts({ me }: { me: CurrentEmployee }) {
  const supabase = await createClient();
  const today = orgToday();
  const { data } = await supabase.from("contracts").select("*").eq("employee_id", me.id).order("start_date", { ascending: false });
  const contracts = (data ?? []).filter((c) => c.status !== "draft");
  const expiring = contracts.filter((c) => isExpiringSoon(c, today));

  return (
    <div>
      <PageHeader
        title="Contract Management"
        description="Your employment and other agreements with Grevya."
        breadcrumbs={[{ label: "HRIS", href: "/hris" }, { label: "Contract Management" }]}
      />
      {expiring.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {expiring.length === 1 ? "One of your contracts ends" : `${expiring.length} of your contracts end`} within the next 30 days. HR will reach out about
            renewal — or raise a request on the HR Helpdesk.
          </p>
        </div>
      )}
      {contracts.length === 0 ? (
        <Card>
          <EmptyState icon={FileSignature} title="No contracts on file" description="Contracts HR records for you will appear here." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {contracts.map((c) => {
            const status = effectiveStatus(c, today);
            const soon = isExpiringSoon(c, today);
            return (
              <Card key={c.id} className={cn("overflow-hidden", soon && "ring-2 ring-amber-300")}>
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-[#dce5fa]/50 px-5 py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#5b74d6] text-white">
                      <FileSignature className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{c.title}</p>
                      <p className="text-xs text-slate-500">{CONTRACT_TYPE_LABELS[c.contract_type] ?? c.contract_type}</p>
                    </div>
                  </div>
                  <StatusBadge status={status} />
                </div>
                <CardBody className="space-y-3 text-sm">
                  <dl className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-xs text-slate-500">Start date</dt>
                      <dd className="font-medium text-slate-800">{formatDate(c.start_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">End date</dt>
                      <dd className="font-medium text-slate-800">{c.end_date ? formatDate(c.end_date) : "Open-ended"}</dd>
                    </div>
                  </dl>
                  {soon && c.end_date && (
                    <Badge tone="orange">
                      Ends in {daysUntil(c.end_date, today)} day{daysUntil(c.end_date, today) === 1 ? "" : "s"}
                    </Badge>
                  )}
                  {c.terms && <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{c.terms}</p>}
                  {c.document_url && (
                    <a href={`/hris/contracts/${c.id}/document`} target="_blank" rel="noopener" className={buttonClass("outline", "sm")}>
                      <Paperclip className="h-3.5 w-3.5" /> View signed document
                    </a>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* HR view                                                                   */
/* ------------------------------------------------------------------------ */

async function HRContracts({ sp }: { sp: SP }) {
  const supabase = await createClient();
  const today = orgToday();
  const in30 = plusDays(today, 30);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const q = (sp.q ?? "").trim().replace(/[%,()*]/g, " ").slice(0, 60);
  const status = (STATUS_FILTERS as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof STATUS_FILTERS)[number]) : "";
  const type = (CONTRACT_TYPES as readonly string[]).includes(sp.type ?? "") ? sp.type! : "";
  const filtered = Boolean(q || status || type);

  const count = () => supabase.from("contracts").select("id", { count: "exact", head: true });
  const [activeRes, expiringRes, expiredRes, draftRes, employeesRes] = await Promise.all([
    count().eq("status", "active").or(`end_date.is.null,end_date.gte.${today}`),
    count().eq("status", "active").gte("end_date", today).lte("end_date", in30),
    count().or(`status.eq.expired,and(status.eq.active,end_date.lt.${today})`),
    count().eq("status", "draft"),
    supabase.from("employees").select("id, full_name, employee_code").neq("status", "exited").order("first_name").order("last_name").limit(5000),
  ]);
  const employees = employeesRes.data ?? [];

  let employeeIds: string[] | null = null;
  if (q) {
    const { data: matches } = await supabase
      .from("employees")
      .select("id")
      .or(`full_name.ilike.%${q}%,employee_code.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(500);
    employeeIds = (matches ?? []).map((m) => m.id);
  }

  let rows: (Contract & { employee: unknown })[] = [];
  let total = 0;
  if (employeeIds === null || employeeIds.length > 0) {
    let query = supabase
      .from("contracts")
      .select("*, employee:employees!contracts_employee_id_fkey(full_name, employee_code, avatar_url)", { count: "exact" });
    if (employeeIds) query = query.in("employee_id", employeeIds);
    if (type) query = query.eq("contract_type", type);
    if (status === "active") query = query.eq("status", "active").or(`end_date.is.null,end_date.gte.${today}`);
    else if (status === "expiring") query = query.eq("status", "active").gte("end_date", today).lte("end_date", in30);
    else if (status === "expired") query = query.or(`status.eq.expired,and(status.eq.active,end_date.lt.${today})`);
    else if (status) query = query.eq("status", status);
    query =
      status === "expiring"
        ? query.order("end_date", { ascending: true })
        : query.order("created_at", { ascending: false });
    const { data, count: c } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    rows = data ?? [];
    total = c ?? 0;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (overrides: Partial<SP>) => {
    const params = new URLSearchParams();
    const merged = { q, status, type, page: String(page), ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "page" && v === "1")) params.set(k, v);
    const s = params.toString();
    return `/hris/contracts${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Contract Management"
        description="Create, renew and terminate employee contracts. Contracts ending within 30 days are highlighted."
        breadcrumbs={[{ label: "HRIS", href: "/hris" }, { label: "Contract Management" }]}
        actions={
          <Dialog
            size="lg"
            title="New contract"
            trigger={
              <Button>
                <Plus className="h-4 w-4" /> New contract
              </Button>
            }
          >
            {employees.length ? (
              <ActionForm action={createContract} successMessage="Contract created" className="space-y-5">
                <ContractFields mode="create" employees={employees} />
                <div className="flex justify-end border-t border-slate-100 pt-4">
                  <SubmitButton>Create contract</SubmitButton>
                </div>
              </ActionForm>
            ) : (
              <EmptyState title="No employees yet" description="Add employees before recording contracts." />
            )}
          </Dialog>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href={link({ status: "active", page: "1" })}>
          <StatCard label="Active" value={activeRes.count ?? 0} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" className="h-full hover:border-emerald-300" />
        </Link>
        <Link href={link({ status: "expiring", page: "1" })}>
          <StatCard
            label="Expiring in 30 days"
            value={expiringRes.count ?? 0}
            icon={CalendarClock}
            tone="bg-amber-50 text-amber-600"
            className={cn("h-full hover:border-amber-300", (expiringRes.count ?? 0) > 0 && "border-amber-300 bg-amber-50/40")}
          />
        </Link>
        <Link href={link({ status: "expired", page: "1" })}>
          <StatCard label="Expired" value={expiredRes.count ?? 0} icon={CalendarX2} tone="bg-red-50 text-red-600" hint="Past end date" className="h-full hover:border-red-300" />
        </Link>
        <Link href={link({ status: "draft", page: "1" })}>
          <StatCard label="Drafts" value={draftRes.count ?? 0} icon={FilePen} tone="bg-slate-100 text-slate-600" className="h-full hover:border-slate-300" />
        </Link>
      </div>

      <Card>
        <form className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center" action="/hris/contracts">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={q} placeholder="Search employee name, code or email" className="pl-8" />
          </div>
          <Select name="status" defaultValue={status} className="sm:w-48" aria-label="Status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="expiring">Expiring in 30 days</option>
            <option value="expired">Expired</option>
            <option value="draft">Draft</option>
            <option value="terminated">Terminated</option>
            <option value="renewed">Renewed</option>
          </Select>
          <Select name="type" defaultValue={type} className="sm:w-40" aria-label="Type">
            <option value="">All types</option>
            {CONTRACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONTRACT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Button type="submit">Filter</Button>
            {filtered && (
              <Link href="/hris/contracts" className={buttonClass("ghost", "md")}>
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
                  <TH>Contract</TH>
                  <TH>Period</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((c) => (
                  <ContractRow key={c.id} c={c} today={today} />
                ))}
              </TBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link href={link({ page: String(page - 1) })} className={buttonClass("outline", "sm")}>
                    <ChevronLeft className="h-3.5 w-3.5" /> Previous
                  </Link>
                )}
                {page < pages && (
                  <Link href={link({ page: String(page + 1) })} className={buttonClass("outline", "sm")}>
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            icon={FileSignature}
            title={total > 0 ? "No contracts on this page" : filtered ? "No contracts match these filters" : "No contracts yet"}
            description={
              total > 0 ? (
                <Link href={link({ page: "1" })} className="text-primary-600 hover:underline">
                  Go to the first page
                </Link>
              ) : filtered ? (
                "Try a different search or clear the filters."
              ) : (
                "Use “New contract” to record an employee's agreement."
              )
            }
          />
        )}
      </Card>
    </div>
  );
}

function ContractRow({ c, today }: { c: Contract & { employee: unknown }; today: string }) {
  const emp = c.employee as Emp;
  const status = effectiveStatus(c, today);
  const soon = isExpiringSoon(c, today);
  const left = c.end_date ? daysUntil(c.end_date, today) : null;
  const renewStart = c.end_date && c.end_date >= today ? plusDays(c.end_date, 1) : today > c.start_date ? today : plusDays(c.start_date, 1);

  return (
    <TR className={cn(soon && "bg-amber-50/70 hover:bg-amber-50")}>
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
        <p className="max-w-[16rem] truncate font-medium text-slate-800">{c.title}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
          <span>{CONTRACT_TYPE_LABELS[c.contract_type] ?? c.contract_type}</span>
          {c.document_url && (
            <a href={`/hris/contracts/${c.id}/document`} target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 text-primary-600 hover:underline">
              <Paperclip className="h-3 w-3" /> Document
            </a>
          )}
        </div>
      </TD>
      <TD className="whitespace-nowrap text-xs">
        {formatDate(c.start_date)} – {c.end_date ? formatDate(c.end_date) : "Open-ended"}
        {soon && left !== null && (
          <span className="mt-1 flex items-center gap-1 font-medium text-amber-700">
            <AlertTriangle className="h-3 w-3" /> {left === 0 ? "Ends today" : `Ends in ${left} day${left === 1 ? "" : "s"}`}
          </span>
        )}
      </TD>
      <TD>
        <StatusBadge status={status} />
      </TD>
      <TD>
        <div className="flex justify-end gap-1.5">
          <Dialog
            size="lg"
            title="Edit contract"
            description={emp?.full_name ?? undefined}
            trigger={
              <Button size="sm" variant="outline" title="Edit">
                <Pencil className="h-3.5 w-3.5" /> <span className="hidden xl:inline">Edit</span>
              </Button>
            }
          >
            <ActionForm action={updateContract} successMessage="Contract updated" className="space-y-5">
              <ContractFields mode="edit" contract={c} />
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <SubmitButton>Save changes</SubmitButton>
              </div>
            </ActionForm>
          </Dialog>
          {/* Kept mounted after a successful renewal (trigger hidden) so the form can toast and close itself. */}
          <Dialog
              size="lg"
              title="Renew contract"
              description={`Creates a new active contract for ${emp?.full_name ?? "the employee"} and marks this one as renewed.`}
              trigger={
                status === "active" || status === "expired" ? (
                  <Button size="sm" variant="secondary" title="Renew">
                    <RefreshCw className="h-3.5 w-3.5" /> <span className="hidden xl:inline">Renew</span>
                  </Button>
                ) : undefined
              }
            >
              <ActionForm action={renewContract} successMessage="Contract renewed" className="space-y-5">
                <ContractFields
                  mode="renew"
                  contract={c}
                  defaults={{ start_date: renewStart, end_date: c.end_date ? plusDays(renewStart, daysUntil(c.end_date, c.start_date)) : "" }}
                />
                <div className="flex justify-end border-t border-slate-100 pt-4">
                  <SubmitButton>Renew contract</SubmitButton>
                </div>
              </ActionForm>
            </Dialog>
          {(c.status === "active" || c.status === "draft") && (
            <ActionButton action={terminateContract} fields={{ id: c.id }} prompt="Reason for termination" promptRequired variant="danger" successMessage="Contract terminated">
              Terminate
            </ActionButton>
          )}
          {c.status === "draft" && (
            <ActionButton action={deleteContract} fields={{ id: c.id }} confirm="Delete this draft contract?" variant="ghost">
              Delete
            </ActionButton>
          )}
        </div>
      </TD>
    </TR>
  );
}
