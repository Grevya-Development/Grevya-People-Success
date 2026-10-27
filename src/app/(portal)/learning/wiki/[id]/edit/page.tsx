import { notFound } from "next/navigation";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, PageHeader, StatusBadge } from "@/components/ui";
import { WikiForm } from "../../../_components/wiki-form";

export const metadata = { title: "Edit Article" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditWikiArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireEmployee();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const { data: a } = await supabase.from("wiki_articles").select("id, title, category, tags, content, status, review_remarks, author_id").eq("id", id).maybeSingle();
  if (!a || a.author_id !== me.id) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Edit Article"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            Current status: <StatusBadge status={a.status} />
            {a.status === "rejected" && a.review_remarks && <span className="text-red-700">HR remarks: {a.review_remarks}</span>}
          </span>
        }
        breadcrumbs={[{ label: "Learning", href: "/learning" }, { label: "My Articles", href: "/learning/wiki/mine" }, { label: "Edit" }]}
      />
      <Card>
        <CardBody className="p-5 sm:p-6">
          <WikiForm article={a} isHR={me.isHR} />
        </CardBody>
      </Card>
    </div>
  );
}
