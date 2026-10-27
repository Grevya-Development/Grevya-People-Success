"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { setEmployeeLogin } from "../actions";
import { PasswordReveal } from "./password-reveal";

/** "Create / reset login" — sets a temporary password and shows it exactly once. */
export function LoginPanel({ employeeId, hasLogin, disabled }: { employeeId: string; hasLogin: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) setCreds(null); // forget the password as soon as the dialog closes
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("id", employeeId);
    startTransition(async () => {
      const res = await setEmployeeLogin(null, fd);
      if (res?.ok && res.login) {
        toast.success(res.message ?? "Login is ready");
        setCreds(res.login);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Could not set the login");
      }
    });
  };

  return (
    <>
      <Button variant={hasLogin ? "outline" : "primary"} disabled={disabled} onClick={() => setOpen(true)} className="w-full">
        <KeyRound className="h-4 w-4" />
        {hasLogin ? "Reset password" : "Create login"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={hasLogin && !creds ? "Reset login password" : creds ? "Login credentials" : "Create login"}
        description={creds ? undefined : "A temporary password will be set and shown once."}
      >
        {creds ? (
          <div className="space-y-4">
            <PasswordReveal email={creds.email} password={creds.password} />
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Temporary password" htmlFor="login-password" hint="Leave blank to generate a strong password. Minimum 8 characters.">
              <Input id="login-password" name="password" type="text" autoComplete="new-password" minLength={8} maxLength={72} autoFocus />
            </Field>
            {hasLogin && <p className="text-xs text-slate-500">The employee&apos;s current password will stop working immediately.</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {hasLogin ? "Reset password" : "Create login"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
