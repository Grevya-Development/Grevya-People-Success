import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, ShieldCheck, ShieldOff, UserRound, Users } from "lucide-react";
import { requireHR } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Avatar, Badge, Card, CardBody, CardHeader, PageHeader, StatusBadge } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/utils";
import { EmployeeForm } from "../../_components/employee-form";
import { LoginPanel } from "../../_components/login-panel";
import { loadFormOptions } from "../../_data";
import { ROLE_LABELS, UUID_RE } from "../../_lib";

export const metadata: Metadata = { title: "Edit Employee" };

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  await requireHR();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const { data: emp } = await supabase
    .from("employees")
    .select("*, designation:designations(title), department:departments(name)")
    .eq("id", id)
    .maybeSingle();
  if (!emp) notFound();

  const [options, reports] = await Promise.all([
    loadFormOptions(emp.id),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("manager_id", emp.id).neq("status", "exited"),
  ]);

  let authInfo: { email: string | null; lastSignIn: string | null } | null = null;
  if (emp.user_id) {
    const { data } = await createAdminClient().auth.admin.getUserById(emp.user_id);
    authInfo = { email: data.user?.email ?? null, lastSignIn: data.user?.last_sign_in_at ?? null };
  }

  const designation = (emp.designation as { title: string } | null)?.title;
  const department = (emp.department as { name: string } | null)?.name;

  return (
    <div>
      <PageHeader
        title="Edit Employee"
        breadcrumbs={[{ label: "HRIS", href: "/hris" }, { label: "Employee List", href: "/hris/employees" }, { label: emp.full_name ?? emp.employee_code }]}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="order-2 lg:order-1">
          <EmployeeForm
            mode="edit"
            options={options}
            values={{
              id: emp.id,
              first_name: emp.first_name,
              last_name: emp.last_name,
              email: emp.email,
              employee_code: emp.employee_code,
              phone: emp.phone,
              gender: emp.gender,
              date_of_birth: emp.date_of_birth,
              date_of_joining: emp.date_of_joining,
              department_id: emp.department_id,
              designation_id: emp.designation_id,
              location_id: emp.location_id,
              manager_id: emp.manager_id,
              role: emp.role,
              status: emp.status,
              employment_type: emp.employment_type,
            }}
          />
        </div>

        <aside className="order-1 space-y-5 lg:order-2">
          <Card className="overflow-hidden">
            <div className="h-14 bg-[#5b74d6]" />
            <CardBody className="-mt-10 text-center">
              <Avatar name={emp.full_name} src={emp.avatar_url} size="xl" className="mx-auto ring-4" />
              <p className="mt-2 font-semibold text-slate-900">{emp.full_name}</p>
              <p className="text-xs text-slate-500">
                {emp.employee_code}
                {designation ? ` | ${designation}` : ""}
              </p>
              {department && <p className="text-xs text-slate-500">{department}</p>}
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                <StatusBadge status={emp.status} />
                <Badge tone={emp.role === "hr_admin" ? "purple" : emp.role === "manager" ? "blue" : "gray"}>{ROLE_LABELS[emp.role] ?? emp.role}</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-left text-xs">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-slate-500">Joined</dt>
                  <dd className="font-medium text-slate-800">{formatDate(emp.date_of_joining)}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-slate-500">Direct reports</dt>
                  <dd className="font-medium text-slate-800">{reports.count ?? 0}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Login access" />
            <CardBody className="space-y-3">
              {emp.user_id ? (
                <div className="flex items-start gap-2 text-sm">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">Login active</p>
                    <p className="break-all text-xs text-slate-500">{authInfo?.email ?? emp.email}</p>
                    <p className="text-xs text-slate-500">
                      Last sign-in: {authInfo?.lastSignIn ? formatDateTime(authInfo.lastSignIn) : "never"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-sm">
                  <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div>
                    <p className="font-medium text-slate-800">No login yet</p>
                    <p className="text-xs text-slate-500">The employee can&apos;t sign in until a login is created.</p>
                  </div>
                </div>
              )}
              <LoginPanel employeeId={emp.id} hasLogin={!!emp.user_id} disabled={emp.status === "exited"} />
              {emp.status === "exited" && <p className="text-xs text-slate-500">Logins can&apos;t be issued to exited employees.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-1 py-3">
              <Link href={`/profile?id=${emp.id}`} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <UserRound className="h-4 w-4 text-[#3753b8]" />
                Full profile (personal, bank, education)
                <ExternalLink className="ml-auto h-3.5 w-3.5 text-slate-400" />
              </Link>
              <Link href={`/directory/${emp.id}`} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <Users className="h-4 w-4 text-[#3753b8]" />
                Directory card
                <ExternalLink className="ml-auto h-3.5 w-3.5 text-slate-400" />
              </Link>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
