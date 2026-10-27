import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus, Puzzle, Trash2 } from "lucide-react";
import { requireHR } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, Field, FormGrid, Input, PageHeader, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import type { Tables } from "@/lib/database.types";
import { deleteAddon, moveAddon, saveAddon, setAddonActive } from "./actions";

export const metadata = { title: "Add-ons" };

type Addon = Tables<"addons">;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const safeColor = (c: string) => (HEX_RE.test(c) ? c : "#64748b");
const isInternal = (u: string) => /^\/(?![\/\\])/.test(u);
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) || isInternal(u) ? u : undefined);

function AddonIcon({ addon, size = 36 }: { addon: Pick<Addon, "name" | "color">; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg font-semibold text-white shadow-sm"
      style={{ backgroundColor: safeColor(addon.color), width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {addon.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function AddonForm({ addon, nextSort }: { addon?: Addon; nextSort: number }) {
  return (
    <ActionForm action={saveAddon} className="space-y-4">
      {addon && <input type="hidden" name="id" value={addon.id} />}
      <FormGrid>
        <Field label="Name" required>
          <Input name="name" defaultValue={addon?.name} required maxLength={80} placeholder="e.g. Slack" />
        </Field>
        <Field label="URL" required>
          <Input name="url" type="text" inputMode="url" defaultValue={addon?.url} required placeholder="https://… or /recruit/jobs" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea name="description" defaultValue={addon?.description ?? ""} rows={2} maxLength={300} placeholder="Shown under the tile on More Apps" />
        </Field>
        <Field label="Tile colour" hint="Used for the initial icon">
          <Input name="color" type="color" defaultValue={addon ? safeColor(addon.color) : "#2563eb"} className="h-9 w-20 cursor-pointer p-1" />
        </Field>
        <Field label="Sort order" hint="Lower numbers appear first">
          <Input name="sort_order" type="number" step={1} defaultValue={addon?.sort_order ?? nextSort} />
        </Field>
      </FormGrid>
      <Checkbox name="active" label="Active (visible to employees)" defaultChecked={addon?.active ?? true} />
      <div className="flex justify-end">
        <SubmitButton>{addon ? "Save changes" : "Create add-on"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export default async function AddonsAdminPage() {
  await requireHR();
  const supabase = await createClient();
  const { data } = await supabase.from("addons").select("*").order("sort_order").order("name");
  const addons = data ?? [];
  const nextSort = addons.length ? Math.max(...addons.map((a) => a.sort_order)) + 10 : 10;
  const active = addons.filter((a) => a.active);

  return (
    <div>
      <PageHeader
        title="Add-ons"
        description="External tools listed under More Apps → Add-ons. Links open in a new tab."
        breadcrumbs={[{ label: "HR Admin" }, { label: "Add-ons" }]}
        actions={
          <Dialog
            trigger={
              <Button>
                <Plus className="h-4 w-4" /> New add-on
              </Button>
            }
            title="New add-on"
          >
            <AddonForm nextSort={nextSort} />
          </Dialog>
        }
      />

      {addons.length === 0 ? (
        <Card>
          <EmptyState icon={Puzzle} title="No add-ons yet" description="Add links to tools your teams use every day — chat, ticketing, travel, insurance portals and more." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="All add-ons" description={`${addons.length} total · ${active.length} active`} />
            <Table>
              <THead>
                <tr>
                  <TH className="w-20">Order</TH>
                  <TH>Add-on</TH>
                  <TH>URL</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </tr>
              </THead>
              <TBody>
                {addons.map((a, i) => (
                  <TR key={a.id}>
                    <TD>
                      <div className="flex items-center gap-0.5">
                        <ActionButton action={moveAddon} fields={{ id: a.id, dir: "up" }} variant="ghost" className="h-7 px-1.5" disabled={i === 0} title="Move up">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </ActionButton>
                        <ActionButton action={moveAddon} fields={{ id: a.id, dir: "down" }} variant="ghost" className="h-7 px-1.5" disabled={i === addons.length - 1} title="Move down">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </ActionButton>
                      </div>
                    </TD>
                    <TD className="min-w-[220px]">
                      <div className="flex items-center gap-3">
                        <AddonIcon addon={a} />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800">{a.name}</p>
                          <p className="line-clamp-1 text-xs text-slate-500">{a.description || "—"}</p>
                        </div>
                      </div>
                    </TD>
                    <TD className="max-w-[240px]">
                      <a href={safeUrl(a.url)} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-xs text-primary-600 hover:underline">
                        <span className="truncate">{a.url.replace(/^https?:\/\//, "")}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </TD>
                    <TD>
                      <ActionButton action={setAddonActive} fields={{ id: a.id, active: !a.active }} variant="ghost" className="px-1" title={a.active ? "Hide from employees" : "Show to employees"}>
                        {a.active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Hidden</Badge>}
                      </ActionButton>
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Dialog
                          trigger={
                            <Button size="sm" variant="ghost" title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          }
                          title={`Edit ${a.name}`}
                        >
                          <AddonForm addon={a} nextSort={nextSort} />
                        </Dialog>
                        <ActionButton action={deleteAddon} fields={{ id: a.id }} variant="ghost" title="Delete" confirm={`Delete "${a.name}"?`}>
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </ActionButton>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card className="h-fit">
            <CardHeader title="Preview" description="How employees see active add-ons" />
            {active.length === 0 ? (
              <EmptyState icon={Puzzle} title="Nothing active" description="Activate an add-on to show it to employees." />
            ) : (
              <div className="grid grid-cols-2 gap-3 p-4">
                {active.map((a) => (
                  <a
                    key={a.id}
                    href={safeUrl(a.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-3 text-center transition hover:border-slate-300 hover:shadow-sm"
                  >
                    <AddonIcon addon={a} size={40} />
                    <span className="line-clamp-1 text-xs font-medium text-slate-700">{a.name}</span>
                  </a>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
