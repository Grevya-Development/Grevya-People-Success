"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Bell, ChevronDown, ClipboardList, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn, formatDateTime } from "@/lib/utils";
import { markAllNotificationsRead, markNotificationRead } from "@/app/(portal)/_actions";

export type TaskItem = { label: string; href: string; count: number };
export type NotificationItem = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return { open, setOpen, ref };
}

function CountDot({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-bold text-white ring-2 ring-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("absolute right-0 top-11 z-[60] w-[340px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl", className)}>{children}</div>;
}

export function TasksMenu({ tasks }: { tasks: TaskItem[] }) {
  const { open, setOpen, ref } = useDropdown();
  const total = tasks.reduce((s, t) => s + t.count, 0);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="relative flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-100">
        <span className="relative">
          <ClipboardList className="h-5 w-5" />
          <CountDot n={total} />
        </span>
        <span className="hidden md:inline">Tasks</span>
        <ChevronDown className="hidden h-3.5 w-3.5 md:inline" />
      </button>
      {open && (
        <Panel>
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">Pending tasks</p>
            <p className="text-xs text-slate-500">Items waiting for your action</p>
          </div>
          {tasks.length === 0 || total === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              <CheckCheck className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
              You&apos;re all caught up.
            </div>
          ) : (
            <ul className="py-1">
              {tasks
                .filter((t) => t.count > 0)
                .map((t) => (
                  <li key={t.href + t.label}>
                    <Link href={t.href} onClick={() => setOpen(false)} className="flex items-center justify-between px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                      {t.label}
                      <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">{t.count}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}

export function AlertsMenu({ items, unread }: { items: NotificationItem[]; unread: number }) {
  const { open, setOpen, ref } = useDropdown();
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="relative flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-100">
        <span className="relative">
          <Bell className="h-5 w-5" />
          <CountDot n={unread} />
        </span>
        <span className="hidden md:inline">Alerts</span>
      </button>
      {open && (
        <Panel className="w-[380px]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">Notifications</p>
            {unread > 0 && (
              <button type="button" className="text-xs font-medium text-primary-600 hover:underline" onClick={() => startTransition(() => markAllNotificationsRead())}>
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto thin-scroll">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No notifications yet.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    startTransition(() => markNotificationRead(n.id));
                    if (n.link) router.push(n.link);
                  }}
                  className={cn("flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50", !n.read_at && "bg-primary-50/40")}
                >
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary-500")} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-800">{n.title}</span>
                    {n.body && <span className="mt-0.5 block text-xs text-slate-500">{n.body}</span>}
                    <span className="mt-1 block text-[11px] text-slate-400">{formatDateTime(n.created_at)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 py-2.5 text-center text-xs font-medium text-primary-600 hover:bg-slate-50">
            View all notifications
          </Link>
        </Panel>
      )}
    </div>
  );
}
