import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Search, Tags, Users } from "lucide-react";
import { requireHR } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { orgToday } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  FormGrid,
  Input,
  PageHeader,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  buttonClass,
} from "@/components/ui";
import { LinkTabs } from "@/components/ui/link-tabs";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ActionButton } from "@/components/ui/action-button";
import type { Tables } from "@/lib/database.types";
import { allocateBalances, deleteHoliday, deleteLeaveType, saveHoliday, saveLeaveType } from "../actions";
import { getLeaveTypes } from "../_lib/data";
import { DOW_SHORT, dayOfWeek, fmtNum, longDate } from "../_lib/dates";
import { EmployeeCell } from "../_components/shared";
import { AdjustBalanceForm } from "../_components/adjust-balance-form";
import { AutoSubmitSelect } from "../_components/auto-submit";

export const metadata = { title: "Leave & Holidays Setup" };

type SP = Record<string, string | string[] | undefined>;

export default async function LeaveAdminPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireHR();
  const sp = await searchParams;
  const tab = sp.tab === "balances" ? "balances" : sp.tab === "holidays" ? "holidays" : "types";
  const thisYear = Number(orgToday().slice(0, 4));
  const yp = Number(sp.year);
  const year = Number.isInteger(yp) && yp > 2000 && yp < 2100 ? yp : thisYear;
  const q = typeof sp.q === "string" ? sp.q : "";

  return (
    <div>
      <PageHeader
        title="Leave & Holidays Setup"
        description="Configure leave types, allocate yearly balances and publish the holiday calendar."
        breadcrumbs={[{ label: "HR Admin" }, { label: "Leave & Holidays Setup" }]}
      />
      <LinkTabs
        tabs={[
          { label: "Leave Types", href: "/leave/admin" },
          { label: "Balances", href: "/leave/admin?tab=balances" },
          { label: "Holidays", href: "/leave/admin?tab=holidays" },
        ]}
      />
      {tab === "types" && <TypesTab />}
      {tab === "balances" && <BalancesTab year={year} q={q} thisYear={thisYear} />}
      {tab === "holidays" && <HolidaysTab year={year} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leave types
// ---------------------------------------------------------------------------

function LeaveTypeFields({ t }: { t?: Tables<"leave_types"> }) {
  return (
    <div className="space-y-4">
      {t && <input type="hidden" name="id" value={t.id} />}
      <FormGrid>
        <Field label="Code" required hint="e.g. CL, SL, EL, LOP, COMP">
          <Input name="code" defaultValue={t?.code} maxLength={10} required className="uppercase" />
        </Field>
        <Field label="Name" required>
          <Input name="name" defaultValue={t?.name} maxLength={60} required />
        </Field>
        <Field label="Annual quota (days)" required>
          <Input name="annual_quota" type="number" min={0} max={365} step={0.5} defaultValue={t?.annual_quota ?? 0} required />
        </Field>
        <Field label="Colour">
          <Input name="color" type="color" defaultValue={t?.color ?? "#f97316"} className="p-1" />
        </Field>
        <Field label="Sort order">
          <Input name="sort_order" type="number" defaultValue={t?.sort_order ?? 0} />
        </Field>
      </FormGrid>
      <div className="grid grid-cols-2 gap-3">
        <Checkbox name="is_paid" label="Paid leave" defaultChecked={t?.is_paid ?? true} />
        <Checkbox name="allow_half_day" label="Allow half day" defaultChecked={t?.allow_half_day ?? true} />
        <Checkbox name="carry_forward" label="Carry forward" defaultChecked={t?.carry_forward ?? false} />
        <Checkbox name="active" label="Active" defaultChecked={t?.active ?? true} />
      </div>
      <p className="text-xs text-slate-500">Unpaid types (like LOP) can be applied without balance. Comp-off approvals credit the type with code COMP.</p>
      <div className="flex justify-end">
        <SubmitButton>{t ? "Save changes" : "Create leave type"}</SubmitButton>
      </div>
    </div>
  );
}

async function TypesTab() {
  const supabase = await createClient();
  const types = await getLeaveTypes(supabase, { activeOnly: false });
  return (
    <Card>
      <CardHeader
        title="Leave types"
        description={`${types.length} configured`}
        action={
          <Dialog
            title="New leave type"
            trigger={
              <Button size="sm">
                <Plus className="h-3.5 w-3.5" /> Add type
              </Button>
            }
          >
            <ActionForm action={saveLeaveType} successMessage="Leave type created">
              <LeaveTypeFields />
            </ActionForm>
          </Dialog>
        }
      />
      {types.length ? (
        <Table>
          <THead>
            <TR>
              <TH>Leave type</TH>
              <TH>Code</TH>
              <TH className="text-right">Annual quota</TH>
              <TH>Rules</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {types.map((t) => (
              <TR key={t.id}>
                <TD>
                  <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </span>
                </TD>
                <TD className="font-mono text-xs">{t.code}</TD>
                <TD className="text-right">{fmtNum(t.annual_quota)}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={t.is_paid ? "green" : "red"}>{t.is_paid ? "Paid" : "Unpaid"}</Badge>
                    {t.allow_half_day && <Badge tone="blue">Half day</Badge>}
                    {t.carry_forward && <Badge tone="purple">Carry forward</Badge>}
                  </div>
                </TD>
                <TD>
                  <Badge tone={t.active ? "green" : "gray"}>{t.active ? "Active" : "Inactive"}</Badge>
                </TD>
                <TD>
                  <div className="flex justify-end gap-2">
                    <Dialog
                      title={`Edit ${t.name}`}
                      trigger={
                        <Button size="sm" variant="outline">
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                      }
                    >
                      <ActionForm action={saveLeaveType} successMessage="Leave type updated" resetOnSuccess={false}>
                        <LeaveTypeFields t={t} />
                      </ActionForm>
                    </Dialog>
                    <ActionButton action={deleteLeaveType} fields={{ id: t.id }} confirm={`Delete ${t.name}?`} variant="danger">
                      Delete
                    </ActionButton>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <EmptyState icon={Tags} title="No leave types yet" description="Create leave types such as Casual, Sick, Earned, LOP and Comp-off." />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

async function BalancesTab({ year, q, thisYear }: { year: number; q: string; thisYear: number }) {
  const supabase = await createClient();
  const types = await getLeaveTypes(supabase);
  let eq = supabase.from("employees").select("id, full_name, employee_code, avatar_url, status").neq("status", "exited").order("full_name").limit(300);
  const term = q.trim().replace(/[%,()]/g, " ").slice(0, 60);
  if (term) eq = eq.or(`full_name.ilike.%${term}%,employee_code.ilike.%${term}%`);
  const { data: emps } = await eq;
  const ids = (emps ?? []).map((e) => e.id);
  const { data: balances } = ids.length
    ? await supabase.from("leave_balances").select("employee_id, leave_type_id, allocated, used").eq("year", year).in("employee_id", ids)
    : { data: [] as { employee_id: string; leave_type_id: string; allocated: number; used: number }[] };

  const years = [thisYear + 1, thisYear, thisYear - 1];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Bulk allocation" description="Credit each leave type's annual quota to every active employee (types with a quota above 0)." />
        <CardBody>
          {types.length ? (
            <ActionForm action={allocateBalances} successMessage="Balances allocated" resetOnSuccess={false} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1.3fr)_auto] lg:items-end">
              <Field label="Year" required>
                <Select name="year" defaultValue={String(year)}>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Leave type">
                <Select name="leave_type_id" defaultValue="all">
                  <option value="all">All types with a quota</option>
                  {types
                    .filter((t) => Number(t.annual_quota) > 0)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({fmtNum(t.annual_quota)} days)
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Mode">
                <Select name="mode" defaultValue="missing">
                  <option value="missing">Only employees without an allocation</option>
                  <option value="overwrite">Reset allocation to quota for everyone</option>
                </Select>
              </Field>
              <SubmitButton>Allocate</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-sm text-slate-500">Create leave types first.</p>
          )}
          <p className="mt-3 text-xs text-slate-500">Used days are never changed by allocation. Comp-off balances are credited automatically when comp-offs are approved.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Employee balances · ${year}`} description="Cells show available / allocated. Use Adjust to change an individual allocation." />
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-3">
          <input type="hidden" name="tab" value="balances" />
          <div className="w-28">
            <AutoSubmitSelect name="year" defaultValue={String(year)} aria-label="Year">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </AutoSubmitSelect>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={q} placeholder="Search name or code" className="pl-9" />
          </div>
          <Button type="submit" size="sm" variant="outline">
            Search
          </Button>
        </form>
        {emps?.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Employee</TH>
                {types.map((t) => (
                  <TH key={t.id} className="text-center">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                      {t.code}
                    </span>
                  </TH>
                ))}
                <TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody>
              {emps.map((e) => {
                const rows = types.map((t) => {
                  const b = balances?.find((x) => x.employee_id === e.id && x.leave_type_id === t.id);
                  return { id: t.id, name: t.name, allocated: Number(b?.allocated ?? 0), used: Number(b?.used ?? 0) };
                });
                return (
                  <TR key={e.id}>
                    <TD>
                      <EmployeeCell name={e.full_name} code={e.employee_code} avatar={e.avatar_url} />
                    </TD>
                    {rows.map((r) => (
                      <TD key={r.id} className="text-center whitespace-nowrap">
                        <span className="font-semibold text-slate-800">{fmtNum(r.allocated - r.used)}</span>
                        <span className="text-slate-400"> / {fmtNum(r.allocated)}</span>
                      </TD>
                    ))}
                    <TD className="text-right">
                      <Dialog
                        title={`Adjust balance — ${e.full_name}`}
                        description={`Year ${year}`}
                        size="sm"
                        trigger={
                          <Button size="sm" variant="outline">
                            Adjust
                          </Button>
                        }
                      >
                        <AdjustBalanceForm employeeId={e.id} year={year} types={rows} />
                      </Dialog>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={Users} title={q ? "No employees match your search" : "No active employees"} />
        )}
        {emps && emps.length >= 300 && <p className="px-5 py-3 text-xs text-slate-500">Showing the first 300 employees — search to narrow down.</p>}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Holidays
// ---------------------------------------------------------------------------

function HolidayFields({ h, locations, year }: { h?: Tables<"holidays">; locations: { id: string; name: string }[]; year: number }) {
  return (
    <div className="space-y-4">
      {h && <input type="hidden" name="id" value={h.id} />}
      <Field label="Holiday name" required>
        <Input name="name" defaultValue={h?.name} maxLength={80} required />
      </Field>
      <FormGrid>
        <Field label="Date" required>
          <Input name="date" type="date" defaultValue={h?.date ?? `${year}-01-01`} required />
        </Field>
        <Field label="Type">
          <Select name="type" defaultValue={h?.type ?? "public"}>
            <option value="public">Public</option>
            <option value="optional">Optional</option>
          </Select>
        </Field>
      </FormGrid>
      <Field label="Location" hint="Leave blank to apply to all locations">
        <Select name="location_id" defaultValue={h?.location_id ?? ""}>
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end">
        <SubmitButton>{h ? "Save changes" : "Add holiday"}</SubmitButton>
      </div>
    </div>
  );
}

async function HolidaysTab({ year }: { year: number }) {
  const supabase = await createClient();
  const [{ data: holidays }, { data: locations }] = await Promise.all([
    supabase.from("holidays").select("*, location:locations(name)").gte("date", `${year}-01-01`).lte("date", `${year}-12-31`).order("date"),
    supabase.from("locations").select("id, name").order("name"),
  ]);
  const locs = locations ?? [];

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            Holidays
            <span className="inline-flex items-center rounded-lg border border-slate-200">
              <Link href={`/leave/admin?tab=holidays&year=${year - 1}`} className="p-1 text-slate-500 hover:text-slate-800" aria-label="Previous year">
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <span className="px-1 text-sm">{year}</span>
              <Link href={`/leave/admin?tab=holidays&year=${year + 1}`} className="p-1 text-slate-500 hover:text-slate-800" aria-label="Next year">
                <ChevronRight className="h-4 w-4" />
              </Link>
            </span>
          </span>
        }
        description={`${holidays?.length ?? 0} holiday(s)`}
        action={
          <Dialog
            title="Add holiday"
            trigger={
              <Button size="sm">
                <Plus className="h-3.5 w-3.5" /> Add holiday
              </Button>
            }
          >
            <ActionForm action={saveHoliday} successMessage="Holiday added">
              <HolidayFields locations={locs} year={year} />
            </ActionForm>
          </Dialog>
        }
      />
      {holidays?.length ? (
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Holiday</TH>
              <TH>Type</TH>
              <TH>Location</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {holidays.map((h) => {
              const loc = h.location as { name: string } | null;
              return (
                <TR key={h.id}>
                  <TD className="whitespace-nowrap">
                    {longDate(h.date)} <span className="text-xs text-slate-400">{DOW_SHORT[dayOfWeek(h.date)]}</span>
                  </TD>
                  <TD className="font-medium text-slate-800">{h.name}</TD>
                  <TD>
                    <Badge tone={h.type === "optional" ? "purple" : "blue"}>{h.type === "optional" ? "Optional" : "Public"}</Badge>
                  </TD>
                  <TD className="text-slate-500">{loc?.name ?? "All locations"}</TD>
                  <TD>
                    <div className="flex justify-end gap-2">
                      <Dialog
                        title="Edit holiday"
                        trigger={
                          <Button size="sm" variant="outline">
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                        }
                      >
                        <ActionForm action={saveHoliday} successMessage="Holiday updated" resetOnSuccess={false}>
                          <HolidayFields h={h} locations={locs} year={year} />
                        </ActionForm>
                      </Dialog>
                      <ActionButton action={deleteHoliday} fields={{ id: h.id }} confirm={`Delete ${h.name}?`} variant="danger">
                        Delete
                      </ActionButton>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      ) : (
        <EmptyState
          icon={CalendarDays}
          title={`No holidays for ${year}`}
          description="Add the public and optional holidays for this year."
          action={
            <Link href="/leave/holidays" className={buttonClass("secondary", "sm")}>
              View employee calendar
            </Link>
          }
        />
      )}
    </Card>
  );
}
