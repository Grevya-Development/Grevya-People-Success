import Link from "next/link";
import { BookOpenCheck, FileText, HelpCircle, Settings2 } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { LinkTabs } from "@/components/ui/link-tabs";
import { FaqList } from "./_components/faq-list";
import { DocumentLibrary, type LibraryItem } from "./_components/document-library";

export const metadata = { title: "Policies & FAQs" };

export default async function PoliciesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireEmployee();
  const { tab } = await searchParams;
  const showFaqs = tab === "faqs";
  const supabase = await createClient();

  let policyQuery = supabase
    .from("policies")
    .select("id, title, category, summary, content, version, effective_date, requires_acknowledgement, published, document_name, document_size, document_type")
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

  const items: LibraryItem[] = list.map((p) => ({
    id: p.id,
    title: p.title,
    category: p.category,
    summary: p.summary,
    version: p.version,
    effectiveDate: p.effective_date,
    published: p.published,
    hasContent: Boolean(p.content?.trim()),
    requiresAck: p.requires_acknowledgement,
    ackedAt: ackMap.get(p.id) ?? null,
    docName: p.document_name,
    docSize: p.document_size,
    docType: p.document_type,
  }));

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
          <DocumentLibrary items={items} />
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
