import Link from "next/link";
import { BookOpenCheck, CalendarDays, ChevronRight, FileText, HelpCircle, Settings2 } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { LinkTabs } from "@/components/ui/link-tabs";
import { FaqList } from "./_components/faq-list";

export const metadata = { title: "Policies & FAQs" };

export default async function PoliciesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireEmployee();
  const { tab } = await searchParams;
  const showFaqs = tab === "faqs";
  const supabase = await createClient();

  let policyQuery = supabase
    .from("policies")
    .select("id, title, category, summary, version, effective_date, requires_acknowledgement, published, updated_at")
    .order("category")
    .order("title");
  if (!me.isHR) policyQuery = policyQuery.eq("published", true);

  const [{ data: policies }, { data: acks }, { data: faqs }] = await Promise.all([
    policyQuery,
    supabase.from("policy_acknowledgements").select("policy_id, acknowledged_at").eq("employee_id", me.id),
    supabase.from("faqs").select("id, category, question, answer, sort_order").order("category").order("sort_order").order("question"),
  ]);

  const ackMap = new Map((acks ?? []).map((a) => [a.policy_id, a.acknowledged_at]));
  const list = policies ?? [];
  const pendingAcks = list.filter((p) => p.published && p.requires_acknowledgement && !ackMap.has(p.id)).length;

  const byCategory = new Map<string, typeof list>();
  for (const p of list) {
    const arr = byCategory.get(p.category) ?? [];
    arr.push(p);
    byCategory.set(p.category, arr);
  }

  return (
    <div>
      <PageHeader
        title="Policies & FAQs"
        description="Company policies, guidelines and answers to common questions."
        breadcrumbs={[{ label: "HRIS", href: "/hris" }, { label: "Policies & FAQs" }]}
        actions={
          me.isHR ? (
            <Link href="/hris/admin/policies" className={buttonClass("outline")}>
              <Settings2 className="h-4 w-4" /> Manage policies
            </Link>
          ) : undefined
        }
      />

      <LinkTabs
        tabs={[
          { label: "Policies", href: "/hris/policies", count: list.length },
          { label: "FAQs", href: "/hris/policies?tab=faqs", count: (faqs ?? []).length },
        ]}
      />

      {showFaqs ? (
        <FaqList faqs={faqs ?? []} />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={FileText} title="No policies published yet" description="Policies shared by HR will appear here." />
        </Card>
      ) : (
        <div className="space-y-6">
          {pendingAcks > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <BookOpenCheck className="h-5 w-5 shrink-0" />
              <span>
                You have <strong>{pendingAcks}</strong> {pendingAcks === 1 ? "policy" : "policies"} awaiting your acknowledgement.
              </span>
            </div>
          )}
          {[...byCategory.entries()].map(([category, items]) => (
            <section key={category}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[#3753b8]">
                <span className="h-4 w-1 rounded-full bg-[#5b74d6]" />
                {category}
                <span className="text-xs font-normal normal-case text-slate-400">({items.length})</span>
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map((p) => {
                  const ackedAt = ackMap.get(p.id);
                  return (
                    <Link
                      key={p.id}
                      href={`/hris/policies/${p.id}`}
                      className="group flex flex-col rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition hover:border-[#5b74d6]/50 hover:shadow-md"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#dce5fa] text-[#3753b8]">
                          <FileText className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="line-clamp-2 text-sm font-semibold text-slate-800 group-hover:text-[#3753b8]">{p.title}</h3>
                          <p className="mt-0.5 text-xs text-slate-500">Version {p.version}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-[#3753b8]" />
                      </div>
                      {p.summary && <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-slate-600">{p.summary}</p>}
                      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                          <CalendarDays className="h-3.5 w-3.5" /> Effective {formatDate(p.effective_date)}
                        </span>
                        <span className="ml-auto flex flex-wrap gap-1.5">
                          {!p.published && <Badge tone="gray">Draft</Badge>}
                          {p.requires_acknowledgement &&
                            (ackedAt ? (
                              <span title={`Acknowledged ${formatDateTime(ackedAt)}`}>
                                <Badge tone="green">Acknowledged</Badge>
                              </span>
                            ) : (
                              <Badge tone="yellow">Acknowledgement pending</Badge>
                            ))}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {!showFaqs && (
        <p className="mt-6 flex items-center gap-1.5 text-xs text-slate-500">
          <HelpCircle className="h-3.5 w-3.5" /> Can&apos;t find what you need?{" "}
          <Link href="/hris/policies?tab=faqs" className="font-medium text-[#3753b8] hover:underline">
            Browse FAQs
          </Link>
        </p>
      )}
    </div>
  );
}
