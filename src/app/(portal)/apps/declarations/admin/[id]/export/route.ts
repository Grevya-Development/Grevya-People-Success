import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { displayValue, parseFields, parseResponses } from "../../../_lib/fields";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 4180 cell, with a guard against spreadsheet formula injection. */
function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentEmployee();
  if (!me) return new Response("Not signed in", { status: 401 });
  if (!me.isHR) return new Response("Forbidden", { status: 403 });

  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: form } = await supabase.from("declaration_forms").select("id, title, fields").eq("id", id).maybeSingle();
  if (!form) return new Response("Not found", { status: 404 });

  const { data: rows, error } = await supabase
    .from("declaration_responses")
    .select("responses, submitted_at, employee:employees!declaration_responses_employee_id_fkey(full_name, employee_code, email, department:departments(name))")
    .eq("form_id", id)
    .order("submitted_at", { ascending: true });
  if (error) return new Response("Could not load responses", { status: 500 });

  const fields = parseFields(form.fields);
  const header = ["Employee Code", "Employee Name", "Email", "Department", "Submitted At (UTC)", ...fields.map((f) => f.label)];
  const lines = [header.map(cell).join(",")];
  for (const r of rows ?? []) {
    const values = parseResponses(r.responses);
    lines.push(
      [
        r.employee?.employee_code,
        r.employee?.full_name,
        r.employee?.email,
        r.employee?.department?.name,
        new Date(r.submitted_at).toISOString().replace("T", " ").slice(0, 19),
        ...fields.map((f) => displayValue(f, values[f.key])),
      ]
        .map(cell)
        .join(","),
    );
  }

  const slug = form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "declaration";
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-responses.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
