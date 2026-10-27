import { Briefcase, GraduationCap } from "lucide-react";
import type { Tables } from "@/lib/database.types";
import { EmptyState } from "@/components/ui";
import { dateRange } from "../_lib/shared";

function TimelineItem({
  icon,
  title,
  subtitle,
  meta,
  note,
  last,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  meta: string;
  note?: string | null;
  last: boolean;
}) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!last && <span aria-hidden className="absolute left-[15px] top-8 bottom-0 w-px bg-[#c9d7f7]" />}
      <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#dce5fa] text-[#3753b8]">{icon}</span>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500 break-words">{subtitle}</p>
        <p className="mt-0.5 text-xs text-slate-400">{meta}</p>
        {note && <p className="mt-1 text-xs text-slate-600 whitespace-pre-line">{note}</p>}
      </div>
    </li>
  );
}

export function EducationTimeline({ items, emptyHint }: { items: Tables<"employee_education">[]; emptyHint?: string }) {
  if (items.length === 0) {
    return <EmptyState icon={GraduationCap} title="No education added" description={emptyHint} className="py-8" />;
  }
  return (
    <ol>
      {items.map((e, i) => (
        <TimelineItem
          key={e.id}
          icon={<GraduationCap className="h-4 w-4" />}
          title={e.degree}
          subtitle={e.institution}
          meta={dateRange(e.start_date, e.end_date) + (e.grade ? ` · ${e.grade}` : "")}
          last={i === items.length - 1}
        />
      ))}
    </ol>
  );
}

export function ExperienceTimeline({
  items,
  emptyHint,
  showDescription = false,
}: {
  items: Tables<"employee_experience">[];
  emptyHint?: string;
  showDescription?: boolean;
}) {
  if (items.length === 0) {
    return <EmptyState icon={Briefcase} title="No experience added" description={emptyHint} className="py-8" />;
  }
  return (
    <ol>
      {items.map((e, i) => (
        <TimelineItem
          key={e.id}
          icon={<Briefcase className="h-4 w-4" />}
          title={e.company}
          subtitle={e.designation}
          meta={dateRange(e.start_date, e.end_date)}
          note={showDescription ? e.description : null}
          last={i === items.length - 1}
        />
      ))}
    </ol>
  );
}
