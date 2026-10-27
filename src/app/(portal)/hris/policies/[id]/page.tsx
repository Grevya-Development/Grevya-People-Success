import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, Download, Eye, FileText, Pencil, ShieldCheck, Tag } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Badge, Card, CardBody, PageHeader, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { acknowledgePolicy } from "../actions";
import { toDisplayHtml } from "../_lib/sanitize";
import { fileKind, formatBytes, isViewable } from "../_lib/files";
import { FileBadge } from "../_components/file-badge";

export const metadata = { title: "Policy" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireEmployee();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();

  const [{ data: policy }, { data: ack }] = await Promise.all([
    supabase.from("policies").select("*").eq("id", id).maybeSingle(),
    supabase.from("policy_acknowledgements").select("acknowledged_at").eq("policy_id", id).eq("employee_id", me.id).maybeSingle(),
  ]);
  if (!policy || (!policy.published && !me.isHR)) notFound();
  const kind = policy.document_name ? fileKind(policy.document_name, policy.document_type) : null;
  const viewable = kind ? isViewable(kind) : false;
  const hasContent = Boolean(policy.content?.trim());

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={policy.title}
        breadcrumbs={[
          { label: "HRIS", href: "/hris" },
          { label: "Policies & FAQs", href: "/hris/policies" },
          { label: policy.title },
        ]}
        actions={
          <>
            <Link href="/hris/policies" className={buttonClass("ghost")}>
              <ArrowLeft className="h-4 w-4" /> All policies
            </Link>
            {me.isHR && (
              <Link href={`/hris/admin/policies?edit=${policy.id}`} className={buttonClass("outline")}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            )}
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-100 bg-[#dce5fa]/50 px-5 py-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-[#3753b8]" /> {policy.category}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-[#3753b8]" /> Version {policy.version}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-[#3753b8]" /> Effective {formatDate(policy.effective_date)}
          </span>
          <span className="text-slate-400">Updated {formatDate(policy.updated_at)}</span>
          {!policy.published && <Badge tone="gray">Draft — not visible to employees</Badge>}
        </div>
        <CardBody className="px-5 py-6 sm:px-8">
          {policy.summary && <p className="mb-4 rounded-lg bg-slate-50 px-4 py-3 text-sm italic text-slate-600">{policy.summary}</p>}
          {kind && (
            <div className="mb-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:items-center">
              <FileBadge kind={kind} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{policy.document_name}</p>
                <p className="text-xs text-slate-500">Documents Size {formatBytes(policy.document_size)}</p>
              </div>
              <div className="flex gap-2">
                {viewable && (
                  <a href={`/hris/policies/${policy.id}/document`} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
                    <Eye className="h-4 w-4" /> View document
                  </a>
                )}
                <a href={`/hris/policies/${policy.id}/document?download=1`} className={buttonClass("outline")}>
                  <Download className="h-4 w-4" /> Download
                </a>
              </div>
            </div>
          )}
          {hasContent ? (
            <div className="prose-doc text-sm" dangerouslySetInnerHTML={{ __html: toDisplayHtml(policy.content ?? "") }} />
          ) : (
            !kind && <p className="text-sm text-slate-500">This policy has no content yet.</p>
          )}
        </CardBody>

        {policy.requires_acknowledgement && (
          <div className="border-t border-slate-100 px-5 py-4 sm:px-8">
            {ack ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
                You acknowledged this policy on {formatDateTime(ack.acknowledged_at)}.
              </div>
            ) : policy.published ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-2 text-sm text-slate-600">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                  Please confirm that you have read and understood this policy.
                </p>
                <ActionButton
                  action={acknowledgePolicy}
                  fields={{ id: policy.id }}
                  variant="primary"
                  size="md"
                  confirm="I have read and understood this policy and agree to comply with it."
                >
                  <CheckCircle2 className="h-4 w-4" /> I acknowledge
                </ActionButton>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Acknowledgement opens once this policy is published.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
