"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import type { Viewer } from "@/lib/nav";
import { Avatar } from "@/components/ui/avatar";
import { Sidebar, SIDEBAR_WIDTHS, type ShellAddon, type ShellUser } from "./sidebar";
import { GlobalSearch } from "./search";
import { AlertsMenu, TasksMenu, type NotificationItem, type TaskItem } from "./header-menus";

export function PortalShell({
  viewer,
  user,
  favorites,
  addons,
  tasks,
  notifications,
  unread,
  initialCollapsed,
  children,
}: {
  viewer: Viewer;
  user: ShellUser;
  favorites: string[];
  addons: ShellAddon[];
  tasks: TaskItem[];
  notifications: NotificationItem[];
  unread: number;
  initialCollapsed: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setMobileOpen(false);
  }

  const setCollapsedPersist = (v: boolean) => {
    setCollapsed(v);
    document.cookie = `ps_sidebar=${v ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  };

  const sidebarW = collapsed ? SIDEBAR_WIDTHS.collapsed : SIDEBAR_WIDTHS.expanded;

  return (
    <div className="min-h-screen" style={{ ["--sidebar-w" as string]: `${sidebarW}px` }}>
      <header className="no-print fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/95 px-3 backdrop-blur sm:px-4">
        <button type="button" onClick={() => setMobileOpen(true)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/home" className="flex shrink-0 items-center gap-2.5 lg:w-[calc(var(--sidebar-w)-12px)] lg:pl-3">
          {collapsed ? (
            <Image src="/grevya-mark.png" alt="Grevya" width={36} height={36} className="hidden h-9 w-9 lg:block" priority />
          ) : null}
          <Image
            src="/grevya-logo.png"
            alt="Grevya"
            width={120}
            height={60}
            className={collapsed ? "h-9 w-auto lg:hidden" : "h-10 w-auto"}
            priority
          />
          <span className={collapsed ? "hidden" : "hidden border-l border-slate-200 pl-2.5 text-[13px] font-semibold leading-tight text-slate-600 sm:block"}>
            People
            <br />
            Success
          </span>
        </Link>
        <div className="flex min-w-0 flex-1 justify-center px-1">
          <GlobalSearch viewer={viewer} />
        </div>
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {viewer.isManager && <TasksMenu tasks={tasks} />}
          <AlertsMenu items={notifications} unread={unread} />
          <Link href="/profile" className="ml-1 hidden sm:block" title={user.name}>
            <Avatar name={user.name} src={user.avatarUrl} size="sm" className="ring-slate-200" />
          </Link>
        </div>
      </header>

      <div className="no-print">
        <Sidebar
          viewer={viewer}
          user={user}
          favorites={favorites}
          addons={addons}
          collapsed={collapsed}
          onCollapsedChange={setCollapsedPersist}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
      </div>

      <main className="pt-16 transition-[padding] duration-200 lg:pl-[var(--sidebar-w)] print:p-0">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
