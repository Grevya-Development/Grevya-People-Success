import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Badge, buttonClass } from "@/components/ui";
import { toDisplayHtml } from "../../policies/_lib/sanitize";
import { letterTypeLabel } from "../../_lib/letter-templates";
import { PrintButton } from "../_components/print-button";

export const metadata: Metadata = { title: "Letter" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Print only the letter, regardless of the portal chrome around it. */
const PRINT_CSS = `
@media print {
  @page { margin: 14mm; }
  body * { visibility: hidden !important; }
  .letter-print-area, .letter-print-area * { visibility: visible !important; }
  .letter-print-area { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: 0 !important; margin: 0 !important; }
}`;

export default async function LetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const me = await requireEmployee();
  const supabase = await createClient();

  // RLS: own letters, or any letter for HR.
  const { data: letter } = await supabase
    .from("letters")
    .select(
      "id, employee_id, title, content, letter_type, category, issued_on, employee:employees!letters_employee_id_fkey(full_name, employee_code), issuer:employees!letters_issued_by_fkey(full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!letter) notFound();

  const employee = letter.employee as { full_name: string | null; employee_code: string } | null;
  const issuer = letter.issuer as { full_name: string | null } | null;
  const own = letter.employee_id === me.id;
  const backHref = own ? (letter.category === "salary" ? "/hris/salary-letters" : "/hris/letters") : "/hris/admin/letters?tab=issued";
  const backLabel = own ? (letter.category === "salary" ? "My Salary Letters" : "My Letters") : "Issued letters";

  return (
    <div>
      <style>{PRINT_CSS}</style>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <nav className="mb-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
            <Link href="/hris" className="hover:text-primary-600">
              HRIS
            </Link>
            <span>/</span>
            <Link href={backHref} className="hover:text-primary-600">
              {backLabel}
            </Link>
          </nav>
          <h1 className="truncate text-xl font-semibold text-slate-900">{letter.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge tone="blue">{letterTypeLabel(letter.letter_type)}</Badge>
            <span>Issued {formatDate(letter.issued_on)}</span>
            {!own && employee && (
              <span>
                · to {employee.full_name} ({employee.employee_code})
              </span>
            )}
            {issuer?.full_name && <span>· by {issuer.full_name}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={backHref} className={buttonClass("outline", "sm")}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
          <PrintButton />
        </div>
      </div>

      <div className="overflow-x-auto thin-scroll">
        <article className="letter-print-area mx-auto min-w-[320px] max-w-[820px] rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center justify-between gap-4 border-b-4 border-[#5b74d6] px-6 py-5 sm:px-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/grevya-logo.png" alt="Grevya" className="h-10 w-auto object-contain sm:h-12" />
            <div className="text-right text-[11px] leading-snug text-slate-500">
              <p className="text-sm font-semibold tracking-wide text-slate-800">Grevya</p>
              <p>Human Resources</p>
            </div>
          </header>
          <div className="prose-doc px-6 py-8 text-[14px] sm:px-10" dangerouslySetInnerHTML={{ __html: toDisplayHtml(letter.content) }} />
          <footer className="border-t border-slate-100 px-6 py-3 text-center text-[10px] text-slate-400 sm:px-10">
            This is a system-generated letter issued through People Success · Ref: {letter.id.slice(0, 8).toUpperCase()}
          </footer>
        </article>
      </div>
    </div>
  );
}
