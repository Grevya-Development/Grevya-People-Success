import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { displayValue, type DeclField, type Responses } from "../declarations/_lib/fields";

/** Editable inputs for a declaration form (names are `f_<key>`). */
export function DeclarationInputs({ fields, values }: { fields: DeclField[]; values: Responses }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
      {fields.map((f) => {
        const name = `f_${f.key}`;
        const v = values[f.key];
        const text = v === null || v === undefined || typeof v === "boolean" ? "" : String(v);
        const wide = f.type === "textarea" || f.type === "checkbox";
        if (f.type === "checkbox") {
          return (
            <div key={f.key} className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
              <Checkbox
                name={name}
                defaultChecked={v === true}
                required={f.required}
                label={
                  <span>
                    {f.label}
                    {f.required && <span className="ml-0.5 text-red-500">*</span>}
                  </span>
                }
              />
            </div>
          );
        }
        return (
          <Field key={f.key} label={f.label} htmlFor={name} required={f.required} className={wide ? "sm:col-span-2" : undefined}>
            {f.type === "textarea" ? (
              <Textarea id={name} name={name} defaultValue={text} required={f.required} rows={4} maxLength={5000} />
            ) : f.type === "select" ? (
              <Select id={name} name={name} defaultValue={text} required={f.required}>
                <option value="">Select…</option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id={name}
                name={name}
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                step={f.type === "number" ? "any" : undefined}
                maxLength={f.type === "text" ? 500 : undefined}
                defaultValue={text}
                required={f.required}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}

/** Read-only view of a submitted declaration. */
export function DeclarationAnswers({ fields, values }: { fields: DeclField[]; values: Responses }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {fields.map((f) => {
        const shown = displayValue(f, values[f.key]);
        return (
          <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
            <dt className="text-xs font-medium text-slate-500">{f.label}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{shown || <span className="text-slate-400">—</span>}</dd>
          </div>
        );
      })}
    </dl>
  );
}
