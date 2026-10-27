import Link from "next/link";
import type { Metadata } from "next";
import { KeyRound, LogOut, ShieldCheck, UserCog } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, Field, Input, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ActionButton } from "@/components/ui/action-button";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { AvatarUploader } from "../profile/_components/avatar-uploader";
import { ROLE_LABELS } from "../profile/_lib/shared";
import { changePassword, signOutEverywhere } from "./actions";

export const metadata: Metadata = { title: "Settings" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2.5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="break-all text-sm text-slate-800 sm:text-right">{children}</span>
    </div>
  );
}

export default async function SettingsPage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const name = me.full_name ?? me.first_name;

  return (
    <div>
      <PageHeader title="Settings" description="Manage your account, password and sessions." breadcrumbs={[{ label: "Home", href: "/home" }, { label: "Settings" }]} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <UserCog className="h-4 w-4 text-[#3753b8]" /> Account
              </span>
            }
          />
          <CardBody className="py-2">
            <Row label="Name">{name}</Row>
            <Row label="Sign-in email">{user?.email ?? me.email}</Row>
            <Row label="Employee code">{me.employee_code}</Row>
            <Row label="Role">
              <Badge tone={me.role === "super_admin" ? "red" : me.role === "hr_admin" ? "purple" : me.role === "manager" ? "blue" : "gray"}>{ROLE_LABELS[me.role] ?? me.role}</Badge>
            </Row>
            <Row label="Last sign-in">{formatDateTime(user?.last_sign_in_at)}</Row>
            <Row label="Account created">{formatDateTime(user?.created_at)}</Row>
            <p className="pt-2 text-[11px] text-slate-400">
              To change your official email or role, contact HR. Personal details can be edited on{" "}
              <Link href="/profile" className="text-[#3753b8] hover:underline">
                My Profile
              </Link>
              .
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Profile Photo" description="JPG, PNG, WEBP or GIF up to 2 MB." />
          <CardBody>
            <AvatarUploader employeeId={me.id} name={name} src={me.avatar_url} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-[#3753b8]" /> Change Password
              </span>
            }
            description="At least 8 characters with letters and numbers."
          />
          <CardBody>
            <ActionForm action={changePassword} successMessage="Password changed" className="space-y-4">
              <Field label="Current password" htmlFor="current_password" required>
                <Input id="current_password" name="current_password" type="password" autoComplete="current-password" required />
              </Field>
              <Field label="New password" htmlFor="new_password" required>
                <Input id="new_password" name="new_password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
              </Field>
              <Field label="Confirm new password" htmlFor="confirm_password" required>
                <Input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
              </Field>
              <div className="flex justify-end">
                <SubmitButton>Update password</SubmitButton>
              </div>
            </ActionForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#3753b8]" /> Sessions &amp; Security
              </span>
            }
          />
          <CardBody>
            <p className="text-sm text-slate-600">
              Signed in on a shared or lost device? Sign out everywhere to end every active session, including this one. You&apos;ll need to
              sign in again.
            </p>
            <div className="mt-4">
              <ActionButton
                action={signOutEverywhere}
                confirm="Sign out of all devices?"
                variant="danger"
                size="md"
                successMessage="Signed out of all devices"
              >
                <LogOut className="h-4 w-4" /> Sign out of all devices
              </ActionButton>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
