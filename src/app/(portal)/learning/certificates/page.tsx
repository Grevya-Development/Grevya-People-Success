import Link from "next/link";
import { Award, Clock } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { categoryStyle, certificateId, formatHours } from "../_lib/course";

export const metadata = { title: "My Certificates" };

export default async function CertificatesPage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const { data } = await supabase
    .from("course_enrollments")
    .select("id, completed_at, course:courses!course_enrollments_course_id_fkey(id, title, category, provider, duration_hours)")
    .eq("employee_id", me.id)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });
  const certs = (data ?? []).filter((e) => e.course);
  const totalHours = certs.reduce((s, e) => s + Number(e.course!.duration_hours), 0);

  return (
    <div>
      <PageHeader
        title="My Certificates"
        description={certs.length ? `${certs.length} certificate${certs.length === 1 ? "" : "s"} earned · ${formatHours(totalHours)} of learning` : undefined}
        breadcrumbs={[{ label: "Learning", href: "/learning" }, { label: "My Certificates" }]}
      />

      {certs.length === 0 ? (
        <Card>
          <EmptyState
            icon={Award}
            title="No certificates yet"
            description="Complete a course to earn your first certificate."
            action={
              <Link href="/learning/my-courses" className={buttonClass("secondary", "sm")}>
                Go to My Courses
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {certs.map((e) => {
            const style = categoryStyle(e.course!.category);
            return (
              <Card key={e.id} className="group relative overflow-hidden p-5">
                <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", style.band)} />
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-500 ring-4 ring-amber-50/60">
                    <Award className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[15px] font-semibold text-slate-800">{e.course!.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {e.course!.category} · {e.course!.provider}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                  <span>Completed {formatDate(e.completed_at)}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {formatHours(Number(e.course!.duration_hours))}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[11px] text-slate-400">{certificateId(e.id)}</p>
                <Link href={`/learning/certificates/${e.id}`} className={buttonClass("outline", "sm", "mt-4 w-full")}>
                  View & print
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
