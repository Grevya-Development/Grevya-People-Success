import Link from "next/link";
import { notFound } from "next/navigation";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { CalendarClock, CheckCircle2, Lock, Settings2 } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { formatDate, formatDateTime, orgToday } from "@/lib/utils";
import { DeclarationAnswers, DeclarationInputs } from "../../_components/declaration-fields";
import { submitDeclaration } from "../actions";
import { parseFields, parseResponses } from "../_lib/fields";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DeclarationFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const me = await requireEmployee();
  const supabase = await createClient();
  const [{ data: form }, { data: response }] = await Promise.all([
    supabase.from("declaration_forms").select("*").eq("id", id).maybeSingle(),
    supabase.from("declaration_responses").select("responses, submitted_at").eq("form_id", id).eq("employee_id", me.id).maybeSingle(),
  ]);
  if (!form) notFound();
  // Inactive forms are only visible to people who already responded (and HR).
  if (!form.active && !response && !me.isHR) notFound();

  const fields = parseFields(form.fields);
  const values = parseResponses(response?.responses);
  const today = orgToday();
  const pastDue = !!form.due_date && today > form.due_date;
  const editable = form.active && !pastDue;
  const daysLeft = form.due_date ? differenceInCalendarDays(parseISO(form.due_date), parseISO(today)) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={form.title}
        description={form.description}
        breadcrumbs={[{ label: "More Apps", href: "/apps" }, { label: "Declaration App", href: "/apps/declarations" }, { label: form.title }]}
        actions={
          me.isHR && (
            <Link href={`/apps/declarations/admin/${form.id}`} className={buttonClass("outline")}>
              <Settings2 className="h-4 w-4" /> Edit form & responses
            </Link>
          )
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <InfoPill icon={CalendarClock} tone={pastDue ? "bg-red-50 text-red-700" : daysLeft !== null && daysLeft <= 3 ? "bg-orange-50 text-orange-700" : "bg-slate-100 text-slate-700"}>
          {form.due_date
            ? pastDue
              ? `Closed on ${formatDate(form.due_date)}`
              : daysLeft === 0
                ? "Due today"
                : `Due ${formatDate(form.due_date)} (${daysLeft} days left)`
            : "No due date"}
        </InfoPill>
        {response ? (
          <InfoPill icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700">
            Submitted {formatDateTime(response.submitted_at)}
          </InfoPill>
        ) : null}
        {!editable && (
          <InfoPill icon={Lock} tone="bg-slate-100 text-slate-600">
            {form.active ? "Read-only after the due date" : "This form is no longer active"}
          </InfoPill>
        )}
      </div>

      <Card>
        <CardHeader
          title={editable ? (response ? "Update your declaration" : "Your declaration") : "Your submission"}
          description={editable ? "Fields marked * are required. You can update your answers until the due date." : undefined}
        />
        <CardBody>
          {fields.length === 0 ? (
            <EmptyState title="This form has no questions yet" description="HR is still setting it up. Please check back later." />
          ) : editable ? (
            <ActionForm action={submitDeclaration} resetOnSuccess={false} className="space-y-6">
              <input type="hidden" name="form_id" value={form.id} />
              <DeclarationInputs fields={fields} values={values} />
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <SubmitButton>{response ? "Update submission" : "Submit declaration"}</SubmitButton>
              </div>
            </ActionForm>
          ) : response ? (
            <DeclarationAnswers fields={fields} values={values} />
          ) : (
            <EmptyState icon={Lock} title="You didn't submit this declaration" description="The form is closed. Raise an HR Helpdesk ticket if you still need to declare something." />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function InfoPill({ icon: Icon, tone, children }: { icon: typeof Lock; tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${tone}`}>
      <Icon className="h-4 w-4 shrink-0" />
      {children}
    </span>
  );
}
