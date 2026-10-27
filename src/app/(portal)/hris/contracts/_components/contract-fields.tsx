import { Field, FormGrid, Input, Select, Textarea, Checkbox } from "@/components/ui";
import type { Tables } from "@/lib/database.types";
import { CONTRACT_TYPES, CONTRACT_TYPE_LABELS } from "../_lib";

type Contract = Pick<Tables<"contracts">, "id" | "title" | "contract_type" | "start_date" | "end_date" | "status" | "terms" | "document_url">;

/**
 * Shared inputs for create / edit / renew. Rendered inside an <ActionForm>.
 *  - create: employee picker + draft/active status
 *  - edit: full status list, replace/remove document
 *  - renew: new period, option to carry the existing document over
 */
export function ContractFields({
  mode,
  contract,
  employees,
  defaults,
}: {
  mode: "create" | "edit" | "renew";
  contract?: Contract;
  employees?: { id: string; full_name: string | null; employee_code: string }[];
  defaults?: { start_date?: string; end_date?: string };
}) {
  const idp = `${mode}-${contract?.id ?? "new"}`;
  return (
    <div className="space-y-4">
      {contract && <input type="hidden" name="id" value={contract.id} />}
      <FormGrid>
        {mode === "create" && (
          <Field label="Employee" htmlFor={`${idp}-emp`} required className="sm:col-span-2">
            <Select id={`${idp}-emp`} name="employee_id" required defaultValue="">
              <option value="" disabled>
                Select employee…
              </option>
              {(employees ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} ({e.employee_code})
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Title" htmlFor={`${idp}-title`} required className="sm:col-span-2">
          <Input
            id={`${idp}-title`}
            name="title"
            required
            maxLength={200}
            defaultValue={contract?.title ?? ""}
            placeholder="e.g. Employment Agreement 2026"
          />
        </Field>
        <Field label="Contract type" htmlFor={`${idp}-type`} required>
          <Select id={`${idp}-type`} name="contract_type" required defaultValue={contract?.contract_type ?? "employment"}>
            {CONTRACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONTRACT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        {mode !== "renew" ? (
          <Field label="Status" htmlFor={`${idp}-status`} required>
            <Select id={`${idp}-status`} name="status" defaultValue={contract?.status ?? "active"}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              {mode === "edit" && (
                <>
                  <option value="expired">Expired</option>
                  <option value="terminated">Terminated</option>
                  {contract?.status === "renewed" && <option value="renewed">Renewed</option>}
                </>
              )}
            </Select>
          </Field>
        ) : (
          <div className="hidden sm:block" />
        )}
        <Field label="Start date" htmlFor={`${idp}-start`} required>
          <Input id={`${idp}-start`} name="start_date" type="date" required defaultValue={defaults?.start_date ?? contract?.start_date ?? ""} />
        </Field>
        <Field label="End date" htmlFor={`${idp}-end`} hint="Leave blank for open-ended">
          <Input id={`${idp}-end`} name="end_date" type="date" defaultValue={defaults?.end_date ?? (mode === "renew" ? "" : (contract?.end_date ?? ""))} />
        </Field>
      </FormGrid>
      <Field label="Terms & notes" htmlFor={`${idp}-terms`}>
        <Textarea id={`${idp}-terms`} name="terms" rows={5} maxLength={20000} defaultValue={contract?.terms ?? ""} placeholder="Key terms, notice period, renewal clauses…" />
      </Field>
      <Field label={mode === "edit" && contract?.document_url ? "Replace document" : "Signed document"} htmlFor={`${idp}-doc`} hint="PDF or image, up to 10 MB">
        <Input id={`${idp}-doc`} name="document" type="file" accept=".pdf,.doc,.docx,image/*" className="py-1.5 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs" />
      </Field>
      {mode === "edit" && contract?.document_url && <Checkbox name="remove_document" label="Remove the current document" />}
      {mode === "renew" && contract?.document_url && <Checkbox name="keep_document" defaultChecked label="Carry over the existing document if no new one is uploaded" />}
    </div>
  );
}
