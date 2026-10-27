/** Declaration form field definitions (declaration_forms.fields jsonb). Shared by server & client. */

export const FIELD_TYPES = ["text", "textarea", "number", "date", "select", "checkbox"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  checkbox: "Checkbox (Yes/No)",
};

export type DeclField = {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
};

export type ResponseValue = string | number | boolean | null;
export type Responses = Record<string, ResponseValue>;

export const MAX_FIELDS = 50;

export function slugify(label: string) {
  const s = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return s || "field";
}

/** Make `base` unique against `taken`, appending _2, _3… */
export function uniqueKey(base: string, taken: Set<string>) {
  let key = base;
  let i = 2;
  while (taken.has(key)) key = `${base}_${i++}`;
  taken.add(key);
  return key;
}

const isType = (t: unknown): t is FieldType => typeof t === "string" && (FIELD_TYPES as readonly string[]).includes(t);

/** Leniently read fields stored in the DB (skips malformed entries). */
export function parseFields(raw: unknown): DeclField[] {
  if (!Array.isArray(raw)) return [];
  const out: DeclField[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const o = f as Record<string, unknown>;
    if (typeof o.key !== "string" || typeof o.label !== "string" || !isType(o.type)) continue;
    out.push({
      key: o.key,
      label: o.label,
      type: o.type,
      options: Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === "string") : undefined,
      required: o.required === true,
    });
  }
  return out;
}

export function parseResponses(raw: unknown): Responses {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Responses;
}

/** Display a stored answer as text. */
export function displayValue(field: DeclField, v: ResponseValue | undefined): string {
  if (v === null || v === undefined || v === "") return field.type === "checkbox" ? "No" : "";
  if (field.type === "checkbox") return v === true || v === "true" ? "Yes" : "No";
  return String(v);
}
