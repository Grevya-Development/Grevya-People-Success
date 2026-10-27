"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { differenceInCalendarDays, isValid, parseISO } from "date-fns";
import { AlertTriangle, Loader2, Mail, Paperclip, ScrollText, Send, X } from "lucide-react";
import { Button, Input, Label, Select, Textarea, buttonClass } from "@/components/ui";
import { FormSection } from "./form-section";
import { cn, formatDate } from "@/lib/utils";
import { submitResignation } from "../actions";
import { ATTACHMENT_ACCEPT, ATTACHMENT_EXT, ATTACHMENT_MAX_BYTES, COMMENT_MAX, REASON_CATEGORIES } from "./shared";

type Props = {
  today: string;
  relievingDate: string;
  noticeDays: number;
  defaultEmail: string;
  defaultPhone: string;
};

type Errors = Partial<Record<"reason_category" | "reason" | "requested_last_day" | "correspondence_email" | "correspondence_phone" | "attachment" | "declaration", string>>;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p className="mt-1 text-xs text-red-600" role="alert">
      {children}
    </p>
  );
}

function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

export function ResignForm({ today, relievingDate, noticeDays, defaultEmail, defaultPhone }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [lastDay, setLastDay] = useState(relievingDate);
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});

  const d = parseISO(lastDay);
  const days = lastDay && isValid(d) ? differenceInCalendarDays(d, parseISO(today)) : null;
  const shortBy = isValid(d) ? differenceInCalendarDays(parseISO(relievingDate), d) : 0;
  const tooEarly = days !== null && days <= 0;
  const remaining = COMMENT_MAX - comment.length;

  function validate(form: HTMLFormElement): Errors {
    const fd = new FormData(form);
    const e: Errors = {};
    if (!String(fd.get("reason_category") ?? "")) e.reason_category = "Please select a reason for leaving.";
    if (!String(fd.get("reason") ?? "").trim()) e.reason = "Resignee comment is required.";
    if (!lastDay || days === null) e.requested_last_day = "Choose your requested last working day.";
    else if (tooEarly) e.requested_last_day = "Last working day must be after today.";
    const email = String(fd.get("correspondence_email") ?? "").trim();
    if (!email || !EMAIL_RE.test(email)) e.correspondence_email = "Enter a valid email address.";
    const phone = String(fd.get("correspondence_phone") ?? "").replace(/[\s-]/g, "");
    if (phone && !/^[0-9]{10}$/.test(phone)) e.correspondence_phone = "Enter a 10-digit mobile number.";
    if (file && (file.size > ATTACHMENT_MAX_BYTES || !ATTACHMENT_EXT.test(file.name))) e.attachment = "Attach a PDF, image or Word file up to 10 MB.";
    if (!fd.get("declaration")) e.declaration = "Please confirm the declaration to submit.";
    return e;
  }

  function onFile(f: File | null) {
    setFile(f);
    setErrors((prev) => ({
      ...prev,
      attachment: f && (f.size > ATTACHMENT_MAX_BYTES || !ATTACHMENT_EXT.test(f.name)) ? "Attach a PDF, image or Word file up to 10 MB." : undefined,
    }));
  }

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(ev) => {
        ev.preventDefault();
        const form = ev.currentTarget;
        const e = validate(form);
        setErrors(e);
        if (Object.values(e).some(Boolean)) {
          toast.error("Please fix the highlighted fields");
          form.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
          return;
        }
        const fd = new FormData(form);
        startTransition(async () => {
          const res = await submitResignation(null, fd);
          if (res?.ok) {
            toast.success(res.message ?? "Resignation submitted");
            if (res.redirectTo) router.push(res.redirectTo);
          } else if (res?.error) {
            toast.error(res.error);
          }
        });
      }}
    >
      <fieldset disabled={pending} aria-busy={pending} className="m-0 min-w-0 space-y-5 border-0 p-0">
        <FormSection step={2} title="Correspondence Info" icon={<Mail className="h-4 w-4 text-slate-400" />}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="correspondence_email" required>
                Correspondence Email
              </Label>
              <Input
                id="correspondence_email"
                name="correspondence_email"
                type="email"
                maxLength={254}
                defaultValue={defaultEmail}
                aria-invalid={Boolean(errors.correspondence_email)}
                className={cn(errors.correspondence_email && "border-red-400")}
              />
              <ErrorText>{errors.correspondence_email}</ErrorText>
            </div>
            <div>
              <Label htmlFor="correspondence_phone">Correspondence Number</Label>
              <div className="flex">
                <span className="inline-flex h-9 items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-600">
                  +91
                </span>
                <Input
                  id="correspondence_phone"
                  name="correspondence_phone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={12}
                  defaultValue={defaultPhone}
                  placeholder="10-digit mobile number"
                  aria-invalid={Boolean(errors.correspondence_phone)}
                  className={cn("rounded-l-none", errors.correspondence_phone && "border-red-400")}
                />
              </div>
              <ErrorText>{errors.correspondence_phone}</ErrorText>
            </div>
          </div>
        </FormSection>

        <FormSection step={3} title="Relieving Info" icon={<ScrollText className="h-4 w-4 text-slate-400" />}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="resignation_date">Date of Resignation</Label>
              <Input id="resignation_date" value={formatDate(today)} readOnly disabled />
            </div>
            <div>
              <Label htmlFor="reason_category" required>
                Reason for Leaving
              </Label>
              <Select
                id="reason_category"
                name="reason_category"
                defaultValue=""
                aria-invalid={Boolean(errors.reason_category)}
                className={cn(errors.reason_category && "border-red-400")}
                onChange={() => setErrors((p) => ({ ...p, reason_category: undefined }))}
              >
                <option value="">Select</option>
                {REASON_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <ErrorText>{errors.reason_category}</ErrorText>
            </div>

            <div>
              <Label htmlFor="attachment">Attachment</Label>
              <input
                ref={fileRef}
                id="attachment"
                name="attachment"
                type="file"
                accept={ATTACHMENT_ACCEPT}
                className="sr-only"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-lg border bg-white px-3 text-sm",
                    errors.attachment ? "border-red-400" : "border-slate-300",
                  )}
                >
                  <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-slate-700" title={file.name}>
                    {file.name}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{sizeLabel(file.size)}</span>
                  <button
                    type="button"
                    aria-label="Remove attachment"
                    className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    onClick={() => {
                      if (fileRef.current) fileRef.current.value = "";
                      onFile(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-9 w-full items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 text-sm text-slate-500 hover:border-primary-400 hover:text-primary-600"
                >
                  <Paperclip className="h-4 w-4" /> Choose file
                </button>
              )}
              {errors.attachment ? <ErrorText>{errors.attachment}</ErrorText> : <p className="mt-1 text-xs text-slate-500">Optional · PDF, image or Word, up to 10 MB</p>}
            </div>

            <div>
              <Label htmlFor="requested_last_day" required>
                Requested Last Working Day
              </Label>
              <Input
                id="requested_last_day"
                name="requested_last_day"
                type="date"
                min={today}
                value={lastDay}
                aria-invalid={Boolean(errors.requested_last_day) || tooEarly}
                className={cn((errors.requested_last_day || tooEarly) && "border-red-400")}
                onChange={(e) => {
                  setLastDay(e.target.value);
                  setErrors((p) => ({ ...p, requested_last_day: undefined }));
                }}
              />
              {errors.requested_last_day ? (
                <ErrorText>{errors.requested_last_day}</ErrorText>
              ) : tooEarly ? (
                <ErrorText>Last working day must be after today.</ErrorText>
              ) : (
                <p className="mt-1 text-xs text-slate-500">As per policy: {formatDate(relievingDate)}</p>
              )}
            </div>
          </div>

          {!tooEarly && days !== null && shortBy > 0 && (
            <div className="mt-4 flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-800" data-testid="short-notice">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Your requested last working day is <strong>{shortBy} days earlier</strong> than the relieving date as per policy (
                {formatDate(relievingDate)}, {noticeDays}-day notice). An early release is subject to manager and HR approval and may require
                notice-period recovery.
              </p>
            </div>
          )}

          <div className="mt-4">
            <Label htmlFor="reason" required>
              Resignee Comment
            </Label>
            <Textarea
              id="reason"
              name="reason"
              rows={5}
              maxLength={COMMENT_MAX}
              value={comment}
              aria-invalid={Boolean(errors.reason)}
              className={cn(errors.reason && "border-red-400")}
              onChange={(e) => {
                setComment(e.target.value);
                if (e.target.value.trim()) setErrors((p) => ({ ...p, reason: undefined }));
              }}
              placeholder="Share the context behind your decision. This is visible to your manager and HR."
            />
            <div className="mt-1 flex items-start justify-between gap-3">
              <ErrorText>{errors.reason}</ErrorText>
              <p className={cn("ml-auto shrink-0 text-xs", remaining < 100 ? "text-amber-700" : "text-slate-500")} data-testid="comment-counter">
                {remaining} characters remaining.
              </p>
            </div>
          </div>
        </FormSection>

        <FormSection step={4} title="Declaration" icon={null}>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              name="declaration"
              aria-invalid={Boolean(errors.declaration)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              onChange={(e) => e.target.checked && setErrors((p) => ({ ...p, declaration: undefined }))}
            />
            <span>
              I confirm that all the above submitted information by me is correct<span className="ml-0.5 text-red-500">*</span>
            </span>
          </label>
          <ErrorText>{errors.declaration}</ErrorText>
        </FormSection>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link href="/exit/status" className={buttonClass("outline")}>
            Back
          </Link>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
