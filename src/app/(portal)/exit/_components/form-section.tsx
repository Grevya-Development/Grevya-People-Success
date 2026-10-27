import type { ReactNode } from "react";
import { Card } from "@/components/ui";

/** Numbered section card used by the PeopleStrong-style resignation form. */
export function FormSection({ step, title, icon, children }: { step: number; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-xs font-semibold text-white">{step}</span>
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-slate-800">
          {icon}
          {title}
        </h3>
      </div>
      <div className="px-5 py-5">{children}</div>
    </Card>
  );
}
