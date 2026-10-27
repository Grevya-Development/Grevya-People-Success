"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee, type CurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str, num } from "@/lib/utils";
import { GOAL_CATEGORIES, EDITABLE_STATUSES, WEIGHTED_STATUSES, isPhase } from "./_components/shared";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidatePerformance() {
  revalidatePath("/performance", "layout");
}

function id(fd: FormData, key = "id") {
  const v = str(fd, key);
  return v && UUID_RE.test(v) ? v : null;
}

function isDate(v: string | null): v is string {
  return !!v && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));
}

function intRating(fd: FormData, key: string): number | null | "invalid" {
  const v = num(fd, key);
  if (v === null) return null;
  if (!Number.isInteger(v) || v < 1 || v > 5) return "invalid";
  return v;
}

// ---------------------------------------------------------------------------
// Goal fields shared by create / edit / assign
// ---------------------------------------------------------------------------

type GoalFields = {
  title: string;
  description: string | null;
  category: string;
  weightage: number;
  target: string | null;
  due_date: string | null;
  cycle_id: string;
  parent_goal_id: string | null;
};

async function parseGoalFields(
  supabase: Supabase,
  me: CurrentEmployee,
  fd: FormData,
  owner: { id: string; manager_id: string | null },
  excludeGoalId?: string,
): Promise<{ error: string } | { values: GoalFields }> {
  const title = str(fd, "title");
  const description = str(fd, "description");
  const category = str(fd, "category");
  const weightage = num(fd, "weightage");
  const target = str(fd, "target");
  const dueDate = str(fd, "due_date");
  const cycleId = id(fd, "cycle_id");
  const parentId = str(fd, "parent_goal_id") ? id(fd, "parent_goal_id") : null;

  if (!title || title.length < 3) return { error: "Title must be at least 3 characters" };
  if (title.length > 200) return { error: "Title is too long (max 200 characters)" };
  if (description && description.length > 4000) return { error: "Description is too long" };
  if (!category || !GOAL_CATEGORIES.some((c) => c.value === category)) return { error: "Choose a category" };
  if (weightage === null) return { error: "Weightage is required" };
  if (weightage <= 0 || weightage > 100) return { error: "Weightage must be between 1 and 100" };
  if (Math.round(weightage * 100) !== weightage * 100) return { error: "Weightage can have at most 2 decimals" };
  if (target && target.length > 1000) return { error: "Target / KPI is too long" };
  if (dueDate && !isDate(dueDate)) return { error: "Invalid due date" };
  if (!cycleId) return { error: "Choose a review cycle" };
  if (str(fd, "parent_goal_id") && !parentId) return { error: "Invalid parent goal" };

  const { data: cycle } = await supabase.from("review_cycles").select("id, status, start_date, end_date").eq("id", cycleId).maybeSingle();
  if (!cycle) return { error: "Review cycle not found" };
  if (cycle.status === "closed") return { error: "This review cycle is closed" };
  if (cycle.status === "draft" && !me.isHR) return { error: "This review cycle has not opened yet" };
  if (dueDate && dueDate < cycle.start_date) return { error: "Due date cannot be before the cycle starts" };

  if (parentId) {
    if (parentId === excludeGoalId) return { error: "A goal cannot be aligned to itself" };
    const { data: parent } = await supabase.from("goals").select("id, employee_id, status").eq("id", parentId).maybeSingle();
    if (!parent) return { error: "Parent goal not found" };
    const allowed = parent.employee_id === null || (owner.manager_id !== null && parent.employee_id === owner.manager_id);
    if (!allowed) return { error: "Goals can only be aligned to organisation objectives or the manager's goals" };
    if (parent.status === "rejected" || parent.status === "draft") return { error: "That goal is not open for alignment" };
  }

  // Weightage across the owner's live goals in the cycle must not exceed 100
  let q = supabase.from("goals").select("weightage, status").eq("employee_id", owner.id).eq("cycle_id", cycleId).in("status", WEIGHTED_STATUSES);
  if (excludeGoalId) q = q.neq("id", excludeGoalId);
  const { data: others, error } = await q;
  if (error) return { error: dbError(error) };
  const used = (others ?? []).reduce((s, g) => s + Number(g.weightage || 0), 0);
  if (used + weightage > 100.001) {
    return { error: `Total weightage would be ${+(used + weightage).toFixed(2)}%. Only ${+Math.max(0, 100 - used).toFixed(2)}% is left in this cycle.` };
  }

  return {
    values: {
      title,
      description,
      category,
      weightage,
      target,
      due_date: dueDate,
      cycle_id: cycleId,
      parent_goal_id: parentId,
    },
  };
}

async function loadOwnGoal(supabase: Supabase, me: CurrentEmployee, goalId: string | null) {
  if (!goalId) return null;
  const { data } = await supabase.from("goals").select("*").eq("id", goalId).eq("employee_id", me.id).maybeSingle();
  return data;
}

// ---------------------------------------------------------------------------
// My goals
// ---------------------------------------------------------------------------

export async function createGoal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (me.status === "exited") return fail("Your profile is no longer active");
  const supabase = await createClient();
  const parsed = await parseGoalFields(supabase, me, fd, { id: me.id, manager_id: me.manager_id });
  if ("error" in parsed) return fail(parsed.error);
  const submit = str(fd, "intent") === "submit";

  const { error } = await supabase.from("goals").insert({
    ...parsed.values,
    employee_id: me.id,
    created_by: me.id,
    status: submit ? "pending_approval" : "draft",
  });
  if (error) return fail(dbError(error));
  revalidatePerformance();
  return ok(submit ? "Goal submitted for approval" : "Goal saved as draft", `/performance/goals?cycle=${parsed.values.cycle_id}`);
}

export async function updateGoal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const supabase = await createClient();
  const goal = await loadOwnGoal(supabase, me, id(fd));
  if (!goal) return fail("Goal not found");
  if (!EDITABLE_STATUSES.includes(goal.status)) return fail("Only draft, pending or rejected goals can be edited");
  const parsed = await parseGoalFields(supabase, me, fd, { id: me.id, manager_id: me.manager_id }, goal.id);
  if ("error" in parsed) return fail(parsed.error);
  const submit = str(fd, "intent") === "submit";

  const { data, error } = await supabase
    .from("goals")
    .update({ ...parsed.values, status: submit ? "pending_approval" : "draft" })
    .eq("id", goal.id)
    .eq("status", goal.status)
    .select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("This goal was changed by someone else. Refresh and try again.");
  revalidatePerformance();
  return ok(submit ? "Goal submitted for approval" : "Goal saved as draft");
}

export async function deleteGoal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const supabase = await createClient();
  const goal = await loadOwnGoal(supabase, me, id(fd));
  if (!goal) return fail("Goal not found");
  if (goal.status !== "draft" && goal.status !== "rejected") return fail("Only draft or rejected goals can be deleted");
  const { data, error } = await supabase.from("goals").delete().eq("id", goal.id).in("status", ["draft", "rejected"]).select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Goal could not be deleted");
  revalidatePerformance();
  return ok("Goal deleted", str(fd, "redirect") === "list" ? "/performance/goals" : undefined);
}

export async function submitGoal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const supabase = await createClient();
  const goal = await loadOwnGoal(supabase, me, id(fd));
  if (!goal) return fail("Goal not found");
  if (goal.status !== "draft" && goal.status !== "rejected") return fail("Only draft or rejected goals can be submitted");
  if (goal.cycle_id) {
    const { data: cycle } = await supabase.from("review_cycles").select("status").eq("id", goal.cycle_id).maybeSingle();
    if (cycle?.status === "closed") return fail("This review cycle is closed");
  }
  if (Number(goal.weightage) <= 0) return fail("Set a weightage before submitting");
  if (goal.status === "rejected" && goal.cycle_id) {
    // A rejected goal stops counting towards the cycle total, so re-check before it comes back
    const { data: others, error: wErr } = await supabase
      .from("goals")
      .select("weightage")
      .eq("employee_id", me.id)
      .eq("cycle_id", goal.cycle_id)
      .in("status", WEIGHTED_STATUSES)
      .neq("id", goal.id);
    if (wErr) return fail(dbError(wErr));
    const used = (others ?? []).reduce((s, g) => s + Number(g.weightage || 0), 0);
    if (used + Number(goal.weightage) > 100.001) {
      return fail(`Total weightage would be ${+(used + Number(goal.weightage)).toFixed(2)}%. Edit the goal and lower its weightage (${+Math.max(0, 100 - used).toFixed(2)}% left).`);
    }
  }
  const { data, error } = await supabase.from("goals").update({ status: "pending_approval" }).eq("id", goal.id).eq("status", goal.status).select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("This goal was changed by someone else. Refresh and try again.");
  revalidatePerformance();
  return ok("Goal submitted for approval");
}

export async function recallGoal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const supabase = await createClient();
  const goal = await loadOwnGoal(supabase, me, id(fd));
  if (!goal) return fail("Goal not found");
  if (goal.status !== "pending_approval") return fail("Only goals awaiting approval can be recalled");
  const { data, error } = await supabase.from("goals").update({ status: "draft" }).eq("id", goal.id).eq("status", "pending_approval").select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("This goal has already been actioned");
  revalidatePerformance();
  return ok("Goal moved back to draft");
}

export async function updateProgress(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const progress = num(fd, "progress");
  const comment = str(fd, "comment");
  if (progress === null || !Number.isInteger(progress) || progress < 0 || progress > 100) return fail("Progress must be a whole number from 0 to 100");
  if (!comment || comment.length < 3) return fail("Add a short comment describing the progress");
  if (comment.length > 2000) return fail("Comment is too long");
  const supabase = await createClient();
  const goal = await loadOwnGoal(supabase, me, id(fd));
  if (!goal) return fail("Goal not found");
  if (goal.status !== "approved") return fail("Progress can only be updated on approved goals");

  const { error: upErr } = await supabase.from("goal_updates").insert({ goal_id: goal.id, author_id: me.id, progress, comment });
  if (upErr) return fail(dbError(upErr));
  const { error } = await supabase.from("goals").update({ progress }).eq("id", goal.id).eq("status", "approved");
  if (error) return fail(dbError(error));
  revalidatePerformance();
  return ok(progress === 100 ? "Progress updated — you can now mark the goal completed" : "Progress updated");
}

export async function completeGoal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const remarks = str(fd, "remarks");
  if (remarks && remarks.length > 2000) return fail("Comment is too long");
  const supabase = await createClient();
  const goal = await loadOwnGoal(supabase, me, id(fd));
  if (!goal) return fail("Goal not found");
  if (goal.status !== "approved") return fail("Only approved goals can be marked completed");

  const { data, error } = await supabase.from("goals").update({ status: "completed", progress: 100 }).eq("id", goal.id).eq("status", "approved").select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("This goal was changed by someone else. Refresh and try again.");
  await supabase.from("goal_updates").insert({ goal_id: goal.id, author_id: me.id, progress: 100, comment: remarks ?? "Marked the goal as completed" });
  revalidatePerformance();
  return ok("Goal marked as completed");
}

// ---------------------------------------------------------------------------
// Team goals (manager)
// ---------------------------------------------------------------------------

export async function addGoalComment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const comment = str(fd, "comment") ?? str(fd, "remarks");
  if (!comment || comment.length < 2) return fail("Write a comment");
  if (comment.length > 2000) return fail("Comment is too long");
  const goalId = id(fd);
  if (!goalId) return fail("Goal not found");
  const supabase = await createClient();
  const { data: goal } = await supabase.from("goals").select("id, employee_id").eq("id", goalId).maybeSingle();
  if (!goal || !goal.employee_id) return fail("Goal not found");
  if (goal.employee_id !== me.id) {
    const { data: allowed } = await supabase.rpc("can_approve_for", { emp: goal.employee_id });
    if (!allowed) return fail("You can only comment on your own or your team's goals");
  }
  const { error } = await supabase.from("goal_updates").insert({ goal_id: goal.id, author_id: me.id, comment, progress: null });
  if (error) return fail(dbError(error));
  revalidatePerformance();
  return ok("Comment added");
}

export async function decideGoal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isManager) return fail("Only managers can approve goals");
  const decision = str(fd, "decision");
  const remarks = str(fd, "remarks");
  if (decision !== "approve" && decision !== "reject") return fail("Invalid decision");
  if (decision === "reject" && (!remarks || remarks.length < 3)) return fail("Add remarks explaining the rejection");
  if (remarks && remarks.length > 2000) return fail("Remarks are too long");
  const goalId = id(fd);
  if (!goalId) return fail("Goal not found");

  const supabase = await createClient();
  const { data: goal } = await supabase.from("goals").select("id, employee_id, status").eq("id", goalId).maybeSingle();
  if (!goal || !goal.employee_id) return fail("Goal not found");
  if (goal.employee_id === me.id) return fail("You cannot approve your own goal");
  const { data: allowed } = await supabase.rpc("can_approve_for", { emp: goal.employee_id });
  if (!allowed) return fail("You can only action goals of your team");
  if (goal.status !== "pending_approval") return fail("This goal is no longer awaiting approval");

  const { data, error } = await supabase
    .from("goals")
    .update({
      status: decision === "approve" ? "approved" : "rejected",
      approver_id: me.id,
      approver_remarks: remarks,
      actioned_at: new Date().toISOString(),
    })
    .eq("id", goal.id)
    .eq("status", "pending_approval")
    .select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("This goal has already been actioned");
  revalidatePerformance();
  return ok(decision === "approve" ? "Goal approved" : "Goal rejected");
}

export async function assignGoal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isManager) return fail("Only managers can assign goals");
  const employeeId = id(fd, "employee_id");
  if (!employeeId) return fail("Choose a team member");
  if (employeeId === me.id) return fail("Use Create new Goal for your own goals");

  const supabase = await createClient();
  const { data: emp } = await supabase.from("employees").select("id, manager_id, status, full_name").eq("id", employeeId).maybeSingle();
  if (!emp) return fail("Employee not found");
  if (emp.status === "exited") return fail("This employee has exited");
  const { data: allowed } = await supabase.rpc("can_approve_for", { emp: emp.id });
  if (!allowed) return fail("You can only assign goals to your team");

  const parsed = await parseGoalFields(supabase, me, fd, { id: emp.id, manager_id: emp.manager_id });
  if ("error" in parsed) return fail(parsed.error);

  const { error } = await supabase.from("goals").insert({
    ...parsed.values,
    employee_id: emp.id,
    created_by: me.id,
    approver_id: me.id,
    status: "approved",
    actioned_at: new Date().toISOString(),
  });
  if (error) return fail(dbError(error));
  revalidatePerformance();
  return ok(`Goal assigned to ${emp.full_name ?? "employee"}`);
}

// ---------------------------------------------------------------------------
// Organisation objectives (HR)
// ---------------------------------------------------------------------------

export async function saveObjective(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can manage organisation objectives");
  const objectiveId = str(fd, "id") ? id(fd) : null;
  if (str(fd, "id") && !objectiveId) return fail("Objective not found");
  const title = str(fd, "title");
  const description = str(fd, "description");
  const target = str(fd, "target");
  const dueDate = str(fd, "due_date");
  const cycleId = str(fd, "cycle_id") ? id(fd, "cycle_id") : null;
  const progress = num(fd, "progress") ?? 0;
  const status = str(fd, "status") ?? "approved";

  if (!title || title.length < 3) return fail("Title must be at least 3 characters");
  if (title.length > 200) return fail("Title is too long");
  if (description && description.length > 4000) return fail("Description is too long");
  if (target && target.length > 1000) return fail("Target is too long");
  if (dueDate && !isDate(dueDate)) return fail("Invalid due date");
  if (str(fd, "cycle_id") && !cycleId) return fail("Invalid review cycle");
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) return fail("Progress must be 0–100");
  if (status !== "approved" && status !== "completed") return fail("Invalid status");

  const supabase = await createClient();
  if (cycleId) {
    const { data: cycle } = await supabase.from("review_cycles").select("id").eq("id", cycleId).maybeSingle();
    if (!cycle) return fail("Review cycle not found");
  }
  const values = {
    title,
    description,
    target,
    due_date: dueDate,
    cycle_id: cycleId,
    progress: status === "completed" ? 100 : progress,
    status,
  };

  if (objectiveId) {
    const { data, error } = await supabase.from("goals").update(values).eq("id", objectiveId).is("employee_id", null).select("id");
    if (error) return fail(dbError(error));
    if (!data?.length) return fail("Objective not found");
  } else {
    const { error } = await supabase.from("goals").insert({
      ...values,
      employee_id: null,
      category: "organisation",
      weightage: 0,
      created_by: me.id,
      approver_id: me.id,
      actioned_at: new Date().toISOString(),
    });
    if (error) return fail(dbError(error));
  }
  revalidatePerformance();
  return ok(objectiveId ? "Objective updated" : "Objective created");
}

export async function deleteObjective(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can manage organisation objectives");
  const objectiveId = id(fd);
  if (!objectiveId) return fail("Objective not found");
  const supabase = await createClient();
  const { data, error } = await supabase.from("goals").delete().eq("id", objectiveId).is("employee_id", null).select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Objective not found");
  revalidatePerformance();
  return ok("Objective deleted");
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export async function saveSelfReview(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const reviewId = id(fd);
  if (!reviewId) return fail("Review not found");
  const submit = str(fd, "intent") === "submit";
  const rating = intRating(fd, "self_rating");
  const comments = str(fd, "self_comments");
  const strengths = str(fd, "self_strengths");
  const improvements = str(fd, "self_improvements");
  if (rating === "invalid") return fail("Rating must be between 1 and 5");
  for (const [label, v] of [["Comments", comments], ["Strengths", strengths], ["Areas to improve", improvements]] as const) {
    if (v && v.length > 4000) return fail(`${label} is too long (max 4000 characters)`);
  }
  if (submit) {
    if (rating === null) return fail("Give yourself an overall rating before submitting");
    if (!comments || comments.length < 10) return fail("Add overall comments (at least 10 characters) before submitting");
  }

  const supabase = await createClient();
  const { data: review } = await supabase
    .from("reviews")
    .select("id, status, cycle:review_cycles!cycle_id(status)")
    .eq("id", reviewId)
    .eq("employee_id", me.id)
    .maybeSingle();
  if (!review) return fail("Review not found");
  if (review.status !== "pending_self") return fail("Your self-assessment has already been submitted");
  const cycleStatus = (review.cycle as { status: string } | null)?.status;
  if (cycleStatus === "closed") return fail("This review cycle is closed");

  const { data, error } = await supabase
    .from("reviews")
    .update({
      self_rating: rating,
      self_comments: comments,
      self_strengths: strengths,
      self_improvements: improvements,
      ...(submit ? { status: "pending_manager", self_submitted_at: new Date().toISOString() } : {}),
    })
    .eq("id", review.id)
    .eq("status", "pending_self")
    .select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Your self-assessment has already been submitted");
  revalidatePerformance();
  return ok(submit ? "Self-assessment submitted to your manager" : "Draft saved");
}

export async function saveManagerReview(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isManager) return fail("Only managers can review their team");
  const reviewId = id(fd);
  if (!reviewId) return fail("Review not found");
  const complete = str(fd, "intent") === "complete";
  const managerRating = intRating(fd, "manager_rating");
  const finalRating = intRating(fd, "final_rating");
  const comments = str(fd, "manager_comments");
  if (managerRating === "invalid" || finalRating === "invalid") return fail("Ratings must be between 1 and 5");
  if (comments && comments.length > 4000) return fail("Comments are too long (max 4000 characters)");
  if (complete) {
    if (managerRating === null) return fail("Give a manager rating");
    if (!comments || comments.length < 10) return fail("Add manager comments (at least 10 characters)");
    if (finalRating === null) return fail("Give a final rating");
  }

  const supabase = await createClient();
  const { data: review } = await supabase
    .from("reviews")
    .select("id, employee_id, status, cycle:review_cycles!cycle_id(status)")
    .eq("id", reviewId)
    .maybeSingle();
  if (!review) return fail("Review not found");
  if (review.employee_id === me.id) return fail("You cannot review yourself");
  const { data: allowed } = await supabase.rpc("can_approve_for", { emp: review.employee_id });
  if (!allowed) return fail("You can only review your team");
  if (review.status === "completed") return fail("This review is already completed");
  if (complete && review.status !== "pending_manager") return fail("The employee has not submitted their self-assessment yet");
  const cycleStatus = (review.cycle as { status: string } | null)?.status;
  if (cycleStatus === "closed" && !me.isHR) return fail("This review cycle is closed");

  const { data, error } = await supabase
    .from("reviews")
    .update({
      manager_rating: managerRating,
      manager_comments: comments,
      final_rating: finalRating,
      reviewer_id: me.id,
      ...(complete ? { status: "completed", completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", review.id)
    .eq("status", review.status)
    .select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("This review was changed by someone else. Refresh and try again.");
  revalidatePerformance();
  return ok(complete ? "Review completed" : "Review draft saved", complete ? "/performance/team-reviews" : undefined);
}

// ---------------------------------------------------------------------------
// Review cycles (HR)
// ---------------------------------------------------------------------------

export async function saveCycle(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can manage review cycles");
  const cycleId = str(fd, "id") ? id(fd) : null;
  if (str(fd, "id") && !cycleId) return fail("Cycle not found");
  const name = str(fd, "name");
  const start = str(fd, "start_date");
  const end = str(fd, "end_date");
  const status = str(fd, "status") ?? "draft";
  if (!name || name.length < 3) return fail("Name must be at least 3 characters");
  if (name.length > 120) return fail("Name is too long");
  if (!isDate(start) || !isDate(end)) return fail("Start and end dates are required");
  if (end <= start) return fail("End date must be after the start date");
  if (!isPhase(status)) return fail("Invalid phase");

  const supabase = await createClient();
  const { data: dup } = await supabase.from("review_cycles").select("id").ilike("name", name).maybeSingle();
  if (dup && dup.id !== cycleId) return fail("A cycle with this name already exists");

  if (cycleId) {
    const { data, error } = await supabase.from("review_cycles").update({ name, start_date: start, end_date: end, status }).eq("id", cycleId).select("id");
    if (error) return fail(dbError(error));
    if (!data?.length) return fail("Cycle not found");
  } else {
    const { error } = await supabase.from("review_cycles").insert({ name, start_date: start, end_date: end, status });
    if (error) return fail(dbError(error));
  }
  revalidatePerformance();
  return ok(cycleId ? "Cycle updated" : "Cycle created");
}

export async function setCyclePhase(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can manage review cycles");
  const cycleId = id(fd);
  const status = str(fd, "status");
  if (!cycleId) return fail("Cycle not found");
  if (!isPhase(status)) return fail("Invalid phase");
  const supabase = await createClient();
  const { data, error } = await supabase.from("review_cycles").update({ status }).eq("id", cycleId).select("name");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Cycle not found");
  revalidatePerformance();
  return ok(`${data[0].name} moved to ${status.replace("_", " ")}`);
}

export async function deleteCycle(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can manage review cycles");
  const cycleId = id(fd);
  if (!cycleId) return fail("Cycle not found");
  const supabase = await createClient();
  const [{ count: reviews }, { count: goals }] = await Promise.all([
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("cycle_id", cycleId),
    supabase.from("goals").select("id", { count: "exact", head: true }).eq("cycle_id", cycleId),
  ]);
  if ((reviews ?? 0) > 0 || (goals ?? 0) > 0) return fail("This cycle already has goals or reviews — close it instead of deleting");
  const { data, error } = await supabase.from("review_cycles").delete().eq("id", cycleId).select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Cycle not found");
  revalidatePerformance();
  return ok("Cycle deleted");
}

export async function launchReviews(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can launch reviews");
  const cycleId = id(fd);
  if (!cycleId) return fail("Cycle not found");
  const supabase = await createClient();
  const { data: cycle } = await supabase.from("review_cycles").select("id, name, status").eq("id", cycleId).maybeSingle();
  if (!cycle) return fail("Cycle not found");
  if (cycle.status === "closed") return fail("This cycle is closed");
  if (cycle.status === "draft") return fail("Open the cycle (goal setting or in review) before launching reviews");

  const [{ data: emps, error: empErr }, { data: existing, error: revErr }] = await Promise.all([
    supabase.from("employees").select("id, manager_id").eq("status", "active"),
    supabase.from("reviews").select("employee_id").eq("cycle_id", cycleId),
  ]);
  if (empErr || revErr) return fail(dbError(empErr ?? revErr));
  const have = new Set((existing ?? []).map((r) => r.employee_id));
  const rows = (emps ?? []).filter((e) => !have.has(e.id)).map((e) => ({ cycle_id: cycleId, employee_id: e.id, reviewer_id: e.manager_id }));

  if (rows.length > 0) {
    const { error } = await supabase.from("reviews").upsert(rows, { onConflict: "cycle_id,employee_id", ignoreDuplicates: true });
    if (error) return fail(dbError(error));
  }
  // Launching reviews moves the cycle from goal setting into the review phase
  const moved = cycle.status === "goal_setting";
  if (moved) {
    const { error } = await supabase.from("review_cycles").update({ status: "in_review" }).eq("id", cycle.id).eq("status", "goal_setting");
    if (error) return fail(dbError(error));
  }
  revalidatePerformance();
  if (rows.length === 0) return ok(`Every active employee already has a review in this cycle${moved ? " · cycle moved to In review" : ""}`);
  return ok(`Launched ${rows.length} review${rows.length === 1 ? "" : "s"} for ${cycle.name}${moved ? " · cycle moved to In review" : ""}`);
}
