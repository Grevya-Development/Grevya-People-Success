import Link from "next/link";
import { CalendarClock, Lightbulb, Target } from "lucide-react";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, WidgetCard, buttonClass } from "@/components/ui";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { GoalForm } from "../../_components/goal-form";
import { loadGoalFormData } from "../../_components/data";
import { PERF_THEME } from "../../_components/shared";

export const metadata = { title: "Create new Goal" };

export default async function NewGoalPage({ searchParams }: { searchParams: Promise<{ cycle?: string; parent?: string }> }) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const supabase = await createClient();
  const { cycles, parents, weights } = await loadGoalFormData(supabase, me, {
    ownerIds: [me.id],
    parentOwnerIds: me.manager_id ? [me.manager_id] : [],
  });
  const cycleId = cycles.find((c) => c.id === sp.cycle)?.id ?? cycles[0]?.id ?? null;
  const parentId = parents.find((p) => p.id === sp.parent)?.id ?? null;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Create new Goal"
        description="Define a measurable goal, align it to the bigger picture and send it to your manager."
        breadcrumbs={[{ label: "Performance", href: "/performance" }, { label: "Goal" }, { label: "Create new Goal" }]}
      />
      {me.status === "exited" ? (
        <Card>
          <EmptyState icon={Target} title="Goals are not available" description="Your profile is no longer active." />
        </Card>
      ) : cycles.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title="No review cycle is open for goal setting"
            description="HR opens a review cycle before goals can be created. You'll be notified when goal setting starts."
            action={
              <Link href="/performance" className={buttonClass("outline")}>
                Back to Performance Home
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <Card>
            <CardHeader title="Goal details" description="Fields marked * are required. Drafts stay private until you submit them." />
            <CardBody>
              <GoalForm
                mode="create"
                ownerId={me.id}
                ownerManagerId={me.manager_id}
                cycles={cycles}
                parents={parents}
                weights={weights}
                defaults={{ cycle_id: cycleId, parent_goal_id: parentId }}
              />
            </CardBody>
          </Card>
          <div className="space-y-5">
            <WidgetCard title="Writing a SMART goal" color={PERF_THEME.solid}>
              <ul className="space-y-2.5 text-sm text-slate-600">
                {[
                  ["Specific", "State clearly what will be achieved."],
                  ["Measurable", "Add a target or KPI to track progress."],
                  ["Achievable", "Stretch, but stay realistic."],
                  ["Relevant", "Align it to an objective or your manager's goal."],
                  ["Time-bound", "Set a due date within the cycle."],
                ].map(([k, v]) => (
                  <li key={k} className="flex gap-2">
                    <Lightbulb className={`mt-0.5 h-4 w-4 shrink-0 ${PERF_THEME.text}`} />
                    <span>
                      <span className="font-medium text-slate-800">{k}:</span> {v}
                    </span>
                  </li>
                ))}
              </ul>
            </WidgetCard>
            <Card>
              <CardBody className="text-sm text-slate-600">
                <p className="font-medium text-slate-800">Weightage</p>
                <p className="mt-1">The weightage of all your goals in a cycle should add up to exactly 100%.</p>
                <Link href="/performance/objective-tree" className={`mt-3 inline-block text-sm font-medium ${PERF_THEME.text} hover:underline`}>
                  View the objective tree →
                </Link>
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
