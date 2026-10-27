import Link from "next/link";
import { Download, FileCheck2, Pencil, Plus } from "lucide-react";
import { requireHR } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, ProgressBar, Table, TBody, TD, TH, THead, TR, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { formatDate, orgToday } from "@/lib/utils";
import { deleteDeclarationForm, setDeclarationFormActive } from "../actions";
import { parseFields } from "../_lib/fields";

export const metadata = { title: "Declaration Forms" };

export default async function DeclarationAdminPage() {
  await requireHR();
  const supabase = await createClient();
  const [{ data: forms }, { count: headcount }] = await Promise.all([
    supabase.from("declaration_forms").select("id, title, due_date, active, fields, created_at, declaration_responses(count)").order("created_at", { ascending: false }),
    supabase.from("employees").select("id", { count: "exact", head: true }).neq("status", "exited"),
  ]);
  const total = headcount ?? 0;
  const today = orgToday();

  const newBtn = (
    <Link href="/apps/declarations/admin/new" className={buttonClass("primary")}>
      <Plus className="h-4 w-4" /> New form
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="Declaration Forms"
        description="Build declaration forms, publish them to employees and download responses."
        breadcrumbs={[{ label: "More Apps", href: "/apps" }, { label: "Declaration App", href: "/apps/declarations" }, { label: "Manage forms" }]}
        actions={newBtn}
      />
      <Card>
        {!forms || forms.length === 0 ? (
          <EmptyState icon={FileCheck2} title="No declaration forms yet" description="Create a form, add questions and set a due date." action={newBtn} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Form</TH>
                <TH>Fields</TH>
                <TH>Due date</TH>
                <TH>Status</TH>
                <TH className="min-w-[180px]">Responses</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {forms.map((f) => {
                const responses = f.declaration_responses?.[0]?.count ?? 0;
                const pct = total ? Math.round((responses / total) * 100) : 0;
                const closed = !!f.due_date && today > f.due_date;
                return (
                  <TR key={f.id}>
                    <TD className="min-w-[220px]">
                      <Link href={`/apps/declarations/admin/${f.id}`} className="font-medium text-slate-800 hover:text-primary-600">
                        {f.title}
                      </Link>
                      <p className="text-[11px] text-slate-400">Created {formatDate(f.created_at)}</p>
                    </TD>
                    <TD>{parseFields(f.fields).length}</TD>
                    <TD className="whitespace-nowrap">
                      {f.due_date ? formatDate(f.due_date) : <span className="text-slate-400">None</span>}
                      {closed && <span className="ml-1 text-[11px] text-red-500">(closed)</span>}
                    </TD>
                    <TD>{f.active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <ProgressBar value={pct} className="w-24" barClassName="bg-emerald-500" />
                        <span className="whitespace-nowrap text-xs text-slate-600">
                          {responses} / {total}
                        </span>
                      </div>
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1.5">
                        <Link href={`/apps/declarations/admin/${f.id}`} className={buttonClass("outline", "sm")}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Link>
                        <a href={`/apps/declarations/admin/${f.id}/export`} className={buttonClass("ghost", "sm")} title="Download CSV">
                          <Download className="h-3.5 w-3.5" /> CSV
                        </a>
                        <ActionButton action={setDeclarationFormActive} fields={{ id: f.id, active: !f.active }} variant="ghost">
                          {f.active ? "Deactivate" : "Activate"}
                        </ActionButton>
                        <ActionButton
                          action={deleteDeclarationForm}
                          fields={{ id: f.id }}
                          variant="danger"
                          confirm={`Delete “${f.title}”? All ${responses} responses will be removed permanently.`}
                        >
                          Delete
                        </ActionButton>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
