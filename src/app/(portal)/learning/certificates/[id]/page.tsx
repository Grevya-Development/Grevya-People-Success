import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buttonClass } from "@/components/ui";
import { formatDate, humanize } from "@/lib/utils";
import { PrintButton } from "../../_components/print-button";
import { certificateId, formatHours } from "../../_lib/course";

export const metadata = { title: "Certificate" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 0; }
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  .cert-sheet, .cert-sheet * { visibility: visible !important; }
  .cert-sheet {
    position: fixed !important; inset: 0 !important; margin: 0 !important;
    width: 297mm !important; height: 210mm !important; max-width: none !important;
    border-radius: 0 !important; box-shadow: none !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
}`;

export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const me = await requireEmployee();
  const supabase = await createClient();

  // RLS: own enrollment, or someone in my reporting chain / HR.
  const { data: e } = await supabase
    .from("course_enrollments")
    .select(
      "id, employee_id, status, completed_at, course:courses!course_enrollments_course_id_fkey(title, category, provider, level, duration_hours), employee:employees!course_enrollments_employee_id_fkey(full_name, employee_code, department:departments(name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!e || e.status !== "completed" || !e.course || !e.employee) notFound();
  const mine = e.employee_id === me.id;

  return (
    <div>
      <style>{PRINT_CSS}</style>

      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href={mine ? "/learning/certificates" : "/learning/team"} className={buttonClass("ghost")}>
          <ArrowLeft className="h-4 w-4" /> {mine ? "My Certificates" : "Team Learning"}
        </Link>
        <PrintButton />
      </div>

      <div className="overflow-x-auto pb-2 thin-scroll">
        <div className="cert-sheet relative mx-auto aspect-[297/210] w-full min-w-[720px] max-w-5xl overflow-hidden rounded-xl bg-white shadow-lg">
          {/* decorative frame */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#d5e9f0_0,transparent_45%),radial-gradient(circle_at_bottom_right,#e6e0f1_0,transparent_40%)]" />
          <div className="absolute inset-[18px] rounded-md border-[3px] border-[#25708a]" />
          <div className="absolute inset-[26px] rounded-sm border border-[#3a95b3]/50" />
          <div className="absolute left-0 top-0 h-2 w-full bg-gradient-to-r from-[#f15a24] via-[#ffb800] via-60% to-[#00a4ef]" />

          <div className="relative flex h-full flex-col items-center justify-between px-[8%] py-[6%] text-center">
            <div className="flex w-full items-center justify-between">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/grevya-logo.png" alt="Grevya" className="h-10 w-auto object-contain" />
              <span className="font-mono text-[11px] tracking-wider text-slate-500">Certificate ID: {certificateId(e.id)}</span>
            </div>

            <div className="flex flex-col items-center">
              <p className="text-[13px] font-semibold uppercase tracking-[0.35em] text-[#25708a]">Certificate of Completion</p>
              <p className="mt-5 text-sm text-slate-500">This is proudly presented to</p>
              <p className="mt-2 font-serif text-[2.6rem] font-semibold leading-tight text-slate-900">{e.employee.full_name}</p>
              <div className="mt-1 h-px w-72 bg-gradient-to-r from-transparent via-[#3a95b3] to-transparent" />
              <p className="mt-2 text-xs text-slate-500">
                {e.employee.employee_code}
                {e.employee.department?.name ? ` · ${e.employee.department.name}` : ""}
              </p>
              <p className="mt-5 text-sm text-slate-600">for successfully completing the course</p>
              <p className="mt-2 max-w-2xl text-2xl font-semibold text-[#25708a]">{e.course.title}</p>
              <p className="mt-2 text-xs text-slate-500">
                {e.course.category} · {humanize(e.course.level)} · {formatHours(Number(e.course.duration_hours))} · {e.course.provider}
              </p>
            </div>

            <div className="grid w-full grid-cols-3 items-end gap-6 text-xs text-slate-600">
              <div>
                <p className="text-sm font-semibold text-slate-800">{formatDate(e.completed_at, "dd MMMM yyyy")}</p>
                <div className="mx-auto mt-1 h-px w-40 bg-slate-300" />
                <p className="mt-1">Date of completion</p>
              </div>
              <div className="flex justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-double border-[#ffb800] bg-amber-50 text-[10px] font-bold uppercase leading-tight text-amber-700">
                  Grevya
                  <br />
                  Certified
                </div>
              </div>
              <div>
                <p className="font-serif text-sm italic text-slate-800">People Success Team</p>
                <div className="mx-auto mt-1 h-px w-40 bg-slate-300" />
                <p className="mt-1">Learning & Development, Grevya</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="no-print mt-3 text-center text-xs text-slate-500">Tip: choose “Landscape” and turn off headers & footers in the print dialog for the best result.</p>
    </div>
  );
}
