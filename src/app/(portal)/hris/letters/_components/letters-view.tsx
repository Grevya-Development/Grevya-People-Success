import Link from "next/link";
import { FileText, FileSignature, Mail, IndianRupee, Settings2, ChevronRight } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  StatusBadge,
  EmptyState,
  PageHeader,
  Field,
  Select,
  Textarea,
  buttonClass,
} from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ActionButton } from "@/components/ui/action-button";
import { LETTER_LABELS, REQUESTABLE, letterTypeLabel, type LetterCategory } from "../../_lib/letter-templates";
import { requestLetter, cancelLetterRequest } from "../actions";

const COPY: Record<LetterCategory, { title: string; description: string; empty: string; icon: typeof FileText }> = {
  general: {
    title: "My Letters",
    description: "Letters issued to you by HR — offer, appointment, confirmation, experience and more.",
    empty: "Letters HR issues to you (appointment, confirmation, verification…) will appear here.",
    icon: FileText,
  },
  salary: {
    title: "My Salary Letters",
    description: "Salary certificates, increment and bonus letters issued to you.",
    empty: "Salary certificates, increment and bonus letters will appear here once issued.",
    icon: IndianRupee,
  },
};

export async function LettersView({ category }: { category: LetterCategory }) {
  const me = await requireEmployee();
  const supabase = await createClient();
  const requestable = REQUESTABLE[category];
  const copy = COPY[category];

  const [{ data: letters }, { data: requests }] = await Promise.all([
    supabase
      .from("letters")
      .select("id, title, letter_type, issued_on, created_at")
      .eq("employee_id", me.id)
      .eq("category", category)
      .order("issued_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("letter_requests")
      .select("id, letter_type, purpose, status, approver_remarks, actioned_at, created_at, letter_id")
      .eq("employee_id", me.id)
      .in("letter_type", requestable)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const Icon = copy.icon;
  const pending = (requests ?? []).filter((r) => r.status === "pending").length;

  return (
    <div>
      <PageHeader
        title={copy.title}
        description={copy.description}
        breadcrumbs={[{ label: "HRIS", href: "/hris" }, { label: copy.title }]}
        actions={
          me.isHR && (
            <Link href="/hris/admin/letters" className={buttonClass("outline", "sm")}>
              <Settings2 className="h-3.5 w-3.5" /> Manage letters
            </Link>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Issued letters" description={`${letters?.length ?? 0} letter${letters?.length === 1 ? "" : "s"}`} />
          {letters && letters.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {letters.map((l) => (
                <li key={l.id}>
                  <Link href={`/hris/letters/${l.id}`} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#dce5fa] text-[#3753b8]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800 group-hover:text-primary-700">{l.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">Issued on {formatDate(l.issued_on)}</p>
                    </div>
                    <Badge tone="blue" className="hidden sm:inline-flex">
                      {letterTypeLabel(l.letter_type)}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Icon} title="No letters yet" description={copy.empty} />
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Request a letter" description="HR will review and issue the letter here." />
            <CardBody>
              <ActionForm action={requestLetter} successMessage="Request submitted" className="space-y-4">
                <Field label="Letter type" htmlFor="letter_type" required>
                  <Select id="letter_type" name="letter_type" required defaultValue={requestable.length === 1 ? requestable[0] : ""}>
                    {requestable.length > 1 && (
                      <option value="" disabled>
                        Select…
                      </option>
                    )}
                    {requestable.map((t) => (
                      <option key={t} value={t}>
                        {LETTER_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Purpose" htmlFor="purpose" required hint="e.g. Visa application, bank loan, rental agreement">
                  <Textarea id="purpose" name="purpose" rows={3} maxLength={500} required placeholder="What do you need this letter for?" />
                </Field>
                <SubmitButton className="w-full">
                  <Mail className="h-4 w-4" /> Submit request
                </SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="My requests" description={pending ? `${pending} pending` : undefined} />
            {requests && requests.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {requests.map((r) => (
                  <li key={r.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{letterTypeLabel(r.letter_type)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">Requested {formatDateTime(r.created_at)}</p>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    {r.purpose && <p className="mt-1.5 line-clamp-2 text-xs text-slate-600">Purpose: {r.purpose}</p>}
                    {r.approver_remarks && (
                      <p className="mt-1.5 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                        <span className="font-medium">HR remarks:</span> {r.approver_remarks}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.status === "pending" && (
                        <ActionButton action={cancelLetterRequest} fields={{ id: r.id }} confirm="Cancel this letter request?" variant="outline">
                          Cancel request
                        </ActionButton>
                      )}
                      {r.letter_id && (
                        <Link href={`/hris/letters/${r.letter_id}`} className={buttonClass("secondary", "sm")}>
                          <FileSignature className="h-3.5 w-3.5" /> View letter
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No requests" description="Requests you raise will be tracked here." className="py-8" />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
