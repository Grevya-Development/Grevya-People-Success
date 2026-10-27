"use client";

import { IdCard, Printer } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Avatar, Button } from "@/components/ui";

export type IdCardData = {
  name: string;
  code: string;
  designation: string | null;
  department: string | null;
  bloodGroup: string | null;
  emergencyPhone: string | null;
  avatarUrl: string | null;
  location: string | null;
};

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #virtual-id-card, #virtual-id-card * { visibility: visible !important; }
  #virtual-id-card { position: fixed !important; left: 24px; top: 24px; box-shadow: none !important; }
  #virtual-id-card, #virtual-id-card * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dashed border-slate-200 py-1.5 text-xs last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value || "—"}</span>
    </div>
  );
}

export function IdCardDialog({ data }: { data: IdCardData }) {
  return (
    <Dialog
      size="sm"
      title="Virtual ID Card"
      description="Show this card or print it."
      trigger={
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-[#3753b8] shadow-sm transition hover:bg-[#eef2ff]"
        >
          <IdCard className="h-3.5 w-3.5" />
          Get Virtual ID
        </button>
      }
    >
      <style>{PRINT_CSS}</style>
      <div id="virtual-id-card" className="mx-auto w-[280px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center justify-between bg-[#0c1755] px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/grevya-logo.png" alt="Grevya" className="h-7 w-auto rounded bg-white px-1.5 py-0.5" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">Employee ID</span>
        </div>
        <div className="h-1.5 bg-gradient-to-r from-[#f15a24] via-[#ffb800] to-[#00a4ef]" />
        <div className="flex flex-col items-center px-5 pt-5 text-center">
          <Avatar name={data.name} src={data.avatarUrl} size="xl" className="h-24 w-24 ring-4 ring-[#dce5fa]" />
          <p className="mt-3 text-base font-bold text-slate-900">{data.name}</p>
          <p className="text-xs font-medium text-[#3753b8]">{data.designation ?? "—"}</p>
          <span className="mt-2 rounded-full bg-[#dce5fa] px-3 py-0.5 text-xs font-semibold tracking-wide text-[#3753b8]">{data.code}</span>
        </div>
        <div className="px-5 py-4">
          <Row label="Department" value={data.department} />
          <Row label="Location" value={data.location} />
          <Row label="Blood Group" value={data.bloodGroup} />
          <Row label="Emergency Phone" value={data.emergencyPhone} />
        </div>
        <div className="bg-slate-50 px-4 py-2 text-center text-[10px] text-slate-500">
          Grevya · If found, please return to the nearest Grevya office.
        </div>
      </div>
      <div className="no-print mt-4 flex justify-end">
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
      </div>
    </Dialog>
  );
}
