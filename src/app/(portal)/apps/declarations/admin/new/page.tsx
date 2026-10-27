import { requireHR } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { FormBuilder } from "../../../_components/form-builder";

export const metadata = { title: "New Declaration Form" };

export default async function NewDeclarationFormPage() {
  await requireHR();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New declaration form"
        breadcrumbs={[
          { label: "More Apps", href: "/apps" },
          { label: "Declaration Forms", href: "/apps/declarations/admin" },
          { label: "New form" },
        ]}
      />
      <FormBuilder />
    </div>
  );
}
