import Link from "next/link";
import { BookOpenCheck, Eye, FileText, HelpCircle, Pencil, Plus, Trash2, Users } from "lucide-react";
import { requireHR } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatCard,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  buttonClass,
} from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { ActionButton } from "@/components/ui/action-button";
import { LinkTabs } from "@/components/ui/link-tabs";
import { deleteFaq, deletePolicy, setPolicyPublished } from "./actions";
import { FaqForm, PolicyForm } from "./_components/forms";

export const metadata = { title: "Manage Policies & FAQs" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Person = { id: string; full_name: string | null; employee_code: string; avatar_url: string | null };

export default async function AdminPoliciesPage({ searchParams }: { searchParams: Promise<{ tab?: string; edit?: string }> }) {
  await requireHR();
  const { tab, edit } = await searchParams;
  const showFaqs = tab === "faqs";
  const supabase = await createClient();

  const [{ data: policies }, { data: faqs }, { data: acks }, { data: people }] = await Promise.all([
    supabase.from("policies").select("*").order("category").order("title"),
    supabase.from("faqs").select("*").order("category").order("sort_order").order("question"),
    supabase.from("policy_acknowledgements").select("policy_id, employee_id, acknowledged_at").order("acknowledged_at", { ascending: false }),
    supabase.from("employees").select("id, full_name, employee_code, avatar_url").neq("status", "exited").order("full_name"),
  ]);

  const policyList = policies ?? [];
  const faqList = faqs ?? [];
  const activePeople: Person[] = people ?? [];
  const activeIds = new Set(activePeople.map((p) => p.id));
  const peopleById = new Map(activePeople.map((p) => [p.id, p]));
  const activeCount = activePeople.length;

  const acksByPolicy = new Map<string, { employee_id: string; acknowledged_at: string }[]>();
  for (const a of acks ?? []) {
    const arr = acksByPolicy.get(a.policy_id) ?? [];
    arr.push(a);
    acksByPolicy.set(a.policy_id, arr);
  }

  const policyCategories = [...new Set(["General", ...policyList.map((p) => p.category)])].sort();
  const faqCategories = [...new Set(["General", ...faqList.map((f) => f.category)])].sort();

  const editing = edit === "new" ? "new" : edit && UUID.test(edit) ? policyList.find((p) => p.id === edit) ?? null : null;

  return (
    <div>
      <PageHeader
        title="Manage Policies & FAQs"
        description="Publish company policies, track acknowledgements and maintain the FAQ library."
        breadcrumbs={[{ label: "HR Admin" }, { label: "Policies & FAQs" }]}
        actions={
          <>
            <Link href="/hris/policies" className={buttonClass("outline")}>
              <Eye className="h-4 w-4" /> Employee view
            </Link>
            {showFaqs ? (
              <Dialog
                title="Add FAQ"
                size="lg"
                trigger={
                  <Button>
                    <Plus className="h-4 w-4" /> Add FAQ
                  </Button>
                }
              >
                <FaqForm categories={faqCategories} />
              </Dialog>
            ) : (
              <Link href="/hris/admin/policies?edit=new" className={buttonClass("primary")}>
                <Plus className="h-4 w-4" /> New policy
              </Link>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Policies" value={policyList.length} icon={FileText} tone="bg-[#dce5fa] text-[#3753b8]" />
        <StatCard label="Published" value={policyList.filter((p) => p.published).length} icon={Eye} tone="bg-emerald-50 text-emerald-600" />
        <StatCard
          label="Need acknowledgement"
          value={policyList.filter((p) => p.requires_acknowledgement && p.published).length}
          icon={BookOpenCheck}
          tone="bg-amber-50 text-amber-600"
        />
        <StatCard label="FAQs" value={faqList.length} icon={HelpCircle} tone="bg-violet-50 text-violet-600" />
      </div>

      <LinkTabs
        tabs={[
          { label: "Policies", href: "/hris/admin/policies", count: policyList.length },
          { label: "FAQs", href: "/hris/admin/policies?tab=faqs", count: faqList.length },
        ]}
      />

      {!showFaqs && edit && (
        <Card className="mb-6">
          <CardHeader
            title={editing === "new" ? "New policy" : editing ? `Edit: ${editing.title}` : "Policy not found"}
            description={editing ? "Changes are visible to employees as soon as you save a published policy." : undefined}
          />
          <div className="px-5 py-4">
            {editing ? (
              <PolicyForm key={editing === "new" ? "new" : editing.id} policy={editing === "new" ? null : editing} categories={policyCategories} />
            ) : (
              <p className="text-sm text-slate-500">
                This policy no longer exists.{" "}
                <Link href="/hris/admin/policies" className="text-primary-600 hover:underline">
                  Back to list
                </Link>
              </p>
            )}
          </div>
        </Card>
      )}

      {showFaqs ? (
        <Card>
          {faqList.length === 0 ? (
            <EmptyState icon={HelpCircle} title="No FAQs yet" description="Add the questions employees ask most often." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Category</TH>
                  <TH>Question</TH>
                  <TH className="text-center">Order</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {faqList.map((f) => (
                  <TR key={f.id}>
                    <TD>
                      <Badge tone="blue">{f.category}</Badge>
                    </TD>
                    <TD className="min-w-[280px]">
                      <p className="font-medium text-slate-800">{f.question}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{f.answer}</p>
                    </TD>
                    <TD className="text-center">{f.sort_order}</TD>
                    <TD>
                      <div className="flex justify-end gap-1.5">
                        <Dialog
                          title="Edit FAQ"
                          size="lg"
                          trigger={
                            <Button variant="outline" size="sm">
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </Button>
                          }
                        >
                          <FaqForm faq={f} categories={faqCategories} />
                        </Dialog>
                        <ActionButton action={deleteFaq} fields={{ id: f.id }} confirm="Delete this FAQ?" variant="danger" title="Delete FAQ">
                          <Trash2 className="h-3.5 w-3.5" />
                        </ActionButton>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : (
        <Card>
          {policyList.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No policies yet"
              description="Create your first policy — e.g. Code of Conduct, Leave Policy or IT Acceptable Use."
              action={
                <Link href="/hris/admin/policies?edit=new" className={buttonClass("primary")}>
                  <Plus className="h-4 w-4" /> New policy
                </Link>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Policy</TH>
                  <TH>Version</TH>
                  <TH>Effective</TH>
                  <TH>Status</TH>
                  <TH>Acknowledgements</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {policyList.map((p) => {
                  const all = acksByPolicy.get(p.id) ?? [];
                  const acked = all.filter((a) => activeIds.has(a.employee_id));
                  const ackedIds = new Set(acked.map((a) => a.employee_id));
                  const pending = activePeople.filter((e) => !ackedIds.has(e.id));
                  const pct = activeCount ? Math.round((acked.length / activeCount) * 100) : 0;
                  return (
                    <TR key={p.id} className={edit === p.id ? "bg-[#dce5fa]/40" : undefined}>
                      <TD className="min-w-[240px]">
                        <Link href={`/hris/policies/${p.id}`} className="font-medium text-slate-800 hover:text-[#3753b8]">
                          {p.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-slate-500">{p.category}</p>
                      </TD>
                      <TD>{p.version}</TD>
                      <TD className="whitespace-nowrap">{formatDate(p.effective_date)}</TD>
                      <TD>{p.published ? <Badge tone="green">Published</Badge> : <Badge tone="gray">Draft</Badge>}</TD>
                      <TD className="min-w-[180px]">
                        {p.requires_acknowledgement ? (
                          <div className="flex items-center gap-2">
                            <div className="w-24">
                              <ProgressBar value={pct} barClassName={pct === 100 ? "bg-emerald-500" : "bg-[#5b74d6]"} />
                            </div>
                            <Dialog
                              title={`Acknowledgements — ${p.title}`}
                              description={`${acked.length} of ${activeCount} active employees (${pct}%)`}
                              size="lg"
                              trigger={
                                <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-[#3753b8] hover:underline">
                                  <Users className="h-3.5 w-3.5" />
                                  {acked.length}/{activeCount}
                                </button>
                              }
                            >
                              <AckLists
                                acked={acked.map((a) => ({ person: peopleById.get(a.employee_id)!, at: a.acknowledged_at }))}
                                pending={pending}
                              />
                            </Dialog>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Not required</span>
                        )}
                      </TD>
                      <TD>
                        <div className="flex justify-end gap-1.5">
                          <Link href={`/hris/admin/policies?edit=${p.id}`} className={buttonClass("outline", "sm")}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Link>
                          <ActionButton
                            action={setPolicyPublished}
                            fields={{ id: p.id, published: !p.published }}
                            variant={p.published ? "outline" : "success"}
                          >
                            {p.published ? "Unpublish" : "Publish"}
                          </ActionButton>
                          <ActionButton
                            action={deletePolicy}
                            fields={{ id: p.id }}
                            confirm={`Delete “${p.title}”? Acknowledgements will also be removed.`}
                            variant="danger"
                            title="Delete policy"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
      )}
    </div>
  );
}

function AckLists({ acked, pending }: { acked: { person: Person; at: string }[]; pending: Person[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">Acknowledged ({acked.length})</h4>
        {acked.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">No one has acknowledged yet.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100 thin-scroll">
            {acked.map(({ person, at }) => (
              <li key={person.id} className="flex items-center gap-2.5 px-3 py-2">
                <Avatar name={person.full_name} src={person.avatar_url} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{person.full_name}</p>
                  <p className="text-[11px] text-slate-500">
                    {person.employee_code} · {formatDateTime(at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Pending ({pending.length})</h4>
        {pending.length === 0 ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-4 text-center text-xs text-emerald-700">Everyone has acknowledged.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100 thin-scroll">
            {pending.map((person) => (
              <li key={person.id} className="flex items-center gap-2.5 px-3 py-2">
                <Avatar name={person.full_name} src={person.avatar_url} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{person.full_name}</p>
                  <p className="text-[11px] text-slate-500">{person.employee_code}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
