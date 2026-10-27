"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { ChevronRight, ChevronsLeft, ChevronsRight, Heart, Home, LogOut, Settings, User, X, ExternalLink, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { MODULES, canSee, isGroup, type NavGroup, type NavLeaf, type NavModule, type Viewer } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { toggleFavorite, signOut } from "@/app/(portal)/_actions";

export type ShellUser = { name: string; avatarUrl: string | null; designation: string | null; code: string };
export type ShellAddon = { id: string; name: string; url: string; color: string; description: string | null };

/** Safe link target for an add-on: in-portal path, or http(s) URL. Anything else is dropped. */
function addonLink(url: string): { href: string; external: boolean } | null {
  const u = url.trim();
  if (u.startsWith("/") && !u.startsWith("//")) return { href: u, external: false };
  if (/^https?:\/\//i.test(u)) return { href: u, external: true };
  return null;
}

const EXPANDED_W = 288;
const COLLAPSED_W = 76;
const HEADER_H = 64;

type Flyout =
  | { kind: "module"; key: string; top: number }
  | { kind: "user"; top: number }
  | null;

function useIsDesktop() {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

function moduleMatches(m: NavModule, pathname: string) {
  const hrefs: string[] = [m.href];
  for (const i of m.items) {
    if (isGroup(i)) i.children.forEach((c) => hrefs.push(c.href));
    else hrefs.push(i.href);
  }
  return hrefs.some((h) => pathname === h || pathname.startsWith(h + "/"));
}

export function Sidebar({
  viewer,
  user,
  favorites: initialFavorites,
  addons,
  collapsed,
  onCollapsedChange,
  mobileOpen,
  onMobileClose,
}: {
  viewer: Viewer;
  user: ShellUser;
  favorites: string[];
  addons: ShellAddon[];
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();
  const desktop = useIsDesktop();
  const [flyout, setFlyout] = useState<Flyout>(null);
  const [group, setGroup] = useState<{ key: string; top: number } | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(initialFavorites));
  const [expandedMobile, setExpandedMobile] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync when the server sends a fresh favourites list
  const [prevInitial, setPrevInitial] = useState(initialFavorites);
  if (prevInitial !== initialFavorites) {
    setPrevInitial(initialFavorites);
    setFavorites(new Set(initialFavorites));
  }

  // Close flyouts on navigation
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setFlyout(null);
    setGroup(null);
  }

  const modules = MODULES.filter((m) => canSee(m.audience, viewer));
  const activeModule = modules.find((m) => moduleMatches(m, pathname))?.key;

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      setFlyout(null);
      setGroup(null);
    }, 180);
  };

  // Hover intent: when a flyout is already open, wait briefly before switching
  // so a diagonal mouse move toward the open flyout doesn't hop to another module.
  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSwitch = () => {
    if (switchTimer.current) clearTimeout(switchTimer.current);
    switchTimer.current = null;
  };
  const cancelGroupSwitch = () => {
    if (groupTimer.current) clearTimeout(groupTimer.current);
    groupTimer.current = null;
  };
  const deferIfOpen = (fn: () => void) => {
    cancelSwitch();
    if (!flyout) return fn();
    switchTimer.current = setTimeout(fn, 280);
  };
  const onFlyoutEnter = () => {
    cancelClose();
    cancelSwitch();
  };

  const openModule = (key: string, el: HTMLElement, immediate = false) => {
    cancelClose();
    if (flyout?.kind === "module" && flyout.key === key) {
      cancelSwitch();
      return;
    }
    const top = el.getBoundingClientRect().top;
    const go = () => {
      setGroup(null);
      setFlyout({ kind: "module", key, top });
    };
    if (immediate) {
      cancelSwitch();
      go();
    } else deferIfOpen(go);
  };

  const openGroup = (g: NavGroup | null, el?: HTMLElement) => {
    cancelGroupSwitch();
    const go = () => setGroup(g ? { key: g.key, top: el!.getBoundingClientRect().top } : null);
    if (g && group?.key === g.key) return;
    if (!group) return go();
    groupTimer.current = setTimeout(go, 280);
  };

  const [, startTransition] = useTransition();
  const onToggleFavorite = useCallback((key: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    startTransition(async () => {
      const res = await toggleFavorite(key);
      if (!res.ok) {
        toast.error(res.error ?? "Could not update favourites");
        setFavorites((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      } else {
        toast.success(res.favorite ? "Added to favourites" : "Removed from favourites");
      }
    });
  }, []);

  const width = desktop ? (collapsed ? COLLAPSED_W : EXPANDED_W) : EXPANDED_W;
  const showLabels = !desktop || !collapsed;
  const flyModule = flyout?.kind === "module" ? modules.find((m) => m.key === flyout.key) : undefined;

  return (
    <>
      {/* Mobile backdrop */}
      {!desktop && mobileOpen && <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={onMobileClose} />}

      <div onMouseLeave={desktop ? scheduleClose : undefined} onMouseEnter={cancelClose}>
        <aside
          style={{ width, top: desktop ? HEADER_H : 0 }}
          className={cn(
            "fixed bottom-0 left-0 z-50 flex flex-col bg-gradient-to-b from-navy-800 via-navy-900 to-navy-950 text-white shadow-xl transition-[width,transform] duration-200",
            desktop ? "rounded-tr-2xl" : mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {/* Top: collapse / close */}
          <div className="flex items-center justify-end px-3 pt-3">
            {desktop ? (
              <button
                type="button"
                onClick={() => onCollapsedChange(!collapsed)}
                className="rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
                aria-label={collapsed ? "Expand menu" : "Collapse menu"}
              >
                {collapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
              </button>
            ) : (
              <button type="button" onClick={onMobileClose} className="rounded-md p-1.5 text-white/80 hover:bg-white/10" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Home */}
          <Link
            href="/home"
            onMouseEnter={() =>
              deferIfOpen(() => {
                setFlyout(null);
                setGroup(null);
              })
            }
            className={cn(
              "mx-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-bold transition-colors hover:bg-white/10",
              pathname === "/home" && "bg-white/10",
              !showLabels && "justify-center px-0",
            )}
            title="Home"
          >
            <Home className="h-6 w-6 shrink-0" strokeWidth={1.75} />
            {showLabels && <span>Home</span>}
          </Link>
          <div className="mx-5 my-3 h-px bg-white/40" />

          {/* Modules */}
          <nav className="thin-scroll flex-1 space-y-0.5 overflow-y-auto px-3 pb-2">
            {modules.map((m) => {
              const Icon = m.icon;
              const active = activeModule === m.key;
              const hovered = flyout?.kind === "module" && flyout.key === m.key;
              const rowClass = cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] transition-colors",
                hovered || active ? "bg-navy-950/70" : "hover:bg-white/10",
                !showLabels && "justify-center px-0",
              );

              if (m.direct) {
                const fav = favorites.has(m.items[0].key);
                return (
                  <div key={m.key} className="relative" onMouseEnter={() => deferIfOpen(() => { setFlyout(null); setGroup(null); })}>
                    <Link href={m.href} className={rowClass} title={m.label}>
                      <Icon className="h-[22px] w-[22px] shrink-0 opacity-90" strokeWidth={1.6} />
                      {showLabels && <span className="flex-1 truncate">{m.label}</span>}
                    </Link>
                    {showLabels && (
                      <button
                        type="button"
                        onClick={() => onToggleFavorite(m.items[0].key)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-white/90 hover:text-white"
                        aria-label={fav ? "Remove from favourites" : "Add to favourites"}
                      >
                        <Heart className={cn("h-5 w-5", fav && "fill-rose-400 text-rose-400")} strokeWidth={1.6} />
                      </button>
                    )}
                  </div>
                );
              }

              if (!desktop) {
                const open = expandedMobile === m.key;
                return (
                  <div key={m.key}>
                    <button type="button" className={rowClass} onClick={() => setExpandedMobile(open ? null : m.key)}>
                      <Icon className="h-[22px] w-[22px] shrink-0 opacity-90" strokeWidth={1.6} />
                      <span className="flex-1 truncate">{m.label}</span>
                      <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
                    </button>
                    {open && (
                      <div className="mb-2 ml-4 mt-1 space-y-1 border-l border-white/15 pl-3">
                        <MobileItems module={m} viewer={viewer} addons={addons} />
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <button
                  key={m.key}
                  type="button"
                  className={rowClass}
                  title={m.label}
                  onMouseEnter={(e) => openModule(m.key, e.currentTarget)}
                  onClick={(e) => (hovered ? setFlyout(null) : openModule(m.key, e.currentTarget, true))}
                >
                  <Icon className="h-[22px] w-[22px] shrink-0 opacity-90" strokeWidth={1.6} />
                  {showLabels && (
                    <>
                      <span className="flex-1 truncate">{m.label}</span>
                      <ChevronRight className="h-4 w-4 opacity-80" />
                    </>
                  )}
                </button>
              );
            })}
          </nav>

          {/* User */}
          <div className="px-3 pb-3">
            <div className="mx-2 mb-2 h-px bg-white/40" />
            {desktop ? (
              <button
                type="button"
                onMouseEnter={(e) => {
                  cancelClose();
                  const top = e.currentTarget.getBoundingClientRect().top;
                  deferIfOpen(() => {
                    setGroup(null);
                    setFlyout({ kind: "user", top });
                  });
                }}
                onClick={(e) => setFlyout(flyout?.kind === "user" ? null : { kind: "user", top: e.currentTarget.getBoundingClientRect().top })}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10",
                  flyout?.kind === "user" && "bg-navy-950/70",
                  !showLabels && "justify-center px-0",
                )}
              >
                <Avatar name={user.name} src={user.avatarUrl} size="sm" className="ring-white/40" />
                {showLabels && (
                  <>
                    <span className="flex-1 truncate text-white/90">{user.name}</span>
                    <ChevronRight className="h-4 w-4 opacity-80" />
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-3 px-3 py-2">
                  <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                  <span className="truncate text-sm">{user.name}</span>
                </div>
                <UserLinks dark />
              </div>
            )}
            {showLabels && (
              <p className="mt-3 text-center text-[11px] text-white/60">
                Powered by <span className="font-semibold tracking-wide text-white/80">Grevya</span>
              </p>
            )}
          </div>
        </aside>

        {/* Flyouts (desktop only) */}
        {desktop && flyModule && flyout?.kind === "module" && (
          <FlyoutPanel left={width + 10} anchorTop={flyout.top} title={flyModule.label} onEnter={onFlyoutEnter}>
            <ModuleItems
              module={flyModule}
              viewer={viewer}
              favorites={favorites}
              onToggleFavorite={onToggleFavorite}
              activeGroup={group?.key}
              onOpenGroup={openGroup}
              addons={addons}
            />
          </FlyoutPanel>
        )}
        {desktop && flyModule && group && (
          <GroupFlyout
            module={flyModule}
            groupKey={group.key}
            anchorTop={group.top}
            left={width + 10 + 340 + 10}
            viewer={viewer}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            onEnter={() => {
              onFlyoutEnter();
              cancelGroupSwitch();
            }}
          />
        )}
        {desktop && flyout?.kind === "user" && (
          <FlyoutPanel left={width + 10} anchorTop={flyout.top} title={user.name} onEnter={onFlyoutEnter} width={300}>
            <UserLinks />
          </FlyoutPanel>
        )}
      </div>
    </>
  );
}

function FlyoutPanel({
  left,
  anchorTop,
  title,
  width = 340,
  onEnter,
  children,
}: {
  left: number;
  anchorTop: number;
  title: string;
  width?: number;
  onEnter: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(anchorTop - 12);

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    const max = window.innerHeight - h - 12;
    setTop(Math.max(HEADER_H + 8, Math.min(anchorTop - 12, max)));
  }, [anchorTop, children]);

  return (
    <div
      ref={ref}
      onMouseEnter={onEnter}
      style={{ left, top, width }}
      className="fixed z-50 max-h-[calc(100vh-88px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-900/15 thin-scroll animate-in"
    >
      <h3 className="mb-3 px-1 text-lg font-semibold text-slate-800">{title}</h3>
      {children}
    </div>
  );
}

function Pill({
  leaf,
  theme,
  favorite,
  onToggleFavorite,
}: {
  leaf: NavLeaf;
  theme: NavModule["theme"];
  favorite: boolean;
  onToggleFavorite: (key: string) => void;
}) {
  const pathname = usePathname();
  const active = pathname === leaf.href;
  return (
    <div className={cn("group relative flex items-center rounded-lg transition-colors", theme.pill, theme.pillHover, active && "ring-2 ring-inset ring-primary-500/40")}>
      <Link href={leaf.href} className="flex-1 truncate px-4 py-2.5 text-[15px] text-slate-700">
        {leaf.label}
      </Link>
      {!leaf.noFavorite && (
        <button
          type="button"
          onClick={() => onToggleFavorite(leaf.key)}
          className="mr-2 rounded p-1 text-slate-500 hover:text-rose-500"
          aria-label={favorite ? `Remove ${leaf.label} from favourites` : `Add ${leaf.label} to favourites`}
        >
          <Heart className={cn("h-[18px] w-[18px]", favorite && "fill-rose-500 text-rose-500")} strokeWidth={1.6} />
        </button>
      )}
    </div>
  );
}

function ModuleItems({
  module: m,
  viewer,
  favorites,
  onToggleFavorite,
  activeGroup,
  onOpenGroup,
  addons,
}: {
  module: NavModule;
  viewer: Viewer;
  favorites: Set<string>;
  onToggleFavorite: (key: string) => void;
  activeGroup?: string;
  onOpenGroup: (g: NavGroup | null, el?: HTMLElement) => void;
  addons: ShellAddon[];
}) {
  const items = m.items.filter((i) => canSee(i.audience, viewer));
  const isApps = m.key === "apps";
  return (
    <div className="space-y-2">
      {isApps && <p className="px-1 text-sm font-semibold text-slate-700">Builder Apps</p>}
      {items.map((item) => {
        if (isGroup(item)) {
          const open = activeGroup === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onMouseEnter={(e) => onOpenGroup(item, e.currentTarget)}
              onClick={(e) => onOpenGroup(open ? null : item, e.currentTarget)}
              className={cn("flex w-full items-center rounded-lg px-4 py-2.5 text-left text-[15px] text-slate-700 transition-colors", m.theme.pill, m.theme.pillHover, open && "ring-2 ring-inset ring-primary-500/30")}
            >
              <span className="flex-1 truncate">{item.label}</span>
              <ChevronRight className="h-4 w-4 text-slate-500" />
            </button>
          );
        }
        return (
          <div key={item.key} onMouseEnter={() => onOpenGroup(null)}>
            <Pill leaf={item} theme={m.theme} favorite={favorites.has(item.key)} onToggleFavorite={onToggleFavorite} />
          </div>
        );
      })}
      {isApps && (
        <>
          <Link href="/apps" className="block px-1 pt-1 text-xs font-medium text-primary-600 hover:underline">
            View all apps
          </Link>
          <p className="px-1 pt-3 text-sm font-semibold text-slate-700">Add-ons</p>
          {addons.length === 0 && <p className="px-1 text-xs text-slate-500">No add-ons configured yet.</p>}
          {addons.map((a) => {
            const link = addonLink(a.url);
            if (!link) return null;
            const inner = (
              <>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white" style={{ backgroundColor: a.color }}>
                  {a.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="flex-1 truncate">{a.name}</span>
                {link.external && <ExternalLink className="h-3.5 w-3.5 text-slate-400" />}
              </>
            );
            const cls = "flex items-center gap-3 rounded-lg px-2 py-2 text-[15px] text-slate-700 hover:bg-slate-50";
            return link.external ? (
              <a key={a.id} href={link.href} target="_blank" rel="noopener noreferrer" className={cls} title={a.description ?? a.name}>
                {inner}
              </a>
            ) : (
              <Link key={a.id} href={link.href} className={cls} title={a.description ?? a.name}>
                {inner}
              </Link>
            );
          })}
        </>
      )}
    </div>
  );
}

function GroupFlyout({
  module: m,
  groupKey,
  anchorTop,
  left,
  viewer,
  favorites,
  onToggleFavorite,
  onEnter,
}: {
  module: NavModule;
  groupKey: string;
  anchorTop: number;
  left: number;
  viewer: Viewer;
  favorites: Set<string>;
  onToggleFavorite: (key: string) => void;
  onEnter: () => void;
}) {
  const g = m.items.find((i) => isGroup(i) && i.key === groupKey) as NavGroup | undefined;
  if (!g) return null;
  return (
    <FlyoutPanel left={left} anchorTop={anchorTop} title={g.label} onEnter={onEnter}>
      <div className="space-y-2">
        {g.children
          .filter((c) => canSee(c.audience, viewer))
          .map((c) => (
            <Pill key={c.key} leaf={c} theme={m.theme} favorite={favorites.has(c.key)} onToggleFavorite={onToggleFavorite} />
          ))}
      </div>
    </FlyoutPanel>
  );
}

function MobileItems({ module: m, viewer, addons }: { module: NavModule; viewer: Viewer; addons: ShellAddon[] }) {
  const leafClass = "block rounded-md px-3 py-2 text-sm text-white/85 hover:bg-white/10 hover:text-white";
  return (
    <>
      {m.items
        .filter((i) => canSee(i.audience, viewer))
        .map((i) =>
          isGroup(i) ? (
            <div key={i.key} className="pt-1">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">{i.label}</p>
              {i.children
                .filter((c) => canSee(c.audience, viewer))
                .map((c) => (
                  <Link key={c.key} href={c.href} className={leafClass}>
                    {c.label}
                  </Link>
                ))}
            </div>
          ) : (
            <Link key={i.key} href={i.href} className={leafClass}>
              {i.label}
            </Link>
          ),
        )}
      {m.key === "apps" &&
        addons.map((a) => {
          const link = addonLink(a.url);
          if (!link) return null;
          return link.external ? (
            <a key={a.id} href={link.href} target="_blank" rel="noopener noreferrer" className={leafClass}>
              {a.name} ↗
            </a>
          ) : (
            <Link key={a.id} href={link.href} className={leafClass}>
              {a.name}
            </Link>
          );
        })}
    </>
  );
}

function UserLinks({ dark = false }: { dark?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const cls = dark
    ? "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-white/85 hover:bg-white/10"
    : "flex w-full items-center gap-3 rounded-lg bg-[#f7e3e1] px-4 py-2.5 text-[15px] text-slate-700 hover:bg-[#f2d2ce]";
  return (
    <div className="space-y-2">
      <button type="button" className={cls} onClick={() => router.push("/profile")}>
        <User className="h-[18px] w-[18px] opacity-70" /> My Profile
      </button>
      <button type="button" className={cls} onClick={() => router.push("/settings")}>
        <Settings className="h-[18px] w-[18px] opacity-70" /> Settings
      </button>
      <button type="button" className={cls} disabled={pending} onClick={() => startTransition(() => signOut())}>
        <LogOut className="h-[18px] w-[18px] opacity-70" /> {pending ? "Signing out…" : "Logout"}
      </button>
    </div>
  );
}

export const SIDEBAR_WIDTHS = { expanded: EXPANDED_W, collapsed: COLLAPSED_W, header: HEADER_H };
