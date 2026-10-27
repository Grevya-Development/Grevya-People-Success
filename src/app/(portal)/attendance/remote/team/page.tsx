import Link from "next/link";
import { Download, Clock, Users, Laptop, Radio, ArrowLeft } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, StatCard, Table, TBody, TD, TH, THead, TR, buttonClass, Label, Select } from "@/components/ui";
import { SessionCard } from "../_components/session-card";
import { RangeFilter } from "../_components/range-filter";
import { formatMinutes, sessionMinutes, signPhotos, requestTime } from "../_lib";
import { readRange } from "../_range";
import { loadTeamSessions } from "./_data";

export const metadata = { title: "Remote Attendance Report" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function RemoteTeamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireManager();
  const sp = await searchParams;
  const { from, to } = readRange(sp);
  const employeeId = typeof sp.employee === "string" && UUID.test(sp.employee) ? sp.employee : null;
  const supabase = await createClient();

  const [sessions, peopleRes] = await Promise.all([
    loadTeamSessions(me, from, to, employeeId),
    me.isHR
      ? supabase.from("employees").select("id, full_name, employee_code").neq("status", "exited").neq("id", me.id).order("full_name")
      : supabase.from("employees").select("id, full_name, employee_code").eq("manager_id", me.id).neq("status", "exited").order("full_name"),
  ]);
  const now = requestTime();

  // Per-employee summary
  type Row = { id: string; name: string; code: string; avatar: string | null; dept: string | null; days: Set<string>; sessions: number; minutes: number; last: string; online: boolean; noLocation: number };
  const rows = new Map<string, Row>();
  for (const s of sessions) {
    const e = s.employee;
    if (!e) continue;
    const r = rows.get(e.id) ?? { id: e.id, name: e.full_name ?? "", code: e.employee_code, avatar: e.avatar_url, dept: e.department?.name ?? null, days: new Set<string>(), sessions: 0, minutes: 0, last: s.check_in_at, online: false, noLocation: 0 };
    r.days.add(s.work_date);
    r.sessions += 1;
    r.minutes += sessionMinutes(s, now);
    if (s.check_in_at > r.last) r.last = s.check_in_at;
    if (!s.check_out_at) r.online = true;
    if (s.check_in_lat === null) r.noLocation += 1;
    rows.set(e.id, r);
  }
  const summary = [...rows.values()].sort((a, b) => b.minutes - a.minutes);
  const totalMinutes = summary.reduce((t, r) => t + r.minutes, 0);
  const onlineNow = summary.filter((r) => r.online).length;

  // Options: team + anyone who appears in the data
  const options = new Map<string, string>();
  for (const p of peopleRes.data ?? []) options.set(p.id, `${p.full_name} (${p.employee_code})`);
  for (const r of summary) options.set(r.id, `${r.name} (${r.code})`);

  const selected = employeeId ? summary.find((r) => r.id === employeeId) ?? null : null;
  const photos = employeeId ? await signPhotos(sessions.slice(0, 120).flatMap((s) => [s.check_in_photo, s.check_out_photo])) : {};
  const exportHref = `/attendance/remote/team/export?from=${from}&to=${to}${employeeId ? `&employee=${employeeId}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Remote Attendance Report"
        description={me.isHR ? "Remote check-ins across the organisation, with photos, locations and total hours." : "Remote check-ins from your team, with photos, locations and total hours."}
        breadcrumbs={[{ label: "Attendance", href: "/attendance" }, { label: "Remote Attendance Report" }]}
        actions={
          <a href={exportHref} className={buttonClass("outline")}>
            <Download className="h-4 w-4" /> Export CSV
          </a>
        }
      />

      <RangeFilter from={from} to={to} action="/attendance/remote/team">
        <div>
          <Label htmlFor="employee">Employee</Label>
          <Select id="employee" name="employee" defaultValue={employeeId ?? ""} className="w-64">
            <option value="">Everyone</option>
            {[...options.entries()].map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </RangeFilter>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total remote hours" value={formatMinutes(totalMinutes)} hint={`${formatDate(from, "dd MMM")} – ${formatDate(to, "dd MMM yyyy")}`} icon={Clock} tone="bg-amber-50 text-amber-600" />
        <StatCard label="People working remotely" value={summary.length} icon={Users} tone="bg-sky-50 text-sky-600" />
        <StatCard label="Sessions" value={sessions.length} icon={Laptop} tone="bg-violet-50 text-violet-600" />
        <StatCard label="Checked in right now" value={onlineNow} icon={Radio} tone="bg-emerald-50 text-emerald-600" />
      </div>

      {!employeeId ? (
        <Card className="overflow-hidden">
          <CardHeader title="Hours by employee" description="Open a row to see each check-in photo, time and location." />
          {summary.length === 0 ? (
            <EmptyState icon={Laptop} title="No remote check-ins in this period" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH>Days</TH>
                  <TH>Sessions</TH>
                  <TH>Total hours</TH>
                  <TH>Avg / day</TH>
                  <TH>Last check-in</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {summary.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/attendance/remote/team?from=${from}&to=${to}&employee=${r.id}`} className="flex items-center gap-3 hover:text-primary-600">
                        <Avatar name={r.name} src={r.avatar} size="sm" />
                        <span>
                          <span className="block font-medium text-slate-800">{r.name}</span>
                          <span className="block text-xs text-slate-500">
                            {r.code}
                            {r.dept ? ` · ${r.dept}` : ""}
                          </span>
                        </span>
                      </Link>
                    </TD>
                    <TD>{r.days.size}</TD>
                    <TD>{r.sessions}</TD>
                    <TD className="font-semibold text-slate-900">{formatMinutes(r.minutes)}</TD>
                    <TD>{formatMinutes(r.minutes / r.days.size)}</TD>
                    <TD className="whitespace-nowrap text-xs">{formatDateTime(r.last)}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {r.online ? <Badge tone="green">Working now</Badge> : <Badge tone="gray">Checked out</Badge>}
                        {r.noLocation > 0 && <Badge tone="yellow">{r.noLocation} without location</Badge>}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={selected ? `${selected.name} · ${formatMinutes(selected.minutes)} in ${selected.days.size} day${selected.days.size === 1 ? "" : "s"}` : "No sessions in this period"}
            action={
              <Link href={`/attendance/remote/team?from=${from}&to=${to}`} className={buttonClass("ghost", "sm")}>
                <ArrowLeft className="h-3.5 w-3.5" /> All employees
              </Link>
            }
          />
          <CardBody>
            {sessions.length === 0 ? (
              <EmptyState icon={Laptop} title="No remote check-ins for this person in this period" />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {sessions.map((s) => (
                  <SessionCard key={s.id} s={s} photos={photos} showDate />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
