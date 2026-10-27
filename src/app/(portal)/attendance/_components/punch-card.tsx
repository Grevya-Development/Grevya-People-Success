"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, House, Loader2, LogIn, LogOut, MapPin } from "lucide-react";
import type { Tables } from "@/lib/database.types";
import { ActionButton } from "@/components/ui/action-button";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { punchIn, punchOut } from "../actions";

const TZ = "Asia/Kolkata";

// One shared 1-second ticker for every mounted clock.
function subscribe(cb: () => void) {
  const id = window.setInterval(cb, 1000);
  return () => window.clearInterval(id);
}
const getSnapshot = () => Math.floor(Date.now() / 1000);
const getServerSnapshot = () => null;

function useNowSeconds(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const fmtClock = (ms: number) =>
  new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone: TZ }).format(ms).toUpperCase();
const fmtDate = (ms: number) => new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "2-digit", month: "short", year: "numeric", timeZone: TZ }).format(ms);
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TZ }).format(new Date(iso)).toUpperCase();

function duration(ms: number, withSeconds = true) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return withSeconds ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Fields the card needs — a full attendance_records row also fits. */
type PunchRecord = Pick<Tables<"attendance_records">, "check_in" | "check_out" | "status"> & Partial<Tables<"attendance_records">>;

const FULL_DAY_MS = 8 * 3600 * 1000;

export function PunchCard({ today }: { today: Tables<"attendance_records"> | PunchRecord | null }) {
  const nowSec = useNowSeconds();
  const now = nowSec === null ? null : nowSec * 1000;
  const [mode, setMode] = useState<"office" | "remote">("office");
  const [punching, startPunch] = useTransition();

  // Toast from the transition callback rather than an effect: a successful
  // check-in revalidates the page, which unmounts this form immediately.
  const checkIn = (fd: FormData) =>
    startPunch(async () => {
      const res = await punchIn(null, fd);
      if (res?.ok) toast.success(res.message ?? "Checked in");
      else toast.error(res?.error ?? "Couldn't check in — please try again");
    });

  const checkedIn = !!today?.check_in;
  const checkedOut = !!today?.check_out;
  const remote = today?.work_mode === "remote" || today?.status === "wfh";
  const workedMs = checkedIn ? (checkedOut ? new Date(today!.check_out!).getTime() : (now ?? Date.parse(today!.check_in!))) - new Date(today!.check_in!).getTime() : 0;
  const pct = Math.min(100, (workedMs / FULL_DAY_MS) * 100);

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 bg-[#e3a91a] px-4 py-2.5 text-white">
        <h3 className="text-sm font-semibold tracking-wide">Mark Attendance</h3>
        <Link href="/attendance/my" className="text-xs font-medium text-white/90 hover:text-white hover:underline">
          My attendance
        </Link>
      </div>

      <div className="flex flex-1 flex-col p-4">
        {/* Clock */}
        <div className="text-center">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400" suppressHydrationWarning>
            {now ? fmtDate(now) : " "}
          </p>
          <p className="mt-0.5 text-[28px] font-semibold leading-tight tabular-nums text-slate-900" suppressHydrationWarning>
            {now ? fmtClock(now) : "--:--:--"}
          </p>
        </div>

        {!checkedIn && (
          <form
            className="mt-4 flex flex-1 flex-col justify-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!punching) checkIn(new FormData(e.currentTarget));
            }}
          >
            <div role="radiogroup" aria-label="Work location" className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
              {(
                [
                  { v: "office", label: "Office", Icon: MapPin },
                  { v: "remote", label: "Remote", Icon: House },
                ] as const
              ).map(({ v, label, Icon }) => (
                <label
                  key={v}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition",
                    mode === v ? "bg-white text-[#a87a0c] shadow-sm" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  <input type="radio" name="work_mode" value={v} checked={mode === v} onChange={() => setMode(v)} className="sr-only" />
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </label>
              ))}
            </div>
            <Button type="submit" variant="success" size="lg" className="w-full" disabled={punching}>
              {punching ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Check In
            </Button>
            <p className="text-center text-[11px] text-slate-400">{mode === "remote" ? "You'll be marked as working from home." : "You'll be marked present in office."}</p>
          </form>
        )}

        {checkedIn && !checkedOut && (
          <div className="mt-4 flex flex-1 flex-col justify-end gap-3">
            <div className="rounded-lg bg-[#f8ebc8]/60 px-3 py-2.5">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>
                  In at <b className="text-slate-800">{fmtTime(today!.check_in!)}</b>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[#a87a0c]">
                  {remote ? <House className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                  {remote ? "Remote" : "Office"}
                </span>
              </div>
              <p className="mt-1.5 text-center text-xl font-semibold tabular-nums text-slate-800" suppressHydrationWarning>
                {now ? duration(workedMs) : duration(0)}
              </p>
              <p className="text-center text-[10px] uppercase tracking-wide text-slate-400">worked so far</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-[#e3a91a] transition-all" style={{ width: `${pct}%` }} suppressHydrationWarning />
              </div>
            </div>
            <ActionButton action={punchOut} confirm="Check out for today?" variant="danger" size="lg" className="w-full" successMessage="Checked out">
              <LogOut className="h-4 w-4" /> Check Out
            </ActionButton>
          </div>
        )}

        {checkedIn && checkedOut && (
          <div className="mt-4 flex flex-1 flex-col justify-end gap-3">
            <div className="flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Day complete
            </div>
            <div className="grid grid-cols-3 divide-x divide-slate-100 rounded-lg border border-slate-100 text-center">
              <div className="px-1 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">In</p>
                <p className="text-xs font-semibold text-slate-800">{fmtTime(today!.check_in!)}</p>
              </div>
              <div className="px-1 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Out</p>
                <p className="text-xs font-semibold text-slate-800">{fmtTime(today!.check_out!)}</p>
              </div>
              <div className="px-1 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Total</p>
                <p className="text-xs font-semibold text-slate-800">{duration(workedMs, false)}</p>
              </div>
            </div>
            <p className="text-center text-[11px] text-slate-400">{remote ? "Worked remotely today" : "See you tomorrow!"}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
