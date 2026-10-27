import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, Check, CheckCircle2, Circle, FilePlus2, FileText, Pencil, Send, Wallet, X, XCircle } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedDocumentUrl } from "@/lib/storage";
import { ActionButton } from "@/components/ui/action-button";
import { Avatar, Badge, Card, CardBody, CardHeader, PageHeader, StatusBadge, buttonClass } from "@/components/ui";
import { cn, formatCurrency, formatDate, formatDateTime, orgToday } from "@/lib/utils";
import { approveClaim, cancelClaim, rejectClaim, submitClaim } from "../../actions";
import { ClaimForm } from "../../_components/claim-form";
import { REIMB_THEME, STATUS_LABEL, claimNumber, isUuid, receiptName } from "../../_lib/claims";

export const metadata = { title: "Claim Details" };

type Step = { key: string; label: string; at?: string | null; by?: string | null; note?: string | null; state: "done" | "current" | "todo" | "bad" };

export default async function ClaimDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const me = await requireEmployee();
  const { id } = await params;
  const { edit } = await searchParams;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  // RLS: owner, their management chain and HR can read the claim.
  const { data: claim } = await supabase
    .from("claims")
    .select(
      "*, category:claim_categories(id, name, kind, max_amount, requires_receipt, active), employee:employees!claims_employee_id_fkey(full_name, employee_code, avatar_url), approver:employees!claims_approver_id_fkey(full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!claim) notFound();

  const isOwner = claim.employee_id === me.id;
  const receiptUrl = await signedDocumentUrl(claim.receipt_path);
  const cat = claim.category;
  const canEdit = isOwner && claim.status === "draft" && cat?.kind === "expense";
  const editing = canEdit && edit === "1";
  const canApprove = !isOwner && me.isManager && claim.status === "submitted";
  const number = claimNumber(claim.seq);

  const crumbs = isOwner
    ? [{ label: "Reimbursement", href: "/reimbursement/claims" }, { label: "My Claims", href: "/reimbursement/claims" }, { label: number }]
    : [{ label: "Reimbursement", href: "/reimbursement/claims" }, { label: "Claim Approvals", href: "/reimbursement/approvals" }, { label: number }];

  if (editing) {
    const { data: cats } = await supabase.from("claim_categories").select("id, name, max_amount, requires_receipt").eq("kind", "expense").eq("active", true).order("name");
    const options = cats ?? [];
    if (cat && !options.some((c) => c.id === cat.id)) {
      options.push({ id: cat.id, name: `${cat.name} (inactive)`, max_amount: cat.max_amount, requires_receipt: cat.requires_receipt });
    }
    return (
      <>
        <PageHeader title={`Edit ${number}`} description="Update your draft, then save it or submit it for approval." breadcrumbs={[...crumbs.slice(0, 2), { label: number, href: `/reimbursement/claims/${id}` }, { label: "Edit" }]} />
        <Card className="max-w-3xl">
          <CardHeader title="Claim details" />
          <CardBody>
            <ClaimForm
              categories={options}
              today={orgToday()}
              cancelHref={`/reimbursement/claims/${id}`}
              defaults={{
                id: claim.id,
                category_id: claim.category_id,
                title: claim.title,
                expense_date: claim.expense_date,
                amount: Number(claim.amount),
                description: claim.description,
                receipt_name: receiptName(claim.receipt_path),
                receipt_url: receiptUrl,
              }}
            />
          </CardBody>
        </Card>
      </>
    );
  }

  const steps = buildTimeline(claim.status, claim.created_at, claim.actioned_at, claim.approver?.full_name ?? null, claim.approver_remarks, claim.paid_at);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {number}
            <StatusBadge status={claim.status} label={STATUS_LABEL[claim.status]} />
          </span>
        }
        description={claim.title}
        breadcrumbs={crumbs}
        actions={
          <>
            {canEdit && (
              <Link href={`/reimbursement/claims/${id}?edit=1`} className={buttonClass("outline", "sm")}>
                <Pencil className="h-3.5 w-3.5" />
                Edit draft
              </Link>
            )}
            {isOwner && claim.status === "draft" && (
              <ActionButton action={submitClaim} fields={{ id }} confirm="Submit this claim for approval?" variant="primary">
                <Send className="h-3.5 w-3.5" />
                Submit
              </ActionButton>
            )}
            {isOwner && (claim.status === "draft" || claim.status === "submitted") && (
              <ActionButton action={cancelClaim} fields={{ id }} confirm="Cancel this claim? This can't be undone." variant="danger">
                <Ban className="h-3.5 w-3.5" />
                Cancel claim
              </ActionButton>
            )}
            {canApprove && (
              <>
                <ActionButton action={approveClaim} fields={{ id }} prompt="Remarks (optional)" variant="success">
                  <Check className="h-3.5 w-3.5" />
                  Approve
                </ActionButton>
                <ActionButton action={rejectClaim} fields={{ id }} prompt="Reason for rejection" promptRequired variant="danger">
                  <X className="h-3.5 w-3.5" />
                  Reject
                </ActionButton>
              </>
            )}
          </>
        }
      />

      {isOwner && claim.status === "draft" && cat?.requires_receipt && !claim.receipt_path && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This draft needs a receipt before it can be submitted — use <strong>Edit draft</strong> to attach one.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <div className={cn("flex flex-wrap items-center justify-between gap-3 px-5 py-4", REIMB_THEME.pill)}>
            <div>
              <p className={cn("text-xs font-medium uppercase tracking-wide", REIMB_THEME.text)}>Claim amount</p>
              <p className="mt-0.5 text-2xl font-semibold text-slate-900">{formatCurrency(claim.amount, 2)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-700">{cat?.name ?? "—"}</span>
              {cat?.kind === "ctc" && <Badge tone="green">CTC</Badge>}
            </div>
          </div>
          <CardBody>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <Item label="Title">{claim.title}</Item>
              <Item label="Expense date">{formatDate(claim.expense_date)}</Item>
              <Item label="Raised on">{formatDateTime(claim.created_at)}</Item>
              <Item label="Category limit">{cat?.max_amount != null ? formatCurrency(cat.max_amount) : "No limit"}</Item>
              {!isOwner && claim.employee && (
                <Item label="Employee">
                  <span className="flex items-center gap-2">
                    <Avatar name={claim.employee.full_name} src={claim.employee.avatar_url} size="xs" />
                    {claim.employee.full_name} <span className="text-slate-400">({claim.employee.employee_code})</span>
                  </span>
                </Item>
              )}
              <Item label="Description" className="sm:col-span-2">
                {claim.description ? <span className="whitespace-pre-line">{claim.description}</span> : <span className="text-slate-400">No description</span>}
              </Item>
              <Item label="Receipt" className="sm:col-span-2">
                {receiptUrl ? (
                  <a href={receiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-primary-700 hover:bg-slate-50">
                    <FileText className="h-4 w-4" />
                    {receiptName(claim.receipt_path)}
                  </a>
                ) : (
                  <span className="text-slate-400">{cat?.requires_receipt ? "Not attached (required)" : "Not attached"}</span>
                )}
              </Item>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Status timeline" />
          <CardBody>
            <ol className="relative space-y-5">
              {steps.map((s, i) => (
                <li key={s.key} className="relative flex gap-3">
                  {i < steps.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%+4px)] w-px bg-slate-200" aria-hidden />}
                  <StepIcon state={s.state} k={s.key} />
                  <div className="min-w-0 pb-1">
                    <p className={cn("text-sm font-medium", s.state === "todo" ? "text-slate-400" : s.state === "bad" ? "text-red-700" : "text-slate-800")}>{s.label}</p>
                    {s.at && <p className="text-xs text-slate-500">{formatDateTime(s.at)}</p>}
                    {s.by && <p className="text-xs text-slate-500">by {s.by}</p>}
                    {s.note && <p className="mt-1 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">&ldquo;{s.note}&rdquo;</p>}
                  </div>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Item({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{children}</dd>
    </div>
  );
}

function StepIcon({ state, k }: { state: Step["state"]; k: string }) {
  const base = "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full";
  if (state === "bad") return <span className={cn(base, "bg-red-100 text-red-600")}>{k === "cancelled" ? <Ban className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}</span>;
  if (state === "todo") return <span className={cn(base, "bg-slate-100 text-slate-300")}><Circle className="h-3 w-3" /></span>;
  if (state === "current") return <span className={cn(base, "bg-amber-100 text-amber-600")}><Circle className="h-3 w-3 fill-current" /></span>;
  const Icon = k === "created" ? FilePlus2 : k === "paid" ? Wallet : CheckCircle2;
  return <span className={cn(base, "bg-emerald-100 text-emerald-600")}><Icon className="h-3.5 w-3.5" /></span>;
}

function buildTimeline(status: string, createdAt: string, actionedAt: string | null, approver: string | null, remarks: string | null, paidAt: string | null): Step[] {
  const steps: Step[] = [{ key: "created", label: "Claim created", at: createdAt, state: "done" }];
  if (status === "draft") {
    steps.push({ key: "submitted", label: "Saved as draft — not yet submitted", state: "current" });
    steps.push({ key: "approval", label: "Manager approval", state: "todo" }, { key: "paid", label: "Payment", state: "todo" });
    return steps;
  }
  if (status === "cancelled") {
    steps.push({ key: "cancelled", label: "Cancelled", state: "bad" });
    return steps;
  }
  steps.push({ key: "submitted", label: "Submitted for approval", state: "done" });
  if (status === "submitted") {
    steps.push({ key: "approval", label: "Awaiting manager approval", state: "current" }, { key: "paid", label: "Payment", state: "todo" });
    return steps;
  }
  if (status === "rejected") {
    steps.push({ key: "rejected", label: "Rejected", at: actionedAt, by: approver, note: remarks, state: "bad" });
    return steps;
  }
  steps.push({ key: "approved", label: "Approved", at: actionedAt, by: approver, note: remarks, state: "done" });
  steps.push(status === "paid" ? { key: "paid", label: "Paid", at: paidAt, state: "done" } : { key: "paid", label: "Awaiting payment by HR", state: "current" });
  return steps;
}
