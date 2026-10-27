import { Network } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { OrgChart, type OrgPerson } from "./_components/org-chart";

export const metadata = { title: "Organization Chart" };

const PAGE = 1000;

export default async function OrgChartPage() {
  const me = await requireEmployee();
  const supabase = await createClient();

  // PostgREST caps rows per request, so page through the whole org.
  const people: OrgPerson[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await supabase
      .from("employees")
      .select("id, full_name, employee_code, avatar_url, manager_id, designation:designations(title), department:departments(name)")
      .neq("status", "exited")
      .order("full_name")
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const e of data) {
      people.push({
        id: e.id,
        name: e.full_name ?? "",
        code: e.employee_code,
        avatar: e.avatar_url,
        managerId: e.manager_id,
        designation: (e.designation as { title: string } | null)?.title ?? null,
        department: (e.department as { name: string } | null)?.name ?? null,
      });
    }
    if (data.length < PAGE) break;
  }

  return (
    <div>
      <PageHeader
        title="Organization Chart"
        description="Explore reporting lines across Grevya. Click a card's report count to expand or collapse a team."
        breadcrumbs={[{ label: "HRIS", href: "/hris" }, { label: "Organization Chart" }]}
      />
      {people.length === 0 ? (
        <Card>
          <EmptyState icon={Network} title="No employees yet" description="The organisation chart appears once employees are added." />
        </Card>
      ) : (
        <OrgChart people={people} meId={me.id} />
      )}
    </div>
  );
}
