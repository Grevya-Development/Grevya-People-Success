import { KeyRound, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils";
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, Input, Label, PageHeader, Select, StatCard, Table, TBody, TD, TH, THead, TR, buttonClass } from "@/components/ui";
import { AccountActions, RoleSelect } from "./_components/account-actions";

export const metadata = { title: "User Accounts & Roles" };

type Login = { lastSignIn: string | null; banned: boolean; confirmed: boolean };

const ROLE_INFO = [
  { role: "Super Admin", tone: "red" as const, text: "Everything HR can do, plus create and remove logins, reset passwords, disable accounts, and grant or remove admin roles." },
  { role: "HR Admin", tone: "purple" as const, text: "Manages all HR data: employees, letters, leave setup, payroll, reviews, exits, recruitment, helpdesk. Can't grant admin roles." },
  { role: "Manager", tone: "blue" as const, text: "Approves their team's leave, attendance, claims, goals and reviews. Anyone with direct reports gets this automatically." },
  { role: "Employee", tone: "gray" as const, text: "Self-service: profile, leave, attendance, payslips, claims, goals, learning and helpdesk." },
];

const ROLE_BADGE: Record<string, { label: string; tone: "red" | "purple" | "blue" | "gray" }> = {
  super_admin: { label: "Super Admin", tone: "red" },
  hr_admin: { label: "HR Admin", tone: "purple" },
  manager: { label: "Manager", tone: "blue" },
  employee: { label: "Employee", tone: "gray" },
};

async function loadLogins(): Promise<Map<string, Login>> {
  const admin = createAdminClient();
  const map = new Map<string, Login>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) break;
    for (const u of data.users) {
      const bannedUntil = (u as { banned_until?: string | null }).banned_until;
      map.set(u.id, {
        lastSignIn: u.last_sign_in_at ?? null,
        banned: !!bannedUntil && new Date(bannedUntil).getTime() > Date.now(),
        confirmed: !!u.email_confirmed_at,
      });
    }
    if (data.users.length < 1000) break;
  }
  return map;
}

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireSuperAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const roleFilter = sp.role ?? "";
  const loginFilter = sp.login ?? "";

  const admin = createAdminClient();
  const [{ data: employees }, logins] = await Promise.all([
    admin
      .from("employees")
      .select("id, full_name, employee_code, email, role, status, user_id, avatar_url, designation:designations(title), department:departments(name)")
      .order("full_name"),
    loadLogins(),
  ]);

  const rows = (employees ?? []).map((e) => {
    const login = e.user_id ? logins.get(e.user_id) ?? null : null;
    const loginState = !e.user_id || !login ? "none" : login.banned ? "disabled" : "active";
    return { ...e, login, loginState };
  });

  const filtered = rows.filter((r) => {
    if (q && !`${r.full_name} ${r.employee_code} ${r.email}`.toLowerCase().includes(q)) return false;
    if (roleFilter && r.role !== roleFilter) return false;
    if (loginFilter && r.loginState !== loginFilter) return false;
    return true;
  });

  const count = (fn: (r: (typeof rows)[number]) => boolean) => rows.filter(fn).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Accounts & Roles"
        description="Super Admin console — who can sign in to People Success and what they can do."
        breadcrumbs={[{ label: "HR Admin" }, { label: "User Accounts & Roles" }]}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="People" value={rows.length} hint={`${count((r) => r.status !== "exited")} active employees`} icon={Users} />
        <StatCard label="Active logins" value={count((r) => r.loginState === "active")} icon={UserCheck} tone="bg-emerald-50 text-emerald-600" />
        <StatCard label="Without login / disabled" value={`${count((r) => r.loginState === "none")} / ${count((r) => r.loginState === "disabled")}`} icon={UserX} tone="bg-amber-50 text-amber-600" />
        <StatCard
          label="Admins"
          value={count((r) => r.role === "super_admin" || r.role === "hr_admin")}
          hint={`${count((r) => r.role === "super_admin")} Super · ${count((r) => r.role === "hr_admin")} HR`}
          icon={ShieldCheck}
          tone="bg-red-50 text-red-600"
        />
      </div>

      <Card>
        <CardHeader title="Roles" description="What each role can do. Role changes take effect on the person's next page load." />
        <CardBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ROLE_INFO.map((r) => (
            <div key={r.role} className="rounded-lg border border-slate-100 p-3">
              <Badge tone={r.tone}>{r.role}</Badge>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">{r.text}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/80 bg-white p-4">
        <div className="min-w-[220px] flex-1">
          <Label htmlFor="q">Search</Label>
          <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Name, employee ID or email" />
        </div>
        <div>
          <Label htmlFor="role">Role</Label>
          <Select id="role" name="role" defaultValue={roleFilter} className="w-40">
            <option value="">All roles</option>
            <option value="super_admin">Super Admin</option>
            <option value="hr_admin">HR Admin</option>
            <option value="manager">Manager</option>
            <option value="employee">Employee</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="login">Login</Label>
          <Select id="login" name="login" defaultValue={loginFilter} className="w-40">
            <option value="">Any</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
            <option value="none">No login</option>
          </Select>
        </div>
        <button type="submit" className={buttonClass("primary")}>
          Filter
        </button>
      </form>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={KeyRound} title="No people match these filters" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Employee</TH>
                <TH>Role</TH>
                <TH>Login</TH>
                <TH>Last sign-in</TH>
                <TH className="text-right">Account actions</TH>
              </tr>
            </THead>
            <TBody>
              {filtered.map((r) => {
                const badge = ROLE_BADGE[r.role] ?? ROLE_BADGE.employee;
                return (
                  <TR key={r.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={r.full_name} src={r.avatar_url} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">
                            {r.full_name}
                            {r.id === me.id && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {r.employee_code} · {r.email}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {(r.designation as { title: string } | null)?.title ?? "—"}
                            {(r.department as { name: string } | null)?.name ? ` · ${(r.department as { name: string }).name}` : ""}
                            {r.status !== "active" && <span className="ml-1 text-amber-600">· {r.status.replace("_", " ")}</span>}
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <div className="space-y-1">
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                        <RoleSelect employeeId={r.id} name={r.full_name ?? ""} role={r.role} isSelf={r.id === me.id} />
                      </div>
                    </TD>
                    <TD>
                      {r.loginState === "active" && <Badge tone="green">Active</Badge>}
                      {r.loginState === "disabled" && <Badge tone="red">Disabled</Badge>}
                      {r.loginState === "none" && <Badge tone="gray">No login</Badge>}
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-slate-500">{r.login?.lastSignIn ? formatDateTime(r.login.lastSignIn) : r.user_id ? "Never" : "—"}</TD>
                    <TD>
                      <AccountActions
                        employeeId={r.id}
                        name={r.full_name ?? ""}
                        email={r.email}
                        role={r.role}
                        hasLogin={r.loginState !== "none"}
                        disabled={r.loginState === "disabled"}
                        isSelf={r.id === me.id}
                        exited={r.status === "exited"}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
