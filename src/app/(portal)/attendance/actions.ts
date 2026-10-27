"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str, num, orgToday } from "@/lib/utils";
import { addDays, formatHours, hhmmToMinutes, hoursBetween, isISODate, istMinutes, istTimestamp, isWeekend, longDate } from "../leave/_lib/dates";
import { getHolidays } from "../leave/_lib/data";

const REGULARIZATION_WINDOW = 30;
const COMPOFF_WINDOW = 60;
const REG_TYPES = ["missed_punch", "wfh", "on_duty", "wrong_punch"] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function revalidateAttendance() {
  revalidatePath("/home");
  revalidatePath("/attendance", "layout");
}

// ---------------------------------------------------------------------------
// Punch in / out
// ---------------------------------------------------------------------------

export async function punchIn(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (me.status === "exited") return fail("Your account is inactive");
  const mode = str(fd, "work_mode") === "remote" ? "remote" : "office";
  const today = orgToday();
  const now = new Date().toISOString();
  const supabase = await createClient();

  const { data: existing, error: readErr } = await supabase
    .from("attendance_records")
    .select("id, check_in, source")
    .eq("employee_id", me.id)
    .eq("date", today)
    .maybeSingle();
  if (readErr) return fail(dbError(readErr));
  if (existing?.check_in) return fail("You have already checked in today");

  const row = { check_in: now, status: mode === "remote" ? "wfh" : "present", work_mode: mode, source: "web" };
  const { error } = existing
    ? await supabase.from("attendance_records").update(row).eq("id", existing.id)
    : await supabase.from("attendance_records").insert({ ...row, employee_id: me.id, date: today });
  if (error) return fail(error.code === "23505" ? "You have already checked in today" : dbError(error));

  revalidateAttendance();
  return ok(mode === "remote" ? "Checked in — working remotely today" : "Checked in. Have a great day!");
}

export async function punchOut(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  void _fd;
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const today = orgToday();
  const supabase = await createClient();
  const { data: rec, error: readErr } = await supabase
    .from("attendance_records")
    .select("id, check_in, check_out")
    .eq("employee_id", me.id)
    .eq("date", today)
    .maybeSingle();
  if (readErr) return fail(dbError(readErr));
  if (!rec?.check_in) return fail("You haven't checked in today");
  if (rec.check_out) return fail("You have already checked out today");

  const now = new Date().toISOString();
  const { data, error } = await supabase.from("attendance_records").update({ check_out: now }).eq("id", rec.id).is("check_out", null).select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Couldn't check out — please refresh and try again");

  revalidateAttendance();
  return ok(`Checked out · ${formatHours(hoursBetween(rec.check_in, now))} worked today`);
}

// ---------------------------------------------------------------------------
// Regularization
// ---------------------------------------------------------------------------

export async function submitRegularization(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const date = str(fd, "date");
  const type = str(fd, "request_type");
  const inT = str(fd, "check_in");
  const outT = str(fd, "check_out");
  const reason = str(fd, "reason");
  const today = orgToday();

  if (!isISODate(date)) return fail("Choose a valid date");
  if (date > today) return fail("You can't regularize a future date");
  if (date < addDays(today, -REGULARIZATION_WINDOW)) return fail(`Only the last ${REGULARIZATION_WINDOW} days can be regularized`);
  if (me.date_of_joining && date < me.date_of_joining) return fail("That date is before your joining date");
  if (!type || !(REG_TYPES as readonly string[]).includes(type)) return fail("Choose a request type");
  if (!inT || !outT || !HHMM.test(inT) || !HHMM.test(outT)) return fail("Enter valid check-in and check-out times");
  if (hhmmToMinutes(outT) <= hhmmToMinutes(inT)) return fail("Check-out must be after check-in");
  if (date === today && hhmmToMinutes(outT) > istMinutes(new Date().toISOString())) return fail("Check-out time can't be in the future");
  if (!reason || reason.length < 3) return fail("Please give a reason (at least 3 characters)");
  if (reason.length > 500) return fail("Reason is too long (max 500 characters)");

  const supabase = await createClient();
  const [{ data: dup }, { data: leave }] = await Promise.all([
    supabase.from("regularization_requests").select("id").eq("employee_id", me.id).eq("date", date).eq("status", "pending").limit(1),
    supabase
      .from("leave_requests")
      .select("id")
      .eq("employee_id", me.id)
      .eq("status", "approved")
      .eq("half_day", false)
      .lte("start_date", date)
      .gte("end_date", date)
      .limit(1),
  ]);
  if (dup?.length) return fail("You already have a pending regularization for this date");
  if (leave?.length) return fail("You are on approved leave that day — cancel the leave first if you worked");

  const { error } = await supabase.from("regularization_requests").insert({
    employee_id: me.id,
    date,
    request_type: type,
    check_in: istTimestamp(date, inT),
    check_out: istTimestamp(date, outT),
    reason,
    status: "pending",
  });
  if (error) return fail(dbError(error));
  revalidateAttendance();
  return ok(`Regularization for ${longDate(date)} sent for approval`, "/attendance/regularization");
}

export async function cancelRegularization(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const id = str(fd, "id");
  if (!id) return fail("Missing request");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("regularization_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("employee_id", me.id)
    .eq("status", "pending")
    .select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Only your pending requests can be cancelled");
  revalidateAttendance();
  return ok("Regularization cancelled");
}

// ---------------------------------------------------------------------------
// Comp-off
// ---------------------------------------------------------------------------

export async function applyCompoff(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const date = str(fd, "worked_date");
  const days = num(fd, "days");
  const reason = str(fd, "reason");
  const today = orgToday();

  if (!isISODate(date)) return fail("Choose the date you worked");
  if (date > today) return fail("The worked date can't be in the future");
  if (date < addDays(today, -COMPOFF_WINDOW)) return fail(`Comp-off must be claimed within ${COMPOFF_WINDOW} days`);
  if (days !== 0.5 && days !== 1) return fail("Days must be 0.5 or 1");
  if (!reason || reason.length < 3) return fail("Please describe the work done (at least 3 characters)");
  if (reason.length > 500) return fail("Reason is too long (max 500 characters)");

  const supabase = await createClient();
  if (!isWeekend(date)) {
    const hol = await getHolidays(supabase, date, date, me.location_id);
    if (!hol.length) return fail("Comp-off can only be claimed for work on a weekend or holiday");
  }
  const { data: dup } = await supabase
    .from("compoff_requests")
    .select("id")
    .eq("employee_id", me.id)
    .eq("worked_date", date)
    .in("status", ["pending", "approved"])
    .limit(1);
  if (dup?.length) return fail("You already have a comp-off request for this date");

  const { error } = await supabase.from("compoff_requests").insert({ employee_id: me.id, worked_date: date, days, reason, status: "pending" });
  if (error) return fail(dbError(error));
  revalidateAttendance();
  return ok("Comp-off request submitted");
}

export async function cancelCompoff(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const id = str(fd, "id");
  if (!id) return fail("Missing request");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("compoff_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("employee_id", me.id)
    .eq("status", "pending")
    .select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Only your pending requests can be cancelled");
  revalidateAttendance();
  return ok("Comp-off request cancelled");
}

// ---------------------------------------------------------------------------
// Manager / HR decisions (single or bulk)
// ---------------------------------------------------------------------------

async function parseDecision(fd: FormData) {
  const me = await getCurrentEmployee();
  if (!me) return { error: fail("Not signed in") } as const;
  if (!me.isManager) return { error: fail("Only managers and HR can approve requests") } as const;
  const decision = str(fd, "decision");
  if (decision !== "approve" && decision !== "reject") return { error: fail("Invalid decision") } as const;
  const ids = [...new Set(fd.getAll("id").filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (!ids.length) return { error: fail("Select at least one request") } as const;
  if (ids.length > 200) return { error: fail("Too many requests selected at once") } as const;
  const remarks = str(fd, "remarks");
  if (decision === "reject" && !remarks) return { error: fail("Please add remarks when rejecting") } as const;
  if (remarks && remarks.length > 500) return { error: fail("Remarks are too long (max 500 characters)") } as const;
  return {
    me,
    ids,
    decision,
    patch: {
      status: decision === "approve" ? "approved" : "rejected",
      approver_id: me.id,
      approver_remarks: remarks,
      actioned_at: new Date().toISOString(),
    },
  } as const;
}

function decisionResult(updated: number, requested: number, decision: string) {
  if (!updated) return fail("Nothing was updated — the requests may already be actioned or are outside your team");
  const msg = `${updated} request${updated === 1 ? "" : "s"} ${decision === "approve" ? "approved" : "rejected"}`;
  return ok(updated < requested ? `${msg} (${requested - updated} skipped)` : msg);
}

export async function decideRegularizations(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await parseDecision(fd);
  if ("error" in ctx) return ctx.error!;
  const supabase = await createClient();
  // RLS limits updates to the approver's chain; never your own requests.
  const { data, error } = await supabase
    .from("regularization_requests")
    .update(ctx.patch)
    .in("id", ctx.ids)
    .eq("status", "pending")
    .neq("employee_id", ctx.me.id)
    .select("id");
  if (error) return fail(dbError(error));
  revalidateAttendance();
  return decisionResult(data?.length ?? 0, ctx.ids.length, ctx.decision);
}

export async function decideCompoffs(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await parseDecision(fd);
  if ("error" in ctx) return ctx.error!;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("compoff_requests")
    .update(ctx.patch)
    .in("id", ctx.ids)
    .eq("status", "pending")
    .neq("employee_id", ctx.me.id)
    .select("id");
  if (error) return fail(dbError(error));
  revalidateAttendance();
  revalidatePath("/leave", "layout");
  return decisionResult(data?.length ?? 0, ctx.ids.length, ctx.decision);
}
