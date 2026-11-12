"use client";

import { useFormStatus } from "react-dom";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import type { PortalMode } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { switchPortalView } from "@/app/(portal)/_actions";

function SwitchButton({ label, className }: { label: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <ArrowLeftRight className="h-4 w-4 shrink-0" />}
      <span className="truncate">{pending ? "Switching…" : label}</span>
    </button>
  );
}

/** Switch between the admin console and the admin's own workspace. Only rendered for HR admins. */
export function ViewSwitch({ mode, variant }: { mode: PortalMode; variant: "header" | "menu" | "menu-dark" }) {
  const target = mode === "admin" ? "self" : "admin";
  const label = target === "self" ? "My workspace" : "Admin console";
  const cls = {
    header:
      "inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-primary-300 hover:text-primary-700 disabled:opacity-60",
    menu: "flex w-full items-center gap-3 rounded-lg bg-primary-50 px-4 py-2.5 text-left text-[15px] text-primary-700 hover:bg-primary-100 disabled:opacity-60",
    "menu-dark": "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-white/85 hover:bg-white/10 disabled:opacity-60",
  }[variant];
  return (
    <form action={switchPortalView.bind(null, target)}>
      <SwitchButton label={variant === "header" ? label : `Switch to ${label.toLowerCase()}`} className={cn(cls)} />
    </form>
  );
}
