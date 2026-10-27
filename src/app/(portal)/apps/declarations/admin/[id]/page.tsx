import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Eye, Inbox, Users } from "lucide-react";
import { requireHR } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, StatCard, Table, TBody, TD, TH, THead, TR, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { LinkTabs } from "@/components/ui/link-tabs";
import { formatDateTime } from "@/lib/utils";
import { FormBuilder } from "../../../_components/form-builder";
import { deleteDeclarationForm, setDeclarationFormActive } from "../../actions";
import { displayValue, parseFields, parseResponses } from "../../_lib/fields";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditDeclarationFormPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  if (!UUID.test(id)) notFound();
  await requireHR();
  const supabase = await createClient();

  const [{ data: form }, { data: responses }, { data: employees }] = await Promise.all([
    supabase.from("declaration_forms").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("declaration_responses")
      .select(
        "id, employee_id, responses, submitted_at, employee:employees!declaration_responses_employee_id_fkey(full_name, employee_code, avatar_url, department:departments(name))",
      )
      .eq("form_id", id)
      .order("submitted_at", { ascending: false }),
    supabase.from("employees").select("id, full_name, employee_code, avatar_url").neq("status", "exited").order("first_name"),
  ]);
  if (!form) notFound();

  const fields = parseFields(form.fields);
  const rows = responses ?? [];
  const responded = new Set(rows.map((r) => r.employee_id));
  const pending = (employees ?? []).filter((e) => !responded.has(e.id));
  const showResponses = tab === "responses";
  const base = `/apps/declarations/admin/${id}`;

  return (
    <div>
      <PageHeader
        title={form.title}
        breadcrumbs={[{ label: "More Apps", href: "/apps" }, { label: "Declaration Forms", href: "/apps/declarations/admin" }, { label: form.title }]}
        actions={
          <>
            {form.active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}
            <Link href={`/apps/declarations/${id}`} className={buttonClass("ghost")}>
              <Eye className="h-4 w-4" /> Preview
            </Link>
            <ActionButton action={setDeclarationFormActive} fields={{ id, active: !form.active }} variant="outline" size="md">
              {form.active ? "Deactivate" : "Activate"}
            </ActionButton>
            <ActionButton action={deleteDeclarationForm} fields={{ id }} variant="danger" size="md" confirm={`Delete “${form.title}” and its ${rows.length} responses?`}>
              Delete
            </ActionButton>
          </>
        }
      />

      <LinkTabs
        tabs={[
          { label: "Form builder", href: base },
          { label: "Responses", href: `${base}?tab=responses`, count: rows.length },
        ]}
      />

      {!showResponses ? (
        <div className="mx-auto max-w-4xl">
          <FormBuilder
            key={JSON.stringify([form.fields, form.title, form.description, form.due_date, form.active])}
            initial={{ id: form.id, title: form.title, description: form.description, due_date: form.due_date, active: form.active, fields }}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Responses" value={rows.length} icon={Inbox} tone="bg-emerald-50 text-emerald-600" />
            <StatCard label="Yet to respond" value={pending.length} icon={Users} tone="bg-amber-50 text-amber-600" />
            <StatCard
              label="Response rate"
              value={`${employees?.length ? Math.round((rows.length / employees.length) * 100) : 0}%`}
              hint={`of ${employees?.length ?? 0} active employees`}
            />
          </div>

          <Card>
            <CardHeader
              title="Responses"
              action={
                rows.length > 0 && (
                  <a href={`${base}/export`} className={buttonClass("outline", "sm")}>
                    <Download className="h-3.5 w-3.5" /> Download CSV
                  </a>
                )
              }
            />
            {rows.length === 0 ? (
              <EmptyState icon={Inbox} title="No responses yet" description={form.active ? "Responses will appear here as employees submit." : "Activate the form so employees can respond."} />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Employee</TH>
                    <TH>Submitted</TH>
                    {fields.map((f) => (
                      <TH key={f.key} className="max-w-[220px] truncate" title={f.label}>
                        {f.label}
                      </TH>
                    ))}
                  </TR>
                </THead>
                <TBody>
                  {rows.map((r) => {
                    const values = parseResponses(r.responses);
                    return (
                      <TR key={r.id}>
                        <TD>
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <Avatar name={r.employee?.full_name} src={r.employee?.avatar_url} size="xs" />
                            <span>
                              <span className="block text-sm text-slate-800">{r.employee?.full_name}</span>
                              <span className="block text-[11px] text-slate-400">
                                {r.employee?.employee_code}
                                {r.employee?.department?.name ? ` · ${r.employee.department.name}` : ""}
                              </span>
                            </span>
                          </span>
                        </TD>
                        <TD className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.submitted_at)}</TD>
                        {fields.map((f) => (
                          <TD key={f.key} className="max-w-[260px] truncate text-sm" title={displayValue(f, values[f.key])}>
                            {displayValue(f, values[f.key]) || <span className="text-slate-300">—</span>}
                          </TD>
                        ))}
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="Yet to respond" description={`${pending.length} active employees`} />
            {pending.length === 0 ? (
              <EmptyState title="Everyone has responded" />
            ) : (
              <CardBody>
                <ul className="flex flex-wrap gap-2">
                  {pending.slice(0, 60).map((e) => (
                    <li key={e.id} className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-1 pr-3 text-xs text-slate-700">
                      <Avatar name={e.full_name} src={e.avatar_url} size="xs" />
                      {e.full_name}
                    </li>
                  ))}
                  {pending.length > 60 && <li className="self-center text-xs text-slate-500">and {pending.length - 60} more</li>}
                </ul>
              </CardBody>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
