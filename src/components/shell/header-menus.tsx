"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Bell, ChevronDown, ChevronUp, ClipboardList, Megaphone, ArrowRight, Pin } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { markAllNotificationsRead, markNotificationRead } from "@/app/(portal)/_actions";
import { NothingHereIllustration, TasksDoneIllustration } from "./illustrations";

export type TaskItem = { label: string; href: string; count: number; group?: "approval" | "todo"; hint?: string };
export type NotificationItem = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };
export type AnnouncementItem = { id: string; title: string; body: string; pinned: boolean; created_at: string };

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
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

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-2 top-16 z-[60] flex max-h-[calc(100vh-5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[440px]">
      {children}
    </div>
  );
}

function Empty({ kind, text }: { kind: "done" | "nothing"; text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      {kind === "done" ? <TasksDoneIllustration className="h-44 w-auto" /> : <NothingHereIllustration className="h-44 w-auto" />}
      <p className="mt-4 text-[15px] font-medium text-slate-700">{text}</p>
    </div>
  );
}

function Trigger({ open, onClick, icon, label, count }: { open: boolean; onClick: () => void; icon: ReactNode; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={cn("relative flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-100", open && "bg-slate-100 text-slate-900")}
    >
      <span className="relative">
        {icon}
        <CountDot n={count} />
      </span>
      <span className="hidden md:inline">{label}</span>
      {open ? <ChevronUp className="hidden h-3.5 w-3.5 md:inline" /> : <ChevronDown className="hidden h-3.5 w-3.5 md:inline" />}
    </button>
  );
}

export function TasksMenu({ tasks }: { tasks: TaskItem[] }) {
  const { open, setOpen, ref } = useDropdown();
  const active = tasks.filter((t) => t.count > 0);
  const total = active.reduce((s, t) => s + t.count, 0);
  const approvals = active.filter((t) => t.group !== "todo");
  const todos = active.filter((t) => t.group === "todo");

  const Row = ({ t }: { t: TaskItem }) => (
    <li>
      <Link href={t.href} onClick={() => setOpen(false)} className="group flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-slate-800">{t.label}</span>
          {t.hint && <span className="block truncate text-xs text-slate-500">{t.hint}</span>}
        </span>
        <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700">{t.count}</span>
        <ArrowRight className="h-3.5 w-3.5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
      </Link>
    </li>
  );

  return (
    <div ref={ref} className="relative">
      <Trigger open={open} onClick={() => setOpen(!open)} icon={<ClipboardList className="h-5 w-5" />} label="Tasks" count={total} />
      {open && (
        <Panel>
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-[15px] font-semibold text-slate-800">Tasks</p>
            <p className="text-xs text-slate-500">{total ? `${total} item${total === 1 ? "" : "s"} waiting for you` : "Nothing waiting for you"}</p>
          </div>
          {total === 0 ? (
            <Empty kind="done" text="Superb! You don't have any pending tasks" />
          ) : (
            <div className="flex-1 overflow-y-auto thin-scroll">
              {approvals.length > 0 && (
                <>
                  <p className="px-5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Approvals</p>
                  <ul>
                    {approvals.map((t) => (
                      <Row key={t.href + t.label} t={t} />
                    ))}
                  </ul>
                </>
              )}
              {todos.length > 0 && (
                <>
                  <p className="px-5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">My to-dos</p>
                  <ul className="pb-2">
                    {todos.map((t) => (
                      <Row key={t.href + t.label} t={t} />
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

export function AlertsMenu({ items, unread, announcements }: { items: NotificationItem[]; unread: number; announcements: AnnouncementItem[] }) {
  const { open, setOpen, ref } = useDropdown();
  const [tab, setTab] = useState<"notifications" | "announcements">("notifications");
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <div ref={ref} className="relative">
      <Trigger open={open} onClick={() => setOpen(!open)} icon={<Bell className="h-5 w-5" />} label="Alerts" count={unread} />
      {open && (
        <Panel>
          <div className="flex items-center gap-1 border-b border-slate-100 px-3 pt-3">
            {(["notifications", "announcements"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
                  tab === t ? "border-primary-600 text-primary-700" : "border-transparent text-slate-500 hover:text-slate-800",
                )}
              >
                {t === "notifications" ? <Bell className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
                {t === "notifications" ? "Notifications" : "Announcements"}
                {t === "notifications" && unread > 0 && <span className="rounded-full bg-brand-red px-1.5 text-[10px] font-bold text-white">{unread}</span>}
              </button>
            ))}
            {tab === "notifications" && unread > 0 && (
              <button type="button" className="ml-auto pb-2 pr-2 text-xs font-medium text-primary-600 hover:underline" onClick={() => startTransition(() => markAllNotificationsRead())}>
                Mark all read
              </button>
            )}
          </div>

          {tab === "notifications" ? (
            items.length === 0 ? (
              <Empty kind="nothing" text="You're all caught up — no notifications yet" />
            ) : (
              <>
                <div className="flex-1 overflow-y-auto thin-scroll">
                  {items.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        startTransition(() => markNotificationRead(n.id));
                        if (n.link) router.push(n.link);
                      }}
                      className={cn("flex w-full gap-3 border-b border-slate-50 px-5 py-3 text-left hover:bg-slate-50", !n.read_at && "bg-primary-50/40")}
                    >
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary-500")} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-slate-800">{n.title}</span>
                        {n.body && <span className="mt-0.5 block text-xs text-slate-500">{n.body}</span>}
                        <span className="mt-1 block text-[11px] text-slate-400">{formatDateTime(n.created_at)}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 py-3 text-center text-xs font-medium text-primary-600 hover:bg-slate-50">
                  View all notifications
                </Link>
              </>
            )
          ) : announcements.length === 0 ? (
            <Empty kind="nothing" text="There are no announcements for you at the moment" />
          ) : (
            <div className="flex-1 overflow-y-auto thin-scroll">
              {announcements.map((a) => (
                <article key={a.id} className="border-b border-slate-50 px-5 py-4">
                  <div className="flex items-start gap-2">
                    {a.pinned && <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-600" />}
                    <h3 className="text-sm font-semibold text-slate-800">{a.title}</h3>
                  </div>
                  <p className="mt-1 line-clamp-4 whitespace-pre-line text-sm text-slate-600">{a.body}</p>
                  <p className="mt-1.5 text-[11px] text-slate-400">{formatDate(a.created_at)}</p>
                </article>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
