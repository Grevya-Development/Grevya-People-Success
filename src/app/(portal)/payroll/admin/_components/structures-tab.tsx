import { Pencil, Plus, Search, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, CardHeader, EmptyState, Input, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StructureForm } from "./structure-form";
import { annualGross, toNum } from "../../_lib/payroll";

const LIMIT = 500;

export async function StructuresTab({ q, today }: { q?: string; today: string }) {
  const supabase = await createClient();
  const term = (q ?? "").trim().slice(0, 80);

  let query = supabase
    .from("employees")
    .select("id, full_name, employee_code, status, date_of_joining, department:departments(name), designation:designations(title)", { count: "exact" })
    .neq("status", "exited")
    .order("employee_code")
    .limit(LIMIT);
  if (term) {
    const safe = term.replace(/[%_,()]/g, " ");
    query = query.or(`full_name.ilike.%${safe}%,employee_code.ilike.%${safe}%`);
  }
  const { data: employees, count } = await query;
  const ids = (employees ?? []).map((e) => e.id);
  const { data: structures } = ids.length
    ? await supabase.from("salary_structures").select("*").in("employee_id", ids).order("effective_from", { ascending: false })
    : { data: [] };

  const current = new Map<string, NonNullable<typeof structures>[number]>();
  const revisions = new Map<string, number>();
  for (const s of structures ?? []) {
    revisions.set(s.employee_id, (revisions.get(s.employee_id) ?? 0) + 1);
    if (s.is_current && !current.has(s.employee_id)) current.set(s.employee_id, s);
  }
  const latestFrom = new Map<string, string>();
  for (const s of structures ?? []) if (!latestFrom.has(s.employee_id)) latestFrom.set(s.employee_id, s.effective_from);
  const withStructure = (employees ?? []).filter((e) => current.has(e.id)).length;

  return (
    <Card>
      <CardHeader
        title="Salary structures"
        description={`${withStructure} of ${employees?.length ?? 0} employees shown have a current structure. Amounts are annual.`}
        action={
          <form method="get" action="/payroll/admin" className="flex items-center gap-2">
            <input type="hidden" name="tab" value="structures" />
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input name="q" defaultValue={term} placeholder="Search name or code" className="w-44 pl-8 sm:w-56" />
            </div>
          </form>
        }
      />
      {!employees?.length ? (
        <EmptyState icon={Wallet} title={term ? "No matching employees" : "No active employees"} description={term ? "Try a different name or employee code." : "Add employees in HRIS first."} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Employee</TH>
              <TH>Designation</TH>
              <TH className="text-right">Annual CTC</TH>
              <TH className="text-right">Monthly gross</TH>
              <TH className="text-right">FBP</TH>
              <TH>Effective from</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {employees.map((e) => {
              const s = current.get(e.id);
              const n = revisions.get(e.id) ?? 0;
              return (
                <TR key={e.id}>
                  <TD>
                    <p className="font-medium text-slate-800">{e.full_name}</p>
                    <p className="text-xs text-slate-500">
                      {e.employee_code}
                      {e.department?.name && ` · ${e.department.name}`}
                    </p>
                  </TD>
                  <TD className="text-slate-600">{e.designation?.title ?? "—"}</TD>
                  <TD className="text-right font-medium tabular-nums">{s ? formatCurrency(s.annual_ctc) : <span className="text-slate-400">Not set</span>}</TD>
                  <TD className="text-right tabular-nums">{s ? formatCurrency(annualGross(s) / 12) : "—"}</TD>
                  <TD className="text-right tabular-nums">{s ? formatCurrency(s.fbp_total) : "—"}</TD>
                  <TD className="whitespace-nowrap">
                    {s ? formatDate(s.effective_from) : "—"}
                    {n > 1 && <span className="block text-[11px] text-slate-400">{n} revisions</span>}
                  </TD>
                  <TD className="text-right">
                    <Dialog
                      size="lg"
                      title={`${s ? "Revise" : "Create"} salary structure`}
                      description={`${e.full_name} (${e.employee_code}) · joined ${formatDate(e.date_of_joining)}`}
                      trigger={
                        <Button variant={s ? "outline" : "primary"} size="sm">
                          {s ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                          {s ? "Revise" : "Create"}
                        </Button>
                      }
                    >
                      <StructureForm
                        employeeId={e.id}
                        today={today}
                        minDate={latestFrom.get(e.id)}
                        current={s ? { annual_ctc: toNum(s.annual_ctc), fbp_total: toNum(s.fbp_total), variable_pay: toNum(s.variable_pay) } : null}
                      />
                    </Dialog>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      {(count ?? 0) > LIMIT && <p className="px-5 py-3 text-xs text-slate-500">Showing the first {LIMIT} of {count} employees — search to narrow down.</p>}
    </Card>
  );
}
