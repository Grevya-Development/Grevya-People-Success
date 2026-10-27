import type { Metadata } from "next";
import Link from "next/link";
import { Building2, BriefcaseBusiness, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { requireHR } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  FormGrid,
  Input,
  PageHeader,
  StatCard,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ActionButton } from "@/components/ui/action-button";
import { Dialog } from "@/components/ui/dialog";
import { LinkTabs } from "@/components/ui/link-tabs";
import { formatDate } from "@/lib/utils";
import {
  deleteDepartment,
  deleteDesignation,
  deleteLocation,
  saveDepartment,
  saveDesignation,
  saveLocation,
} from "./actions";

export const metadata: Metadata = { title: "Departments & Locations" };

type Tab = "departments" | "designations" | "locations";
type Usage = { total: number; active: number };

export default async function OrgSetupPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireHR();
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "designations" || rawTab === "locations" ? rawTab : "departments";

  const supabase = await createClient();
  const [deps, desigs, locs, emps] = await Promise.all([
    supabase.from("departments").select("id, name, code, created_at").order("name"),
    supabase.from("designations").select("id, title, level, created_at").order("level").order("title"),
    supabase.from("locations").select("id, name, city, country, created_at").order("name"),
    supabase.from("employees").select("department_id, designation_id, location_id, status"),
  ]);

  const tally = (key: "department_id" | "designation_id" | "location_id") => {
    const m = new Map<string, Usage>();
    for (const e of emps.data ?? []) {
      const id = e[key];
      if (!id) continue;
      const u = m.get(id) ?? { total: 0, active: 0 };
      u.total++;
      if (e.status !== "exited") u.active++;
      m.set(id, u);
    }
    return (id: string) => m.get(id) ?? { total: 0, active: 0 };
  };
  const depUsage = tally("department_id");
  const desigUsage = tally("designation_id");
  const locUsage = tally("location_id");

  const departments = deps.data ?? [];
  const designations = desigs.data ?? [];
  const locations = locs.data ?? [];

  return (
    <div>
      <PageHeader
        title="Departments & Locations"
        description="Organisation reference data used across employee records, filters and reports."
        breadcrumbs={[{ label: "HR Admin", href: "/hris/employees" }, { label: "Departments & Locations" }]}
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Departments" value={departments.length} icon={Building2} tone="bg-indigo-50 text-[#4f46e5]" />
        <StatCard label="Designations" value={designations.length} icon={BriefcaseBusiness} tone="bg-indigo-50 text-[#4f46e5]" />
        <StatCard label="Locations" value={locations.length} icon={MapPin} tone="bg-indigo-50 text-[#4f46e5]" />
      </div>

      <LinkTabs
        tabs={[
          { label: "Departments", href: "/admin/org", count: departments.length },
          { label: "Designations", href: "/admin/org?tab=designations", count: designations.length },
          { label: "Locations", href: "/admin/org?tab=locations", count: locations.length },
        ]}
      />

      {tab === "departments" && (
        <Card>
          <CardHeader
            title="Departments"
            description="Name and short code (e.g. Engineering · ENG)."
            action={
              <Dialog trigger={<AddButton label="Add department" />} title="Add department">
                <DepartmentForm />
              </Dialog>
            }
          />
          {departments.length === 0 ? (
            <EmptyState icon={Building2} title="No departments yet" description="Add departments so employees can be grouped and filtered." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Department</TH>
                  <TH>Code</TH>
                  <TH>Employees</TH>
                  <TH>Created</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {departments.map((d) => {
                  const u = depUsage(d.id);
                  return (
                    <TR key={d.id}>
                      <TD className="font-medium text-slate-900">{d.name}</TD>
                      <TD>
                        <Badge tone="purple">{d.code}</Badge>
                      </TD>
                      <TD>
                        <UsageCell usage={u} filterHref={`/hris/employees?dept=${d.id}`} />
                      </TD>
                      <TD className="whitespace-nowrap text-slate-500">{formatDate(d.created_at)}</TD>
                      <TD>
                        <RowActions
                          editTitle="Edit department"
                          form={<DepartmentForm value={d} />}
                          deleteAction={deleteDepartment}
                          id={d.id}
                          name={d.name}
                          inUse={u.total}
                        />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {tab === "designations" && (
        <Card>
          <CardHeader
            title="Designations"
            description="Job titles with a seniority level (1 = entry level)."
            action={
              <Dialog trigger={<AddButton label="Add designation" />} title="Add designation">
                <DesignationForm />
              </Dialog>
            }
          />
          {designations.length === 0 ? (
            <EmptyState icon={BriefcaseBusiness} title="No designations yet" description="Add job titles to assign to employees." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Designation</TH>
                  <TH>Level</TH>
                  <TH>Employees</TH>
                  <TH>Created</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {designations.map((d) => {
                  const u = desigUsage(d.id);
                  return (
                    <TR key={d.id}>
                      <TD className="font-medium text-slate-900">{d.title}</TD>
                      <TD>
                        <Badge tone="blue">L{d.level}</Badge>
                      </TD>
                      <TD>
                        <UsageCell usage={u} />
                      </TD>
                      <TD className="whitespace-nowrap text-slate-500">{formatDate(d.created_at)}</TD>
                      <TD>
                        <RowActions
                          editTitle="Edit designation"
                          form={<DesignationForm value={d} />}
                          deleteAction={deleteDesignation}
                          id={d.id}
                          name={d.title}
                          inUse={u.total}
                        />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {tab === "locations" && (
        <Card>
          <CardHeader
            title="Locations"
            description="Offices and work sites."
            action={
              <Dialog trigger={<AddButton label="Add location" />} title="Add location">
                <LocationForm />
              </Dialog>
            }
          />
          {locations.length === 0 ? (
            <EmptyState icon={MapPin} title="No locations yet" description="Add the offices your employees work from." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Location</TH>
                  <TH>City</TH>
                  <TH>Country</TH>
                  <TH>Employees</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {locations.map((l) => {
                  const u = locUsage(l.id);
                  return (
                    <TR key={l.id}>
                      <TD className="font-medium text-slate-900">{l.name}</TD>
                      <TD>{l.city ?? "—"}</TD>
                      <TD>{l.country}</TD>
                      <TD>
                        <UsageCell usage={u} filterHref={`/hris/employees?loc=${l.id}`} />
                      </TD>
                      <TD>
                        <RowActions
                          editTitle="Edit location"
                          form={<LocationForm value={l} />}
                          deleteAction={deleteLocation}
                          id={l.id}
                          name={l.name}
                          inUse={u.total}
                        />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}

function AddButton({ label }: { label: string }) {
  return (
    <Button size="sm">
      <Plus className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

function UsageCell({ usage, filterHref }: { usage: Usage; filterHref?: string }) {
  if (usage.total === 0) return <span className="text-xs text-slate-400">Not in use</span>;
  const label = (
    <>
      <span className="font-medium text-slate-800">{usage.active}</span>
      <span className="text-xs text-slate-500"> active{usage.total > usage.active ? ` · ${usage.total - usage.active} exited` : ""}</span>
    </>
  );
  return filterHref ? (
    <Link href={filterHref} className="whitespace-nowrap hover:underline">
      {label}
    </Link>
  ) : (
    <span className="whitespace-nowrap">{label}</span>
  );
}

type DeleteAction = typeof deleteDepartment;

function RowActions({
  editTitle,
  form,
  deleteAction,
  id,
  name,
  inUse,
}: {
  editTitle: string;
  form: React.ReactNode;
  deleteAction: DeleteAction;
  id: string;
  name: string;
  inUse: number;
}) {
  return (
    // `relative` keeps the sr-only "Delete" label inside the table's scroll container (else it widens the page on mobile).
    <div className="relative flex justify-end gap-1.5">
      <Dialog
        trigger={
          <Button variant="outline" size="sm" aria-label={`Edit ${name}`}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        }
        title={editTitle}
      >
        {form}
      </Dialog>
      <ActionButton
        action={deleteAction}
        fields={{ id }}
        confirm={`Delete “${name}”?`}
        variant="danger"
        disabled={inUse > 0}
        title={inUse > 0 ? `In use by ${inUse} employee${inUse === 1 ? "" : "s"} — reassign them before deleting` : `Delete ${name}`}
        successMessage="Deleted"
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only">Delete</span>
      </ActionButton>
    </div>
  );
}

function FormFooter({ editing }: { editing: boolean }) {
  return (
    <div className="mt-5 flex justify-end">
      <SubmitButton>{editing ? "Save changes" : "Add"}</SubmitButton>
    </div>
  );
}

function DepartmentForm({ value }: { value?: { id: string; name: string; code: string } }) {
  return (
    <ActionForm action={saveDepartment} resetOnSuccess={!value}>
      {value && <input type="hidden" name="id" value={value.id} />}
      <FormGrid>
        <Field label="Department name" htmlFor="dep-name" required>
          <Input id="dep-name" name="name" defaultValue={value?.name} required maxLength={80} placeholder="Engineering" />
        </Field>
        <Field label="Code" htmlFor="dep-code" required hint="2–12 characters, e.g. ENG">
          <Input id="dep-code" name="code" defaultValue={value?.code} required maxLength={12} className="uppercase" placeholder="ENG" />
        </Field>
      </FormGrid>
      <FormFooter editing={!!value} />
    </ActionForm>
  );
}

function DesignationForm({ value }: { value?: { id: string; title: string; level: number } }) {
  return (
    <ActionForm action={saveDesignation} resetOnSuccess={!value}>
      {value && <input type="hidden" name="id" value={value.id} />}
      <FormGrid>
        <Field label="Title" htmlFor="des-title" required>
          <Input id="des-title" name="title" defaultValue={value?.title} required maxLength={80} placeholder="Senior Software Engineer" />
        </Field>
        <Field label="Level" htmlFor="des-level" required hint="1 (entry) to 20 (most senior)">
          <Input id="des-level" name="level" type="number" min={1} max={20} step={1} defaultValue={value?.level ?? 1} required />
        </Field>
      </FormGrid>
      <FormFooter editing={!!value} />
    </ActionForm>
  );
}

function LocationForm({ value }: { value?: { id: string; name: string; city: string | null; country: string } }) {
  return (
    <ActionForm action={saveLocation} resetOnSuccess={!value}>
      {value && <input type="hidden" name="id" value={value.id} />}
      <FormGrid>
        <Field label="Location name" htmlFor="loc-name" required className="sm:col-span-2">
          <Input id="loc-name" name="name" defaultValue={value?.name} required maxLength={80} placeholder="Bengaluru HQ" />
        </Field>
        <Field label="City" htmlFor="loc-city">
          <Input id="loc-city" name="city" defaultValue={value?.city ?? ""} maxLength={80} placeholder="Bengaluru" />
        </Field>
        <Field label="Country" htmlFor="loc-country" required>
          <Input id="loc-country" name="country" defaultValue={value?.country ?? "India"} required maxLength={60} />
        </Field>
      </FormGrid>
      <FormFooter editing={!!value} />
    </ActionForm>
  );
}
