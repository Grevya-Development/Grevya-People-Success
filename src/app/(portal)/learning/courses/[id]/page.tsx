import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, BookOpen, CheckCircle2, Circle, Clock, ExternalLink, Layers, PlayCircle, ShieldAlert, User } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, ProgressRing, StatusBadge, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { cn, formatDate, humanize, orgToday } from "@/lib/utils";
import { completeCourse, completeNextModule, enrollInCourse, startCourse, unenroll } from "../../actions";
import { categoryStyle, completedModules, daysUntil, dueLabel, formatHours, parseModules } from "../../_lib/course";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const me = await requireEmployee();
  const supabase = await createClient();

  const [{ data: course }, { data: enrollment }] = await Promise.all([
    supabase.from("courses").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("course_enrollments")
      .select("id, status, progress, due_date, enrolled_at, completed_at, assigned_by, assigner:employees!course_enrollments_assigned_by_fkey(full_name)")
      .eq("course_id", id)
      .eq("employee_id", me.id)
      .maybeSingle(),
  ]);
  if (!course || (!course.published && !enrollment && !me.isHR)) notFound();

  const style = categoryStyle(course.category);
  const modules = parseModules(course.modules);
  const totalMinutes = modules.reduce((s, m) => s + m.duration_minutes, 0);
  const done = enrollment ? (enrollment.status === "completed" ? modules.length : completedModules(enrollment.progress, modules.length)) : 0;
  const selfEnrolled = enrollment && (!enrollment.assigned_by || enrollment.assigned_by === me.id);
  const days = enrollment && enrollment.status !== "completed" ? daysUntil(enrollment.due_date, orgToday()) : null;

  return (
    <div>
      <PageHeader
        title={course.title}
        breadcrumbs={[{ label: "Learning", href: "/learning" }, { label: "Catalog", href: "/learning/catalog" }, { label: course.title }]}
        actions={
          me.isHR ? (
            <Link href={`/learning/admin?edit=${course.id}`} className={buttonClass("outline", "sm")}>
              Edit course
            </Link>
          ) : undefined
        }
      />

      <div className={cn("relative mb-5 overflow-hidden rounded-xl bg-gradient-to-br p-5 text-white sm:p-6", style.band)}>
        <BookOpen className="absolute -bottom-4 right-4 h-32 w-32 text-white/10" />
        <div className="relative flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-medium">{course.category}</span>
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-medium">{humanize(course.level)}</span>
          {course.is_mandatory && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 font-semibold text-rose-600">
              <ShieldAlert className="h-3 w-3" /> Mandatory
            </span>
          )}
          {!course.published && <span className="rounded-full bg-black/25 px-2.5 py-0.5 font-medium">Unpublished</span>}
        </div>
        <p className="relative mt-3 max-w-3xl text-sm text-white/90">{course.description || "No description provided."}</p>
        <div className="relative mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/90">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> {formatHours(Number(course.duration_hours))}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Layers className="h-4 w-4" /> {modules.length} module{modules.length === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <User className="h-4 w-4" /> {course.provider}
          </span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Course modules"
            description={modules.length ? `${modules.length} modules · ${totalMinutes} min total` : undefined}
            action={enrollment && modules.length > 0 ? <span className="text-xs font-medium text-slate-500">{done}/{modules.length} done</span> : undefined}
          />
          {modules.length === 0 ? (
            <EmptyState icon={Layers} title="No modules listed" description="This course is completed as a single unit." />
          ) : (
            <ol className="divide-y divide-slate-100">
              {modules.map((m, i) => {
                const isDone = Boolean(enrollment) && i < done;
                const isNext = Boolean(enrollment) && enrollment!.status !== "completed" && i === done;
                return (
                  <li key={i} className={cn("flex items-center gap-3 px-5 py-3", isNext && "bg-[#d5e9f0]/40")}>
                    {isDone ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                    ) : isNext ? (
                      <PlayCircle className="h-5 w-5 shrink-0 text-[#3a95b3]" />
                    ) : (
                      <Circle className="h-5 w-5 shrink-0 text-slate-300" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm", isDone ? "text-slate-500" : "font-medium text-slate-800")}>
                        <span className="mr-1.5 text-slate-400">{i + 1}.</span>
                        {m.title}
                      </p>
                    </div>
                    {isNext && <Badge tone="teal">Up next</Badge>}
                    <span className="shrink-0 text-xs text-slate-500">{m.duration_minutes ? `${m.duration_minutes} min` : "—"}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title={enrollment ? "Your progress" : "Join this course"} />
            <CardBody>
              {enrollment ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <ProgressRing value={enrollment.progress} size={72} stroke={7} color={enrollment.status === "completed" ? "#10b981" : "#3a95b3"}>
                      <span className="text-sm font-semibold text-slate-800">{enrollment.progress}%</span>
                    </ProgressRing>
                    <div className="min-w-0 space-y-1 text-sm">
                      <StatusBadge status={enrollment.status} label={enrollment.status === "enrolled" ? "Not started" : undefined} />
                      <p className="text-xs text-slate-500">Enrolled {formatDate(enrollment.enrolled_at)}</p>
                      {enrollment.completed_at && <p className="text-xs text-slate-500">Completed {formatDate(enrollment.completed_at)}</p>}
                    </div>
                  </div>

                  <dl className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Assigned by</dt>
                      <dd className="font-medium text-slate-700">{selfEnrolled ? "Self-enrolled" : (enrollment.assigner?.full_name ?? "—")}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Due date</dt>
                      <dd className={cn("text-right font-medium", days !== null && days < 0 ? "text-red-600" : "text-slate-700")}>
                        {enrollment.due_date ? formatDate(enrollment.due_date) : "—"}
                        {days !== null && <span className="block font-normal">{dueLabel(days)}</span>}
                      </dd>
                    </div>
                  </dl>

                  {enrollment.status === "completed" ? (
                    <Link href={`/learning/certificates/${enrollment.id}`} className={buttonClass("success", "md", "w-full")}>
                      <Award className="h-4 w-4" /> View certificate
                    </Link>
                  ) : (
                    <div className="space-y-2">
                      {enrollment.status === "enrolled" && (
                        <ActionButton action={startCourse} fields={{ enrollment_id: enrollment.id }} variant="primary" size="md" className="w-full">
                          <PlayCircle className="h-4 w-4" /> Start course
                        </ActionButton>
                      )}
                      {modules.length > 0 && (
                        <ActionButton
                          action={completeNextModule}
                          fields={{ enrollment_id: enrollment.id }}
                          variant={enrollment.status === "enrolled" ? "outline" : "primary"}
                          size="md"
                          className="w-full"
                        >
                          <CheckCircle2 className="h-4 w-4" /> Mark module {Math.min(done + 1, modules.length)} complete
                        </ActionButton>
                      )}
                      <ActionButton
                        action={completeCourse}
                        fields={{ enrollment_id: enrollment.id }}
                        variant="outline"
                        size="md"
                        className="w-full"
                        confirm="Mark the whole course as complete?"
                      >
                        <Award className="h-4 w-4" /> Mark course complete
                      </ActionButton>
                    </div>
                  )}
                </div>
              ) : course.published ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">Enroll to track your progress through each module and earn a certificate on completion.</p>
                  <ActionButton action={enrollInCourse} fields={{ course_id: course.id }} variant="primary" size="md" className="w-full">
                    Enroll now
                  </ActionButton>
                </div>
              ) : (
                <p className="text-sm text-slate-500">This course is not published, so employees can&apos;t enroll yet.</p>
              )}

              {course.content_url && (
                <a href={course.content_url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "md", "mt-3 w-full")}>
                  <ExternalLink className="h-4 w-4" /> Open course content
                </a>
              )}

              {enrollment && selfEnrolled && enrollment.status !== "completed" && (
                <div className="mt-4 border-t border-slate-100 pt-3 text-center">
                  <ActionButton action={unenroll} fields={{ enrollment_id: enrollment.id }} variant="outline" confirm="Un-enroll from this course? Your progress will be lost.">
                    Un-enroll
                  </ActionButton>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
