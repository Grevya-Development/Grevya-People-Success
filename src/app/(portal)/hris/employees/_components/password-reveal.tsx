"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";

/** Shows a one-time password with a copy button. The password is never stored. */
export function PasswordReveal({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Email: ${email}\nTemporary password: ${password}`);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the text instead");
    }
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <KeyRound className="h-4 w-4" />
        Temporary login credentials
      </div>
      <p className="mt-1 text-xs text-amber-800">
        This password is shown only once. Share it securely — the employee should change it from Settings after signing in.
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
        <dt className="text-xs font-medium text-slate-500 sm:pt-1.5">Email</dt>
        <dd className="break-all rounded-md bg-white px-3 py-1.5 font-mono text-slate-800 ring-1 ring-amber-200">{email}</dd>
        <dt className="text-xs font-medium text-slate-500 sm:pt-1.5">Password</dt>
        <dd className="flex items-center gap-2">
          <span className="min-w-0 flex-1 select-all break-all rounded-md bg-white px-3 py-1.5 font-mono text-slate-900 ring-1 ring-amber-200">
            {password}
          </span>
          <button
            type="button"
            onClick={copy}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
            aria-label="Copy credentials"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </dd>
      </dl>
    </div>
  );
}
