"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { Button, buttonClass, Card, CardBody } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import type { EmployeeResult } from "../_lib";
import { PasswordReveal } from "./password-reveal";

type Step = { ok: boolean | null; label: React.ReactNode; detail?: React.ReactNode };

/** Success screen after adding an employee: what was set up, and what's next. */
export function CreatedSummary({ result, onAddAnother }: { result: NonNullable<EmployeeResult>; onAddAnother: () => void }) {
  const s = result.summary ?? {};
  const steps: Step[] = [{ ok: true, label: "Employee record and private profile" }];

  if (s.leave) {
    const full = s.leave.months >= 12;
    steps.push({
      ok: true,
      label: full ? `Leave balances for ${s.leave.year}` : `Leave for ${s.leave.year}, prorated for ${s.leave.months} of 12 months`,
      detail: s.leave.balances.length ? s.leave.balances.map((b) => `${b.code} ${b.allocated}${full ? "" : ` of ${b.annual}`}`).join(" · ") : undefined,
    });
  }
  steps.push({
    ok: (s.onboardingTasks ?? 0) > 0 ? true : null,
    label: (s.onboardingTasks ?? 0) > 0 ? `Onboarding checklist with ${s.onboardingTasks} tasks` : "No onboarding checklist (joining date is more than 30 days ago)",
    detail: (s.onboardingTasks ?? 0) > 0 ? "The manager has been notified about their tasks." : "You can start one from HR Admin → Onboarding.",
  });
  if ((s.onboardingTasks ?? 0) > 0) {
    steps.push(
      s.itRequest
        ? {
            ok: true,
            label: (
              <>
                IT setup request{" "}
                {s.itRequest.url ? (
                  <a href={s.itRequest.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary-600 hover:underline">
                    {s.itRequest.label}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="font-semibold">{s.itRequest.label}</span>
                )}{" "}
                opened in the Service Desk
              </>
            ),
            detail: "Laptop, accounts and access. The checklist ticks itself off when IT resolves it.",
          }
        : { ok: null, label: "IT setup request not opened", detail: "The Service Desk isn't connected, or the joining date has passed. Tick the IT task off by hand." },
    );
  }
  steps.push({
    ok: true,
    label: s.probationEnd ? `Probation until ${formatDate(s.probationEnd)}` : "No probation",
    detail: s.probationEnd ? "HR and the manager get a reminder 14 days before it ends." : undefined,
  });
  if (result.login) {
    steps.push({ ok: true, label: "Login created", detail: "They'll choose their own password on first sign-in." });
    if (s.welcome)
      steps.push(
        s.welcome.sent
          ? { ok: true, label: `Welcome email sent to ${s.welcome.to}` }
          : { ok: false, label: `Welcome email not sent to ${s.welcome.to}`, detail: `${s.welcome.reason}. Share the details below yourself.` },
      );
    else steps.push({ ok: null, label: "No welcome email", detail: "Share the login details below with the joinee." });
  } else {
    steps.push({ ok: null, label: "No login yet", detail: "Create one from the employee page when they're ready." });
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <CardBody className="space-y-5 py-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">{result.message}</h2>
            <p className="mt-0.5 text-sm text-slate-500">Here&apos;s what was set up.</p>
          </div>
        </div>

        <ul className="space-y-3">
          {steps.map((st, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              {st.ok === true ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : st.ok === false ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
              )}
              <div className="min-w-0">
                <p className="text-slate-800">{st.label}</p>
                {st.detail && <p className="text-xs text-slate-500">{st.detail}</p>}
              </div>
            </li>
          ))}
        </ul>

        {result.login && <PasswordReveal email={result.login.email} password={result.login.password} />}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onAddAnother}>
            Add another
          </Button>
          <Link href={`/hris/employees/${result.employeeId}/edit`} className={buttonClass("outline")}>
            Open employee
          </Link>
          {(s.onboardingTasks ?? 0) > 0 && (
            <Link href={`/onboarding/${result.employeeId}`} className={buttonClass("primary")}>
              Open onboarding checklist
            </Link>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
