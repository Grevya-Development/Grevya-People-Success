import Link from "next/link";
import { BookOpen, Clock, Layers, ShieldAlert } from "lucide-react";
import { Badge, StatusBadge, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { cn, humanize } from "@/lib/utils";
import { enrollInCourse } from "../actions";
import { CourseProgress } from "./progress";
import { categoryStyle, formatHours, parseModules, type Course, type Enrollment } from "../_lib/course";

type CardCourse = Pick<Course, "id" | "title" | "description" | "category" | "provider" | "level" | "duration_hours" | "modules" | "is_mandatory" | "published">;

/** Catalog-style course card with a band coloured by category. */
export function CourseCard({
  course,
  enrollment,
  className,
}: {
  course: CardCourse;
  enrollment?: Pick<Enrollment, "status" | "progress"> | null;
  className?: string;
}) {
  const style = categoryStyle(course.category);
  const modules = parseModules(course.modules);
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition hover:shadow-md", className)}>
      <Link href={`/learning/courses/${course.id}`} className={cn("relative block bg-gradient-to-br px-4 pb-4 pt-3 text-white", style.band)}>
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium backdrop-blur-sm">{course.category}</span>
          {course.is_mandatory && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
              <ShieldAlert className="h-3 w-3" /> Mandatory
            </span>
          )}
        </div>
        <BookOpen className="absolute bottom-2 right-3 h-10 w-10 text-white/20" />
        <h3 className="mt-3 line-clamp-2 min-h-[2.5rem] pr-10 text-[15px] font-semibold leading-5">{course.title}</h3>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-2 min-h-[2.5rem] text-xs text-slate-500">{course.description || "No description provided."}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {formatHours(Number(course.duration_hours))}
          </span>
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" /> {modules.length} module{modules.length === 1 ? "" : "s"}
          </span>
          <Badge tone="gray">{humanize(course.level)}</Badge>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">by {course.provider}</p>

        <div className="mt-auto pt-4">
          {enrollment ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <StatusBadge status={enrollment.status} label={enrollment.status === "enrolled" ? "Not started" : undefined} />
                <span className="font-medium text-slate-600">{enrollment.progress}%</span>
              </div>
              <CourseProgress value={enrollment.progress} />
              <Link href={`/learning/courses/${course.id}`} className={buttonClass("outline", "sm", "w-full")}>
                {enrollment.status === "completed" ? "Review" : enrollment.status === "enrolled" ? "Start" : "Continue"}
              </Link>
            </div>
          ) : course.published ? (
            <div className="flex gap-2">
              <Link href={`/learning/courses/${course.id}`} className={buttonClass("outline", "sm", "flex-1")}>
                Details
              </Link>
              <ActionButton action={enrollInCourse} fields={{ course_id: course.id }} variant="primary" className="flex-1">
                Enroll
              </ActionButton>
            </div>
          ) : (
            <Badge tone="gray">Unpublished</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
