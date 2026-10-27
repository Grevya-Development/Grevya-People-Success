import { NextResponse, type NextRequest } from "next/server";
import { getCurrentEmployee } from "@/lib/auth";
import { readRange } from "../../_range";
import { loadTeamSessions } from "../_data";
import { sessionMinutes } from "../../_lib";

const ist = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(iso)) : "";

function csv(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const me = await getCurrentEmployee();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!me.isManager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const { from, to } = readRange(sp);
  const employee = /^[0-9a-f-]{36}$/i.test(sp.employee ?? "") ? sp.employee : null;
  const sessions = await loadTeamSessions(me, from, to, employee);
  const now = Date.now();

  const header = ["Employee code", "Employee", "Department", "Date", "Check-in (IST)", "Check-out (IST)", "Worked minutes", "Worked hours", "Status", "Check-in latitude", "Check-in longitude", "Check-in accuracy (m)", "Check-out latitude", "Check-out longitude", "Check-in IP", "Check-out IP", "Device", "Notes"];
  const lines = [header.join(",")];
  for (const s of [...sessions].reverse()) {
    const min = sessionMinutes(s, now);
    lines.push(
      [
        s.employee?.employee_code, s.employee?.full_name, s.employee?.department?.name, s.work_date, ist(s.check_in_at), ist(s.check_out_at),
        min, (min / 60).toFixed(2), s.check_out_at ? "Completed" : "In progress",
        s.check_in_lat, s.check_in_lng, s.check_in_accuracy, s.check_out_lat, s.check_out_lng, s.check_in_ip, s.check_out_ip, s.check_in_device, s.notes,
      ].map(csv).join(","),
    );
  }
  return new NextResponse("﻿" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="remote-attendance-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
