"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, Lock, Unlock, UserPlus, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/form";
import { changeRole, createLogin, removeLogin, resetPassword, setLoginEnabled, type AccountResult } from "../actions";

type Props = {
  employeeId: string;
  name: string;
  email: string;
  role: string;
  hasLogin: boolean;
  disabled: boolean;
  isSelf: boolean;
  exited: boolean;
};

const ROLE_OPTIONS = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "hr_admin", label: "HR Admin" },
  { value: "super_admin", label: "Super Admin" },
];

export function RoleSelect({ employeeId, name, role, isSelf }: Pick<Props, "employeeId" | "name" | "role" | "isSelf">) {
  const [value, setValue] = useState(role);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label={`Role for ${name}`}
        value={value}
        disabled={pending || isSelf}
        title={isSelf ? "You can't change your own role" : undefined}
        className="h-8 w-36 text-xs"
        onChange={(e) => {
          const next = e.target.value;
          if ((next === "hr_admin" || next === "super_admin") && !window.confirm(`Give ${name} ${next === "super_admin" ? "Super Admin" : "HR Admin"} access? They will be able to see and manage everyone's HR data.`)) {
            return;
          }
          const prev = value;
          setValue(next);
          const fd = new FormData();
          fd.set("employee_id", employeeId);
          fd.set("role", next);
          startTransition(async () => {
            const res = await changeRole(null, fd);
            if (res?.ok) toast.success(res.message ?? "Role updated");
            else {
              setValue(prev);
              toast.error(res?.error ?? "Couldn't change role");
            }
          });
        }}
      >
        {ROLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
    </div>
  );
}

export function AccountActions({ employeeId, name, email, hasLogin, disabled, isSelf, exited }: Props) {
  const [pending, startTransition] = useTransition();
  const [secret, setSecret] = useState<{ email: string; password: string; title: string } | null>(null);

  const run = (action: (p: AccountResult, fd: FormData) => Promise<AccountResult>, extra: Record<string, string> = {}, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    const fd = new FormData();
    fd.set("employee_id", employeeId);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    startTransition(async () => {
      const res = await action(null, fd);
      if (res?.ok) {
        if (res.password) setSecret({ email: res.email ?? email, password: res.password, title: res.message ?? "Login details" });
        else toast.success(res.message ?? "Done");
      } else toast.error(res?.error ?? "Something went wrong");
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {pending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      {!hasLogin ? (
        <Button size="sm" variant="primary" disabled={pending || exited} onClick={() => run(createLogin)} title={exited ? "Employee has exited" : undefined}>
          <UserPlus className="h-3.5 w-3.5" /> Create login
        </Button>
      ) : (
        <>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(resetPassword, {}, `Reset ${name}'s password? Their current password will stop working.`)}>
            <KeyRound className="h-3.5 w-3.5" /> Reset password
          </Button>
          {disabled ? (
            <Button size="sm" variant="success" disabled={pending} onClick={() => run(setLoginEnabled, { enable: "true" })}>
              <Unlock className="h-3.5 w-3.5" /> Enable
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={pending || isSelf} onClick={() => run(setLoginEnabled, { enable: "false" }, `Disable ${name}'s login? They will be signed out and unable to sign in until re-enabled.`)}>
              <Lock className="h-3.5 w-3.5" /> Disable
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" disabled={pending || isSelf} onClick={() => run(removeLogin, {}, `Remove ${name}'s login completely? Their employee record and history are kept; you can create a new login later.`)}>
            <UserX className="h-3.5 w-3.5" /> Remove
          </Button>
        </>
      )}

      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)} title={secret?.title ?? ""} description="Share these details securely. The password is shown only once." size="sm">
        {secret && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="text-xs text-slate-500">Email</p>
              <p className="font-medium text-slate-800">{secret.email}</p>
              <p className="mt-2 text-xs text-slate-500">Temporary password</p>
              <p className="font-mono text-base font-semibold tracking-wide text-slate-900">{secret.password}</p>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                navigator.clipboard
                  .writeText(`People Success login\nEmail: ${secret.email}\nPassword: ${secret.password}`)
                  .then(() => toast.success("Copied to clipboard"))
                  .catch(() => toast.error("Copy failed — select the text instead"));
              }}
            >
              <Copy className="h-4 w-4" /> Copy login details
            </Button>
            <p className="text-xs text-slate-500">Ask them to change it from Settings after signing in.</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}
