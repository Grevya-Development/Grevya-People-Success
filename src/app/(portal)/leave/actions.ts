"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str, num, bool, orgToday } from "@/lib/utils";
import { addDays, computeLeaveDays, diffDays, fmtNum, isISODate } from "./_lib/dates";
import { getHolidays } from "./_lib/data";

const MAX_BACKDATE_DAYS = 30;
const MAX_LEAVE_SPAN = 90;

function revalidateLeave() {
  revalidatePath("/leave", "layout");
  revalidatePath("/home");
  revalidatePath("/attendance", "layout");
}

// ---------------------------------------------------------------------------
// Employee: apply / cancel
// ---------------------------------------------------------------------------

export async function applyLeave(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");

  const typeId = str(fd, "leave_type_id");
  const start = str(fd, "start_date");
  const end = str(fd, "end_date") ?? start;
  const halfDay = bool(fd, "half_day");
  const session = str(fd, "half_day_session");
  const reason = str(fd, "reason");

  if (!typeId) return fail("Choose a leave type");
  if (!isISODate(start) || !isISODate(end)) return fail("Enter valid start and end dates");
  if (end < start) return fail("End date cannot be before the start date");
  const today = orgToday();
  if (start < addDays(today, -MAX_BACKDATE_DAYS)) return fail(`Leave can be backdated by at most ${MAX_BACKDATE_DAYS} days`);
  if (diffDays(start, end) + 1 > MAX_LEAVE_SPAN) return fail(`A single request can cover at most ${MAX_LEAVE_SPAN} days`);
  if (start.slice(0, 4) !== end.slice(0, 4)) return fail("Leave cannot span two calendar years — please apply separately for each year");
  if (!reason || reason.length < 3) return fail("Please give a reason (at least 3 characters)");
  if (reason.length > 1000) return fail("Reason is too long (max 1000 characters)");

  const supabase = await createClient();
  const { data: type } = await supabase.from("leave_types").select("*").eq("id", typeId).eq("active", true).maybeSingle();
  if (!type) return fail("This leave type is not available");

  if (halfDay) {
    if (!type.allow_half_day) return fail(`${type.name} cannot be taken as a half day`);
    if (start !== end) return fail("Half day is only allowed for a single-day leave");
    if (session !== "first" && session !== "second") return fail("Choose the half-day session");
  }

  const holidays = await getHolidays(supabase, start, end, me.location_id);
  const calc = computeLeaveDays(start, end, holidays, halfDay);
  if (calc.days <= 0) return fail("The selected dates fall on weekends or holidays — no working days to apply for");

  // Overlap with my pending / approved leave
  const { data: overlaps, error: ovErr } = await supabase
    .from("leave_requests")
    .select("id, start_date, end_date, half_day, half_day_session")
    .eq("employee_id", me.id)
    .in("status", ["pending", "approved"])
    .lte("start_date", end)
    .gte("end_date", start);
  if (ovErr) return fail(dbError(ovErr));
  const clash = (overlaps ?? []).find(
    (o) => !(halfDay && o.half_day && o.start_date === start && o.end_date === end && o.half_day_session !== session),
  );
  if (clash) return fail("You already have a leave request overlapping these dates");

  // Balance (unpaid types such as LOP are not limited)
  if (type.is_paid) {
    const year = Number(start.slice(0, 4));
    const [{ data: bal }, { data: pending }] = await Promise.all([
      supabase.from("leave_balances").select("allocated, used").eq("employee_id", me.id).eq("leave_type_id", type.id).eq("year", year).maybeSingle(),
      supabase
        .from("leave_requests")
        .select("days")
        .eq("employee_id", me.id)
        .eq("leave_type_id", type.id)
        .eq("status", "pending")
        .gte("start_date", `${year}-01-01`)
        .lte("start_date", `${year}-12-31`),
    ]);
    const available = Number(bal?.allocated ?? 0) - Number(bal?.used ?? 0) - (pending ?? []).reduce((s, p) => s + Number(p.days), 0);
    if (calc.days > available) {
      return fail(`Insufficient ${type.name} balance: ${fmtNum(Math.max(available, 0))} available, ${fmtNum(calc.days)} requested`);
    }
  }

  const { error } = await supabase.from("leave_requests").insert({
    employee_id: me.id,
    leave_type_id: type.id,
    start_date: start,
    end_date: end,
    half_day: halfDay,
    half_day_session: halfDay ? session : null,
    days: calc.days,
    reason,
    status: "pending",
  });
  if (error) return fail(dbError(error));
  revalidateLeave();
  return ok(`${type.name} for ${fmtNum(calc.days)} day(s) submitted for approval`, "/leave/details");
}

export async function cancelLeave(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const id = str(fd, "id");
  if (!id) return fail("Missing request");
  const supabase = await createClient();
  const { data: req } = await supabase.from("leave_requests").select("id, employee_id, status, start_date").eq("id", id).maybeSingle();
  if (!req || req.employee_id !== me.id) return fail("Leave request not found");
  const today = orgToday();
  const cancellable = req.status === "pending" || (req.status === "approved" && req.start_date > today);
  if (!cancellable) return fail("Only pending leave, or approved leave that has not started, can be cancelled");
  const { data, error } = await supabase
    .from("leave_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", req.status)
    .select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("This request was already updated — refresh and try again");
  revalidateLeave();
  return ok("Leave cancelled");
}

// ---------------------------------------------------------------------------
// Manager / HR: approve / reject (single or bulk)
// ---------------------------------------------------------------------------

export async function decideLeaves(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isManager) return fail("Only managers and HR can action leave requests");
  const decision = str(fd, "decision");
  if (decision !== "approve" && decision !== "reject") return fail("Invalid decision");
  const ids = [...new Set(fd.getAll("id").filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (!ids.length) return fail("Select at least one request");
  if (ids.length > 200) return fail("Too many requests selected at once");
  const remarks = str(fd, "remarks");
  if (decision === "reject" && !remarks) return fail("Please add remarks when rejecting");
  if (remarks && remarks.length > 500) return fail("Remarks are too long (max 500 characters)");

  const supabase = await createClient();
  const { data: rows, error: readErr } = await supabase
    .from("leave_requests")
    .select("id, employee_id, leave_type_id, start_date, days, status, type:leave_types(name, is_paid)")
    .in("id", ids);
  if (readErr) return fail(dbError(readErr));

  let done = 0;
  const problems: string[] = [];
  for (const r of rows ?? []) {
    if (r.employee_id === me.id) {
      problems.push("You cannot action your own leave");
      continue;
    }
    if (r.status !== "pending") {
      problems.push("Some requests were already actioned");
      continue;
    }
    const type = r.type as { name: string; is_paid: boolean } | null;
    if (decision === "approve" && type?.is_paid) {
      const { data: bal } = await supabase
        .from("leave_balances")
        .select("allocated, used")
        .eq("employee_id", r.employee_id)
        .eq("leave_type_id", r.leave_type_id)
        .eq("year", Number(r.start_date.slice(0, 4)))
        .maybeSingle();
      const left = Number(bal?.allocated ?? 0) - Number(bal?.used ?? 0);
      if (Number(r.days) > left) {
        problems.push(`Insufficient ${type.name} balance for one request`);
        continue;
      }
    }
    const { data: upd, error } = await supabase
      .from("leave_requests")
      .update({
        status: decision === "approve" ? "approved" : "rejected",
        approver_id: me.id,
        approver_remarks: remarks,
        actioned_at: new Date().toISOString(),
      })
      .eq("id", r.id)
      .eq("status", "pending")
      .select("id");
    if (error) problems.push(dbError(error));
    else if (!upd?.length) problems.push("You are not allowed to action one of the requests");
    else done++;
  }
  if ((rows?.length ?? 0) < ids.length) problems.push("Some requests were not found");

  revalidateLeave();
  if (!done) return fail([...new Set(problems)].join(". ") || "Nothing was updated");
  const verb = decision === "approve" ? "approved" : "rejected";
  const msg = `${done} request${done === 1 ? "" : "s"} ${verb}`;
  return ok(problems.length ? `${msg}. Skipped: ${[...new Set(problems)].join("; ")}` : msg);
}

// ---------------------------------------------------------------------------
// HR: leave types
// ---------------------------------------------------------------------------

async function hrContext() {
  const me = await getCurrentEmployee();
  if (!me) return { error: fail("Not signed in") } as const;
  if (!me.isHR) return { error: fail("Only HR can do that") } as const;
  return { me, supabase: await createClient() } as const;
}

export async function saveLeaveType(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return ctx.error!;
  const id = str(fd, "id");
  const code = str(fd, "code")?.toUpperCase();
  const name = str(fd, "name");
  const quota = num(fd, "annual_quota") ?? 0;
  const color = str(fd, "color") ?? "#f97316";
  const sort = num(fd, "sort_order") ?? 0;
  if (!code || !/^[A-Z0-9_]{1,10}$/.test(code)) return fail("Code must be 1–10 letters, digits or underscores");
  if (!name || name.length > 60) return fail("Name is required (max 60 characters)");
  if (quota < 0 || quota > 365 || (quota * 2) % 1 !== 0) return fail("Annual quota must be between 0 and 365 in steps of 0.5");
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return fail("Pick a valid colour");
  const row = {
    code,
    name,
    annual_quota: quota,
    is_paid: bool(fd, "is_paid"),
    carry_forward: bool(fd, "carry_forward"),
    allow_half_day: bool(fd, "allow_half_day"),
    active: bool(fd, "active"),
    color,
    sort_order: Math.round(sort),
  };
  const { error } = id ? await ctx.supabase.from("leave_types").update(row).eq("id", id) : await ctx.supabase.from("leave_types").insert(row);
  if (error) return fail(error.code === "23505" ? `A leave type with code ${code} already exists` : dbError(error));
  revalidateLeave();
  return ok(id ? "Leave type updated" : "Leave type created");
}

export async function deleteLeaveType(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return ctx.error!;
  const id = str(fd, "id");
  if (!id) return fail("Missing leave type");
  const { count } = await ctx.supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("leave_type_id", id);
  if (count) {
    const { error } = await ctx.supabase.from("leave_types").update({ active: false }).eq("id", id);
    if (error) return fail(dbError(error));
    revalidateLeave();
    return ok("This type has leave history, so it was deactivated instead of deleted");
  }
  const { error } = await ctx.supabase.from("leave_types").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidateLeave();
  return ok("Leave type deleted");
}

// ---------------------------------------------------------------------------
// HR: balances
// ---------------------------------------------------------------------------

export async function allocateBalances(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return ctx.error!;
  const year = num(fd, "year");
  const typeId = str(fd, "leave_type_id") ?? "all";
  const mode = str(fd, "mode") === "missing" ? "missing" : "overwrite";
  if (!year || year < 2000 || year > 2100) return fail("Choose a valid year");

  let tq = ctx.supabase.from("leave_types").select("id, annual_quota, code").eq("active", true);
  if (typeId !== "all") tq = tq.eq("id", typeId);
  const { data: types } = await tq;
  const quotaTypes = (types ?? []).filter((t) => Number(t.annual_quota) > 0);
  if (!quotaTypes.length) return fail("No active leave types with an annual quota to allocate");

  const { data: emps } = await ctx.supabase.from("employees").select("id").neq("status", "exited");
  if (!emps?.length) return fail("No active employees found");

  const rows = emps.flatMap((e) => quotaTypes.map((t) => ({ employee_id: e.id, leave_type_id: t.id, year, allocated: Number(t.annual_quota) })));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await ctx.supabase
      .from("leave_balances")
      .upsert(rows.slice(i, i + 500), { onConflict: "employee_id,leave_type_id,year", ignoreDuplicates: mode === "missing" });
    if (error) return fail(dbError(error));
  }
  revalidateLeave();
  return ok(`Allocated ${quotaTypes.length} leave type(s) for ${year} to ${emps.length} employee(s)`);
}

export async function adjustBalance(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return ctx.error!;
  const employeeId = str(fd, "employee_id");
  const typeId = str(fd, "leave_type_id");
  const year = num(fd, "year");
  const allocated = num(fd, "allocated");
  if (!employeeId || !typeId) return fail("Choose an employee and leave type");
  if (!year || year < 2000 || year > 2100) return fail("Choose a valid year");
  if (allocated === null || allocated < 0 || allocated > 365 || (allocated * 2) % 1 !== 0) return fail("Allocation must be between 0 and 365 in steps of 0.5");
  const { error } = await ctx.supabase
    .from("leave_balances")
    .upsert({ employee_id: employeeId, leave_type_id: typeId, year, allocated }, { onConflict: "employee_id,leave_type_id,year" });
  if (error) return fail(dbError(error));
  revalidateLeave();
  return ok("Balance updated");
}

// ---------------------------------------------------------------------------
// HR: holidays
// ---------------------------------------------------------------------------

export async function saveHoliday(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return ctx.error!;
  const id = str(fd, "id");
  const name = str(fd, "name");
  const date = str(fd, "date");
  const type = str(fd, "type") === "optional" ? "optional" : "public";
  const locationId = str(fd, "location_id");
  if (!name || name.length > 80) return fail("Holiday name is required (max 80 characters)");
  if (!isISODate(date)) return fail("Enter a valid date");
  const row = { name, date, type, location_id: locationId };
  const { error } = id ? await ctx.supabase.from("holidays").update(row).eq("id", id) : await ctx.supabase.from("holidays").insert(row);
  if (error) return fail(error.code === "23505" ? "A holiday with this name already exists on that date" : dbError(error));
  revalidateLeave();
  return ok(id ? "Holiday updated" : "Holiday added");
}

export async function deleteHoliday(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await hrContext();
  if ("error" in ctx) return ctx.error!;
  const id = str(fd, "id");
  if (!id) return fail("Missing holiday");
  const { error } = await ctx.supabase.from("holidays").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidateLeave();
  return ok("Holiday deleted");
}
