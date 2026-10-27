import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { WikiForm } from "../../_components/wiki-form";

export const metadata = { title: "Add New Article" };

export default async function NewWikiArticlePage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const { data } = await supabase.from("wiki_articles").select("category").eq("status", "published").limit(500);
  const categories = [...new Set((data ?? []).map((r) => r.category))];
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Add New Article"
        description={me.isHR ? "As HR you can publish directly, or save a draft for later." : "Save a draft any time. When it's ready, submit it — HR reviews articles before they're published."}
        breadcrumbs={[{ label: "Learning", href: "/learning" }, { label: "Knowledge Wiki", href: "/learning/wiki" }, { label: "Add New Article" }]}
      />
      <Card>
        <CardBody className="p-5 sm:p-6">
          <WikiForm isHR={me.isHR} categories={categories} />
        </CardBody>
      </Card>
    </div>
  );
}
