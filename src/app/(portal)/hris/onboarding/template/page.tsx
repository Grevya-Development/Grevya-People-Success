import type { Metadata } from "next";
import { Pencil, Plus, Trash2, Zap } from "lucide-react";
import { requireHR } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Button, Card, Checkbox, EmptyState, Field, FormGrid, Input, PageHeader, Select, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import { deleteTemplate, saveTemplate } from "../../../onboarding/actions";
import { AUTO_LABELS, OWNERS, OWNER_LABELS, type Owner } from "../../../onboarding/_lib";

export const metadata: Metadata = { title: "Onboarding checklist template" };

type Template = {
  id: string;
  title: string;
  description: string | null;
  owner: Owner;
  due_basis: "joining" | "probation_end";
  due_offset_days: number;
  auto_key: string | null;
  sort_order: number;
  active: boolean;
};

function whenText(t: Pick<Template, "due_basis" | "due_offset_days">) {
  const n = t.due_offset_days;
  const base = t.due_basis === "probation_end" ? "probation ends" : "joining";
  if (n === 0) return t.due_basis === "probation_end" ? "When probation ends" : "On the joining day";
  return `${Math.abs(n)} day${Math.abs(n) === 1 ? "" : "s"} ${n < 0 ? "before" : "after"} ${base}`;
}

function TemplateForm({ t }: { t?: Template }) {
  return (
    <ActionForm action={saveTemplate} className="space-y-4" resetOnSuccess={!t}>
      {t && <input type="hidden" name="id" value={t.id} />}
      <Field label="Task" htmlFor={`title-${t?.id ?? "new"}`} required>
        <Input id={`title-${t?.id ?? "new"}`} name="title" defaultValue={t?.title} required maxLength={120} />
      </Field>
      <Field label="Details" htmlFor={`desc-${t?.id ?? "new"}`} hint="Shown under the task. Say where to do it.">
        <Textarea id={`desc-${t?.id ?? "new"}`} name="description" defaultValue={t?.description ?? ""} maxLength={500} rows={2} />
      </Field>
      <FormGrid>
        <Field label="Who does it" htmlFor={`owner-${t?.id ?? "new"}`} required>
          <Select id={`owner-${t?.id ?? "new"}`} name="owner" defaultValue={t?.owner ?? "hr"}>
            {OWNERS.map((o) => (
              <option key={o} value={o}>
                {OWNER_LABELS[o]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ticks itself off when" htmlFor={`auto-${t?.id ?? "new"}`}>
          <Select id={`auto-${t?.id ?? "new"}`} name="auto_key" defaultValue={t?.auto_key ?? ""}>
            <option value="">Never (ticked by hand)</option>
            {Object.entries(AUTO_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label.replace(/^Ticks off when /, "").replace(/^Opens a Service Desk request; ticks off when /, "IT resolves the Service Desk request: ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due" htmlFor={`basis-${t?.id ?? "new"}`}>
          <Select id={`basis-${t?.id ?? "new"}`} name="due_basis" defaultValue={t?.due_basis ?? "joining"}>
            <option value="joining">Relative to the joining date</option>
            <option value="probation_end">Relative to the probation end</option>
          </Select>
        </Field>
        <Field label="Days (negative = before)" htmlFor={`offset-${t?.id ?? "new"}`}>
          <Input id={`offset-${t?.id ?? "new"}`} name="due_offset_days" type="number" min={-90} max={365} defaultValue={t?.due_offset_days ?? 0} />
        </Field>
        <Field label="Order" htmlFor={`sort-${t?.id ?? "new"}`}>
          <Input id={`sort-${t?.id ?? "new"}`} name="sort_order" type="number" defaultValue={t?.sort_order ?? 200} />
        </Field>
      </FormGrid>
      <Checkbox name="active" label="Include for new joiners" defaultChecked={t?.active ?? true} />
      <div className="flex justify-end">
        <SubmitButton>{t ? "Save" : "Add to checklist"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export default async function OnboardingTemplatePage() {
  await requireHR();
  const supabase = await createClient();
  const { data } = await supabase.from("onboarding_templates").select("*").order("sort_order").order("created_at");
  const items = (data ?? []) as Template[];

  return (
    <div>
      <PageHeader
        title="Checklist template"
        description="Every new joiner's checklist is copied from this list. Changes apply to people added from now on."
        breadcrumbs={[{ label: "HR Admin" }, { label: "Onboarding", href: "/hris/onboarding" }, { label: "Checklist template" }]}
        actions={
          <Dialog
            title="Add a checklist item"
            size="lg"
            trigger={
              <Button>
                <Plus className="h-4 w-4" />
                Add item
              </Button>
            }
          >
            <TemplateForm />
          </Dialog>
        }
      />

      <Card>
        {items.length === 0 ? (
          <EmptyState title="The checklist is empty" description="Add the steps every new joiner should go through." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Task</TH>
                <TH>Who</TH>
                <TH>Due</TH>
                <TH>Automatic</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {items.map((t) => (
                <TR key={t.id} className={t.active ? undefined : "opacity-60"}>
                  <TD className="max-w-md">
                    <p className="font-medium text-slate-900">
                      {t.title} {!t.active && <Badge>Off</Badge>}
                    </p>
                    {t.description && <p className="text-xs text-slate-500">{t.description}</p>}
                  </TD>
                  <TD>
                    <Badge tone={t.owner === "manager" ? "blue" : t.owner === "employee" ? "teal" : t.owner === "it" ? "purple" : t.owner === "finance" ? "green" : "gray"}>{OWNER_LABELS[t.owner]}</Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-sm text-slate-600">{whenText(t)}</TD>
                  <TD className="max-w-xs text-xs text-slate-500">
                    {t.auto_key ? (
                      <span className="inline-flex items-start gap-1">
                        <Zap className="mt-0.5 h-3 w-3 shrink-0 text-violet-600" />
                        {AUTO_LABELS[t.auto_key]}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Dialog
                        title="Edit checklist item"
                        size="lg"
                        trigger={
                          <Button variant="ghost" size="sm" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        }
                      >
                        <TemplateForm t={t} />
                      </Dialog>
                      <ActionButton action={deleteTemplate} fields={{ id: t.id }} variant="ghost" size="sm" confirm={`Remove "${t.title}" from the template? Existing checklists keep their copy.`} title="Remove">
                        <Trash2 className="h-4 w-4 text-slate-400" />
                      </ActionButton>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
