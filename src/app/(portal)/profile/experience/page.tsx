import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Briefcase, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, buttonClass, Card, EmptyState, PageHeader, WidgetCard } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { ActionButton } from "@/components/ui/action-button";
import { formatDate } from "@/lib/utils";
import { resolveTarget, loadEmployee, loadExperience } from "../_lib/load";
import { dateRange, profileHref } from "../_lib/shared";
import { deleteExperience } from "../actions";
import { ExperienceForm } from "../_components/entry-forms";
import { ExperienceTimeline } from "../_components/timeline";

export const metadata: Metadata = { title: "Experience" };

export default async function ExperiencePage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const { id } = await searchParams;
  const { targetId, isSelf } = await resolveTarget(id);
  const [emp, rows] = await Promise.all([loadEmployee(targetId), loadExperience(targetId)]);
  const name = emp.full_name ?? emp.first_name;
  const back = profileHref("/profile", targetId, isSelf);

  const addButton = (
    <Dialog
      title="Add Experience"
      size="lg"
      trigger={
        <Button>
          <Plus className="h-4 w-4" /> Add experience
        </Button>
      }
    >
      <ExperienceForm employeeId={targetId} />
    </Dialog>
  );

  return (
    <div>
      <PageHeader
        title="Professional Experience"
        description={isSelf ? "Your previous employers and roles." : `Work history of ${name}`}
        breadcrumbs={[{ label: "HRIS", href: "/hris" }, { label: isSelf ? "My Profile" : name, href: back }, { label: "Experience" }]}
        actions={
          <>
            <Link href={back} className={buttonClass("outline")}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            {addButton}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {rows.length === 0 ? (
            <EmptyState icon={Briefcase} title="No experience added yet" description="Add the companies you've worked for before." action={addButton} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dce5fa] text-[#3753b8]">
                    <Briefcase className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">{r.company}</p>
                      {!r.end_date && <Badge tone="blue">Current</Badge>}
                    </div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{r.designation}</p>
                    <p className="mt-0.5 text-xs text-slate-400" title={`${formatDate(r.start_date)} – ${r.end_date ? formatDate(r.end_date) : "Present"}`}>
                      {dateRange(r.start_date, r.end_date)}
                    </p>
                    {r.description && <p className="mt-1.5 whitespace-pre-line text-xs text-slate-600">{r.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Dialog
                      title="Edit Experience"
                      size="lg"
                      trigger={
                        <Button variant="outline" size="sm">
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                      }
                    >
                      <ExperienceForm employeeId={targetId} row={r} />
                    </Dialog>
                    <ActionButton
                      action={deleteExperience}
                      fields={{ id: r.id, employee_id: targetId }}
                      confirm={`Delete experience at ${r.company}?`}
                      variant="danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <WidgetCard title="Employment Details" color="bg-[#5b74d6]" bodyClassName="p-5">
          <ExperienceTimeline items={rows} />
        </WidgetCard>
      </div>
    </div>
  );
}
