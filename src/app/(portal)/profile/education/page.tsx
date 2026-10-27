import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, GraduationCap, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, buttonClass, Card, EmptyState, PageHeader, WidgetCard } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { ActionButton } from "@/components/ui/action-button";
import { resolveTarget, loadEmployee, loadEducation } from "../_lib/load";
import { dateRange, profileHref } from "../_lib/shared";
import { deleteEducation } from "../actions";
import { EducationForm } from "../_components/entry-forms";
import { EducationTimeline } from "../_components/timeline";

export const metadata: Metadata = { title: "Education" };

export default async function EducationPage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const { id } = await searchParams;
  const { targetId, isSelf } = await resolveTarget(id);
  const [emp, rows] = await Promise.all([loadEmployee(targetId), loadEducation(targetId)]);
  const name = emp.full_name ?? emp.first_name;
  const back = profileHref("/profile", targetId, isSelf);

  const addButton = (
    <Dialog
      title="Add Education"
      size="lg"
      trigger={
        <Button>
          <Plus className="h-4 w-4" /> Add education
        </Button>
      }
    >
      <EducationForm employeeId={targetId} />
    </Dialog>
  );

  return (
    <div>
      <PageHeader
        title="Educational Background"
        description={isSelf ? "Your degrees, diplomas and certifications." : `Education history of ${name}`}
        breadcrumbs={[{ label: "HRIS", href: "/hris" }, { label: isSelf ? "My Profile" : name, href: back }, { label: "Education" }]}
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
            <EmptyState icon={GraduationCap} title="No education added yet" description="Add degrees, diplomas and certifications." action={addButton} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dce5fa] text-[#3753b8]">
                    <GraduationCap className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{r.degree}</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{r.institution}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {dateRange(r.start_date, r.end_date)}
                      {r.grade ? ` · ${r.grade}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Dialog
                      title="Edit Education"
                      size="lg"
                      trigger={
                        <Button variant="outline" size="sm">
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                      }
                    >
                      <EducationForm employeeId={targetId} row={r} />
                    </Dialog>
                    <ActionButton action={deleteEducation} fields={{ id: r.id, employee_id: targetId }} confirm={`Delete "${r.degree}"?`} variant="danger">
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <WidgetCard title="Education Summary" color="bg-[#5b74d6]" bodyClassName="p-5">
          <EducationTimeline items={rows} />
        </WidgetCard>
      </div>
    </div>
  );
}
