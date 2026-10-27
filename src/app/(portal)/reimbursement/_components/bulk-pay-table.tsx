"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2, Wallet } from "lucide-react";
import { Avatar, Badge, Button, TBody, TD, TH, THead, TR, Table } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { markClaimsPaid } from "../actions";

export type PayRow = {
  id: string;
  number: string;
  title: string;
  amount: number;
  expense_date: string;
  actioned_at: string | null;
  category: string;
  isCtc: boolean;
  employee: { full_name: string | null; employee_code: string; avatar_url: string | null } | null;
  approver: string | null;
  receiptUrl: string | null;
};

/** HR: approved claims with checkboxes and a bulk "Mark as paid" action. */
export function BulkPayTable({ rows }: { rows: PayRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const total = rows.filter((r) => selected.has(r.id)).reduce((t, r) => t + r.amount, 0);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pay = () => {
    const fd = new FormData();
    fd.set("ids", [...selected].join(","));
    startTransition(async () => {
      const res = await markClaimsPaid(null, fd);
      if (res?.ok) {
        toast.success(res.message ?? "Marked as paid");
        setSelected(new Set());
        setConfirmOpen(false);
        router.refresh();
      } else if (res?.error) {
        toast.error(res.error);
      }
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
        <p className="text-sm text-slate-600">
          {selected.size ? (
            <>
              <strong className="text-slate-900">{selected.size}</strong> selected · {formatCurrency(total, 2)}
            </>
          ) : (
            "Select approved claims to mark them as paid."
          )}
        </p>
        <Button size="sm" variant="success" disabled={!selected.size || pending} onClick={() => setConfirmOpen(true)}>
          <Wallet className="h-3.5 w-3.5" />
          Mark as paid
        </Button>
      </div>
      <Table>
        <THead>
          <tr>
            <TH className="w-10">
              <input
                type="checkbox"
                aria-label="Select all"
                className="h-4 w-4 rounded border-slate-300"
                checked={allChecked}
                onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))}
              />
            </TH>
            <TH>Claim #</TH>
            <TH>Employee</TH>
            <TH>Category</TH>
            <TH>Expense date</TH>
            <TH className="text-right">Amount</TH>
            <TH>Approved</TH>
            <TH>Receipt</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id} className={selected.has(r.id) ? "bg-emerald-50/40" : undefined}>
              <TD>
                <input type="checkbox" aria-label={`Select ${r.number}`} className="h-4 w-4 rounded border-slate-300" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
              </TD>
              <TD className="whitespace-nowrap">
                <Link href={`/reimbursement/claims/${r.id}`} className="font-medium text-primary-600 hover:underline">
                  {r.number}
                </Link>
                <p className="max-w-[200px] truncate text-xs text-slate-500">{r.title}</p>
              </TD>
              <TD>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <Avatar name={r.employee?.full_name} src={r.employee?.avatar_url} size="sm" />
                  <span>
                    <span className="block text-slate-800">{r.employee?.full_name ?? "—"}</span>
                    <span className="block text-xs text-slate-500">{r.employee?.employee_code}</span>
                  </span>
                </span>
              </TD>
              <TD className="whitespace-nowrap">
                {r.category}
                {r.isCtc && (
                  <Badge tone="green" className="ml-2">
                    CTC
                  </Badge>
                )}
              </TD>
              <TD className="whitespace-nowrap">{formatDate(r.expense_date)}</TD>
              <TD className="whitespace-nowrap text-right font-medium text-slate-900">{formatCurrency(r.amount, 2)}</TD>
              <TD className="whitespace-nowrap text-xs text-slate-500">
                {formatDate(r.actioned_at)}
                {r.approver && <span className="block">by {r.approver}</span>}
              </TD>
              <TD>
                {r.receiptUrl ? (
                  <a href={r.receiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
                    <FileText className="h-3.5 w-3.5" />
                    View
                  </a>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Mark claims as paid?" size="sm">
        <p className="mb-4 text-sm text-slate-600">
          {selected.size} claim{selected.size === 1 ? "" : "s"} totalling <strong>{formatCurrency(total, 2)}</strong> will be marked as paid and the employees notified.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button variant="success" disabled={pending} onClick={pay}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm
          </Button>
        </div>
      </Dialog>
    </>
  );
}
