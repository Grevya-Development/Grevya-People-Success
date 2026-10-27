"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { bool, orgToday, str } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { FIELD_TYPES, MAX_FIELDS, parseFields, slugify, uniqueKey, type DeclField, type Responses } from "./_lib/fields";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(s: string) {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function revalidateForms(id?: string) {
  revalidatePath("/apps/declarations");
  revalidatePath("/apps/declarations/admin");
  revalidatePath("/apps");
  if (id) {
    revalidatePath(`/apps/declarations/${id}`);
    revalidatePath(`/apps/declarations/admin/${id}`);
  }
}

// ---------------------------------------------------------------------------
// Employee: submit / update a response
// ---------------------------------------------------------------------------
export async function submitDeclaration(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const formId = str(fd, "form_id");
  if (!formId || !UUID.test(formId)) return fail("Form not found");

  const supabase = await createClient();
  const { data: form } = await supabase.from("declaration_forms").select("id, title, fields, due_date, active").eq("id", formId).maybeSingle();
  if (!form) return fail("Form not found");
  if (!form.active) return fail("This form is no longer accepting responses");
  if (form.due_date && orgToday() > form.due_date) return fail("The due date for this declaration has passed");

  const fields = parseFields(form.fields);
  const responses: Responses = {};
  for (const f of fields) {
    const name = `f_${f.key}`;
    if (f.type === "checkbox") {
      const checked = bool(fd, name);
      if (f.required && !checked) return fail(`Please confirm “${f.label}”`);
      responses[f.key] = checked;
      continue;
    }
    const v = str(fd, name);
    if (v === null) {
      if (f.required) return fail(`“${f.label}” is required`);
      responses[f.key] = null;
      continue;
    }
    switch (f.type) {
      case "text":
        if (v.length > 500) return fail(`“${f.label}” must be 500 characters or fewer`);
        responses[f.key] = v;
        break;
      case "textarea":
        if (v.length > 5000) return fail(`“${f.label}” must be 5000 characters or fewer`);
        responses[f.key] = v;
        break;
      case "number": {
        const n = Number(v);
        if (!Number.isFinite(n)) return fail(`“${f.label}” must be a number`);
        responses[f.key] = n;
        break;
      }
      case "date":
        if (!validDate(v)) return fail(`“${f.label}” must be a valid date`);
        responses[f.key] = v;
        break;
      case "select":
        if (!(f.options ?? []).includes(v)) return fail(`Choose a valid option for “${f.label}”`);
        responses[f.key] = v;
        break;
    }
  }

  const { error } = await supabase
    .from("declaration_responses")
    .upsert(
      { form_id: form.id, employee_id: me.id, responses: responses as NonNullable<Json>, submitted_at: new Date().toISOString() },
      { onConflict: "form_id,employee_id" },
    );
  if (error) return fail(dbError(error));
  revalidateForms(form.id);
  return ok(`“${form.title}” submitted`);
}

// ---------------------------------------------------------------------------
// HR: form builder
// ---------------------------------------------------------------------------
function cleanFields(raw: string | null): DeclField[] | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "[]");
  } catch {
    return "Could not read the form fields";
  }
  if (!Array.isArray(parsed)) return "Could not read the form fields";
  if (parsed.length === 0) return "Add at least one field";
  if (parsed.length > MAX_FIELDS) return `A form can have at most ${MAX_FIELDS} fields`;

  const taken = new Set<string>();
  const out: DeclField[] = [];
  for (const [i, item] of parsed.entries()) {
    if (!item || typeof item !== "object") return `Field ${i + 1} is invalid`;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!label) return `Field ${i + 1} needs a label`;
    if (label.length > 200) return `Field ${i + 1}: label is too long`;
    const type = o.type;
    if (typeof type !== "string" || !(FIELD_TYPES as readonly string[]).includes(type)) return `Field “${label}” has an invalid type`;
    const rawKey = typeof o.key === "string" && /^[a-z0-9_]{1,60}$/.test(o.key) ? o.key : slugify(label);
    const key = uniqueKey(rawKey, taken);
    const field: DeclField = { key, label, type: type as DeclField["type"], required: o.required === true };
    if (type === "select") {
      const opts = Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : [];
      const unique = [...new Set(opts)];
      if (unique.length < 2) return `Dropdown “${label}” needs at least two options`;
      if (unique.length > 50) return `Dropdown “${label}” has too many options`;
      field.options = unique;
    }
    out.push(field);
  }
  return out;
}

export async function saveDeclarationForm(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can manage declaration forms");

  const id = str(fd, "id");
  if (id && !UUID.test(id)) return fail("Form not found");
  const title = str(fd, "title");
  if (!title) return fail("Title is required");
  if (title.length > 150) return fail("Title must be 150 characters or fewer");
  const description = str(fd, "description");
  if (description && description.length > 2000) return fail("Description is too long");
  const dueDate = str(fd, "due_date");
  if (dueDate && !validDate(dueDate)) return fail("Enter a valid due date");
  const active = bool(fd, "active");
  const fields = cleanFields(str(fd, "fields"));
  if (typeof fields === "string") return fail(fields);

  const supabase = await createClient();
  const row = { title, description, due_date: dueDate, active, fields: fields as unknown as NonNullable<Json> };
  if (id) {
    const { data, error } = await supabase.from("declaration_forms").update(row).eq("id", id).select("id").maybeSingle();
    if (error) return fail(dbError(error));
    if (!data) return fail("Form not found");
    revalidateForms(id);
    return ok("Form saved");
  }
  const { data, error } = await supabase.from("declaration_forms").insert({ ...row, created_by: me.id }).select("id").single();
  if (error || !data) return fail(dbError(error));
  revalidateForms(data.id);
  return ok("Form created", `/apps/declarations/admin/${data.id}`);
}

export async function setDeclarationFormActive(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can manage declaration forms");
  const id = str(fd, "id");
  if (!id || !UUID.test(id)) return fail("Form not found");
  const active = bool(fd, "active");
  const supabase = await createClient();
  const { data, error } = await supabase.from("declaration_forms").update({ active }).eq("id", id).select("id").maybeSingle();
  if (error) return fail(dbError(error));
  if (!data) return fail("Form not found");
  revalidateForms(id);
  return ok(active ? "Form activated" : "Form deactivated");
}

export async function deleteDeclarationForm(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can manage declaration forms");
  const id = str(fd, "id");
  if (!id || !UUID.test(id)) return fail("Form not found");
  const supabase = await createClient();
  const { error } = await supabase.from("declaration_forms").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidateForms();
  return ok("Form deleted", "/apps/declarations/admin");
}
