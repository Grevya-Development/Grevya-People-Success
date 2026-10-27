import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, CardHeader, EmptyState, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { Dialog } from "@/components/ui/dialog";
import { cn, formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { actionDeclaration } from "../actions";
import { PAYROLL_THEME, parseFbpComponents, parseInvestmentItems, toNum } from "../../_lib/payroll";

type Kind = "vpf" | "fbp" | "investment";
const KINDS: { key: Kind; label: string }[] = [
  { key: "vpf", label: "VPF" },
  { key: "fbp", label: "FBP" },
  { key: "investment", label: "Investments" },
];
const LIMIT = 200;

type Emp = { full_name: string | null; employee_code: string } | null;

export async function DeclarationsTab({ type, view, meId }: { type?: string; view?: string; meId: string }) {
  const supabase = await createClient();
  const kind: Kind = KINDS.some((k) => k.key === type) ? (type as Kind) : "vpf";
  const processed = view === "processed";

  const [vpfCount, fbpCount, invCount] = await Promise.all([
    supabase.from("vpf_declarations").select("id", { count: "exact", head: true }).eq("status", "pending").neq("employee_id", meId),
    supabase.from("fbp_declarations").select("id", { count: "exact", head: true }).eq("status", "submitted").neq("employee_id", meId),
    supabase.from("investment_declarations").select("id", { count: "exact", head: true }).eq("status", "submitted").neq("employee_id", meId),
  ]);
  const counts: Record<Kind, number> = { vpf: vpfCount.count ?? 0, fbp: fbpCount.count ?? 0, investment: invCount.count ?? 0 };

  const href = (k: Kind, p: boolean) => `/payroll/admin?tab=declarations&type=${k}${p ? "&view=processed" : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <Link
              key={k.key}
              href={href(k.key, processed)}
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition",
                kind === k.key ? cn(PAYROLL_THEME.solid, "text-white shadow-sm") : cn(PAYROLL_THEME.pill, PAYROLL_THEME.text, "hover:brightness-95"),
              )}
            >
              {k.label}
              {counts[k.key] > 0 && <span className={cn("rounded-full px-1.5 text-[11px]", kind === k.key ? "bg-white/25" : "bg-white")}>{counts[k.key]}</span>}
            </Link>
          ))}
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
          <Link href={href(kind, false)} className={cn("rounded-md px-3 py-1.5", !processed ? "bg-slate-800 text-white" : "text-slate-600")}>
            Awaiting review
          </Link>
          <Link href={href(kind, true)} className={cn("rounded-md px-3 py-1.5", processed ? "bg-slate-800 text-white" : "text-slate-600")}>
            Processed
          </Link>
        </div>
      </div>

      {kind === "vpf" && <VpfList processed={processed} meId={meId} />}
      {kind === "fbp" && <FbpList processed={processed} meId={meId} />}
      {kind === "investment" && <InvestmentList processed={processed} meId={meId} />}
    </div>
  );
}

function EmployeeCell({ e }: { e: Emp }) {
  return (
    <TD>
      <p className="font-medium text-slate-800">{e?.full_name ?? "—"}</p>
      <p className="text-xs text-slate-500">{e?.employee_code}</p>
    </TD>
  );
}

function Remarks({ remarks, at }: { remarks: string | null; at: string | null }) {
  if (!remarks && !at) return <span className="text-slate-400">—</span>;
  return (
    <span className="block max-w-xs text-xs text-slate-600">
      {remarks}
      {at && <span className="block text-slate-400">{formatDate(at)}</span>}
    </span>
  );
}

function Decide({ kind, id, status }: { kind: Kind; id: string; status: string }) {
  const waiting = kind === "vpf" ? "pending" : "submitted";
  const f = (decision: string) => ({ kind, id, decision });
  if (status === waiting) {
    return (
      <div className="flex justify-end gap-1.5">
        <ActionButton action={actionDeclaration} fields={f("approve")} variant="success" prompt="Remarks (optional)" successMessage="Approved">
          Approve
        </ActionButton>
        {kind !== "vpf" && (
          <ActionButton action={actionDeclaration} fields={f("return")} prompt="What should the employee change?" promptRequired>
            Return
          </ActionButton>
        )}
        <ActionButton action={actionDeclaration} fields={f("reject")} variant="danger" prompt="Reason for rejection" promptRequired>
          Reject
        </ActionButton>
      </div>
    );
  }
  if (kind !== "vpf" && (status === "approved" || status === "rejected")) {
    return (
      <div className="flex justify-end">
        <ActionButton action={actionDeclaration} fields={f("reopen")} prompt="Why reopen? (shown to the employee)" promptRequired>
          Reopen
        </ActionButton>
      </div>
    );
  }
  return null;
}

function Empty({ processed }: { processed: boolean }) {
  return (
    <EmptyState
      icon={ClipboardCheck}
      title={processed ? "Nothing processed yet" : "All caught up"}
      description={processed ? "Approved and rejected declarations will show here." : "There are no declarations waiting for your review."}
    />
  );
}

async function VpfList({ processed, meId }: { processed: boolean; meId: string }) {
  const supabase = await createClient();
  let q = supabase
    .from("vpf_declarations")
    .select("*, employee:employees!vpf_declarations_employee_id_fkey(full_name, employee_code)")
    .neq("employee_id", meId)
    .order(processed ? "actioned_at" : "created_at", { ascending: !processed })
    .limit(LIMIT);
  q = processed ? q.in("status", ["approved", "rejected"]) : q.eq("status", "pending");
  const { data } = await q;
  const rows = data ?? [];
  const ids = rows.map((r) => r.employee_id);
  const { data: structs } = ids.length ? await supabase.from("salary_structures").select("employee_id, basic").eq("is_current", true).in("employee_id", ids) : { data: [] };
  const basicFor = new Map((structs ?? []).map((s) => [s.employee_id, toNum(s.basic) / 12]));

  return (
    <Card>
      <CardHeader title="VPF declarations" description="Voluntary PF on top of the mandatory 12% EPF" />
      {rows.length === 0 ? (
        <Empty processed={processed} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Employee</TH>
              <TH className="text-right">VPF %</TH>
              <TH className="text-right">Monthly amount</TH>
              <TH>Effective from</TH>
              <TH>Requested</TH>
              <TH>Status</TH>
              <TH>Remarks</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <EmployeeCell e={r.employee} />
                <TD className="text-right font-medium">{toNum(r.percentage)}%</TD>
                <TD className="text-right tabular-nums">{basicFor.has(r.employee_id) ? formatCurrency(((basicFor.get(r.employee_id) ?? 0) * toNum(r.percentage)) / 100) : "—"}</TD>
                <TD className="whitespace-nowrap">{formatDate(r.effective_month, "MMM yyyy")}</TD>
                <TD className="whitespace-nowrap">{formatDate(r.created_at)}</TD>
                <TD>
                  <StatusBadge status={r.status} />
                </TD>
                <TD>
                  <Remarks remarks={r.approver_remarks} at={r.actioned_at} />
                </TD>
                <TD>
                  <Decide kind="vpf" id={r.id} status={r.status} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

async function FbpList({ processed, meId }: { processed: boolean; meId: string }) {
  const supabase = await createClient();
  let q = supabase
    .from("fbp_declarations")
    .select("*, employee:employees!fbp_declarations_employee_id_fkey(full_name, employee_code)")
    .neq("employee_id", meId)
    .order(processed ? "actioned_at" : "submitted_at", { ascending: !processed })
    .limit(LIMIT);
  q = processed ? q.in("status", ["approved", "rejected"]) : q.eq("status", "submitted");
  const { data } = await q;
  const rows = data ?? [];
  const ids = rows.map((r) => r.employee_id);
  const { data: structs } = ids.length ? await supabase.from("salary_structures").select("employee_id, fbp_total").eq("is_current", true).in("employee_id", ids) : { data: [] };
  const fbpFor = new Map((structs ?? []).map((s) => [s.employee_id, toNum(s.fbp_total)]));

  return (
    <Card>
      <CardHeader title="FBP declarations" description="Flexible Benefit Plan component split" />
      {rows.length === 0 ? (
        <Empty processed={processed} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Employee</TH>
              <TH>FY</TH>
              <TH className="text-right">Declared / entitlement</TH>
              <TH>Submitted</TH>
              <TH>Status</TH>
              <TH>Remarks</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => {
              const comps = parseFbpComponents(r.components);
              const total = comps.reduce((a, c) => a + c.declared, 0);
              const ent = fbpFor.get(r.employee_id);
              return (
                <TR key={r.id}>
                  <EmployeeCell e={r.employee} />
                  <TD>{r.financial_year}</TD>
                  <TD className="text-right tabular-nums">
                    <Dialog
                      title={`FBP — ${r.employee?.full_name ?? ""}`}
                      description={`FY ${r.financial_year}${ent !== undefined ? ` · entitlement ${formatCurrency(ent)}` : ""}`}
                      trigger={
                        <Button variant="ghost" size="sm" className="tabular-nums">
                          {formatCurrency(total)}
                          {ent !== undefined && <span className="text-slate-400"> / {formatCurrency(ent)}</span>}
                        </Button>
                      }
                    >
                      <ul className="divide-y divide-slate-100 text-sm">
                        {comps.map((c) => (
                          <li key={c.code} className="flex justify-between gap-3 py-2">
                            <span className="text-slate-600">
                              {c.label} <span className="text-xs text-slate-400">(limit {formatCurrency(c.limit)})</span>
                            </span>
                            <span className="tabular-nums">{formatCurrency(c.declared)}</span>
                          </li>
                        ))}
                        <li className="flex justify-between gap-3 py-2 font-semibold">
                          <span>Total</span>
                          <span className="tabular-nums">{formatCurrency(total)}</span>
                        </li>
                      </ul>
                    </Dialog>
                  </TD>
                  <TD className="whitespace-nowrap">{r.submitted_at ? formatDateTime(r.submitted_at) : "—"}</TD>
                  <TD>
                    <StatusBadge status={r.status} />
                  </TD>
                  <TD>
                    <Remarks remarks={r.approver_remarks} at={r.actioned_at} />
                  </TD>
                  <TD>
                    <Decide kind="fbp" id={r.id} status={r.status} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

async function InvestmentList({ processed, meId }: { processed: boolean; meId: string }) {
  const supabase = await createClient();
  let q = supabase
    .from("investment_declarations")
    .select("*, employee:employees!investment_declarations_employee_id_fkey(full_name, employee_code)")
    .neq("employee_id", meId)
    .order(processed ? "actioned_at" : "submitted_at", { ascending: !processed })
    .limit(LIMIT);
  q = processed ? q.in("status", ["approved", "rejected"]) : q.eq("status", "submitted");
  const { data } = await q;
  const rows = data ?? [];

  return (
    <Card>
      <CardHeader title="Investment declarations" description="Tax regime choice and tax-saving investments with proofs" />
      {rows.length === 0 ? (
        <Empty processed={processed} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Employee</TH>
              <TH>FY</TH>
              <TH>Regime</TH>
              <TH className="text-right">Declared</TH>
              <TH className="text-right">Proofs</TH>
              <TH>Submitted</TH>
              <TH>Status</TH>
              <TH>Remarks</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => {
              const items = parseInvestmentItems(r.items);
              const declared = items.reduce((a, i) => a + i.declared, 0);
              const proofs = items.reduce((a, i) => a + i.proof_amount, 0);
              const hra = items.find((i) => i.code === "hra");
              return (
                <TR key={r.id}>
                  <EmployeeCell e={r.employee} />
                  <TD>{r.financial_year}</TD>
                  <TD className="capitalize">{r.regime}</TD>
                  <TD className="text-right tabular-nums">
                    <Dialog
                      size="lg"
                      title={`Investments — ${r.employee?.full_name ?? ""}`}
                      description={`FY ${r.financial_year} · ${r.regime === "old" ? "Old" : "New"} regime`}
                      trigger={
                        <Button variant="ghost" size="sm" className="tabular-nums">
                          {formatCurrency(declared)}
                        </Button>
                      }
                    >
                      <div className="overflow-x-auto thin-scroll">
                        <table className="w-full min-w-[460px] text-sm">
                          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">Section</th>
                              <th className="px-3 py-2 text-left font-medium">Item</th>
                              <th className="px-3 py-2 text-right font-medium">Declared</th>
                              <th className="px-3 py-2 text-right font-medium">Proof</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {items
                              .filter((i) => i.declared > 0 || i.proof_amount > 0)
                              .map((i) => (
                                <tr key={i.code}>
                                  <td className="px-3 py-2 text-xs text-slate-500">{i.section}</td>
                                  <td className="px-3 py-2">{i.label}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(i.declared)}</td>
                                  <td className={cn("px-3 py-2 text-right tabular-nums", i.proof_amount < i.declared && "text-amber-600")}>{formatCurrency(i.proof_amount)}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      {declared === 0 && <p className="py-4 text-center text-sm text-slate-500">No investments declared.</p>}
                      {hra && hra.declared > 0 && (
                        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          Rent {formatCurrency(hra.monthly_rent)}/month · Landlord {hra.landlord_name || "—"} · PAN {hra.landlord_pan || "—"} · {hra.metro ? "Metro" : "Non-metro"}
                        </p>
                      )}
                    </Dialog>
                  </TD>
                  <TD className={cn("text-right tabular-nums", proofs < declared && "text-amber-600")}>{formatCurrency(proofs)}</TD>
                  <TD className="whitespace-nowrap">{r.submitted_at ? formatDateTime(r.submitted_at) : "—"}</TD>
                  <TD>
                    <StatusBadge status={r.status} />
                  </TD>
                  <TD>
                    <Remarks remarks={r.approver_remarks} at={r.actioned_at} />
                  </TD>
                  <TD>
                    <Decide kind="investment" id={r.id} status={r.status} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
