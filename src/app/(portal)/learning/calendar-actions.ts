"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { num, str } from "@/lib/utils";
import { fromISTInput } from "./_lib/time";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateCalendar() {
  revalidatePath("/learning/calendar", "layout");
  revalidatePath("/learning");
}

function httpUrl(v: string | null) {
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** HR: create or edit a training session. */
export async function saveTrainingSession(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can schedule training sessions");
  const title = str(fd, "title");
  const trainer = str(fd, "trainer");
  const description = str(fd, "description");
  const startsAt = fromISTInput(str(fd, "starts_at"));
  const endsAt = fromISTInput(str(fd, "ends_at"));
  const mode = str(fd, "mode");
  const location = str(fd, "location");
  const meetingLink = str(fd, "meeting_link");
  const capacity = num(fd, "capacity");
  const courseId = str(fd, "course_id");

  if (!title) return fail("Title is required");
  if (title.length > 200) return fail("Title is too long");
  if (!trainer) return fail("Trainer is required");
  if (trainer.length > 120) return fail("Trainer name is too long");
  if (description && description.length > 4000) return fail("Description is too long");
  if (!startsAt) return fail("Start date & time is required");
  if (!endsAt) return fail("End date & time is required");
  if (endsAt <= startsAt) return fail("The session must end after it starts");
  if (mode !== "in_person" && mode !== "virtual") return fail("Choose a mode");
  if (mode === "in_person" && !location) return fail("Add a location for in-person sessions");
  if (mode === "virtual" && !meetingLink) return fail("Add a meeting link for virtual sessions");
  if (!httpUrl(meetingLink)) return fail("Meeting link must start with http:// or https://");
  if (capacity === null || !Number.isInteger(capacity) || capacity < 1 || capacity > 10000) return fail("Capacity must be a whole number between 1 and 10,000");
  if (courseId && !UUID_RE.test(courseId)) return fail("Invalid course");

  const supabase = await createClient();
  const values = {
    title,
    trainer,
    description,
    starts_at: startsAt,
    ends_at: endsAt,
    mode,
    location,
    meeting_link: meetingLink,
    capacity,
    course_id: courseId,
  };
  const id = str(fd, "id");
  if (id) {
    if (!UUID_RE.test(id)) return fail("Invalid session");
    const { count: registered } = await supabase.from("training_registrations").select("id", { count: "exact", head: true }).eq("session_id", id);
    if ((registered ?? 0) > capacity) return fail(`${registered} people are already registered — capacity can't be lower than that`);
    const { error, count } = await supabase.from("training_sessions").update(values, { count: "exact" }).eq("id", id);
    if (error) return fail(dbError(error));
    if (!count) return fail("Session not found");
    revalidateCalendar();
    return ok("Session updated");
  }
  if (new Date(startsAt) < new Date()) return fail("Start time is in the past");
  const { data, error } = await supabase.from("training_sessions").insert({ ...values, created_by: me.id }).select("id").single();
  if (error) return fail(dbError(error));
  revalidateCalendar();
  return ok("Session scheduled", `/learning/calendar/${data.id}`);
}

export async function cancelTrainingSession(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can cancel sessions");
  const id = str(fd, "id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid session");
  const supabase = await createClient();
  const { error, count } = await supabase.from("training_sessions").update({ status: "cancelled" }, { count: "exact" }).eq("id", id).eq("status", "scheduled");
  if (error) return fail(dbError(error));
  if (!count) return fail("Session not found or already cancelled");
  revalidateCalendar();
  return ok("Session cancelled — registered employees have been notified");
}

export async function registerForSession(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const id = str(fd, "session_id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid session");
  const supabase = await createClient();
  const { data: s } = await supabase.from("training_sessions").select("id, title, status, starts_at").eq("id", id).maybeSingle();
  if (!s) return fail("Session not found");
  if (s.status !== "scheduled") return fail("This session has been cancelled");
  if (new Date(s.starts_at) <= new Date()) return fail("Registration is closed for this session");
  const { error } = await supabase.from("training_registrations").insert({ session_id: id, employee_id: me.id });
  if (error) return fail(error.code === "23505" ? "You're already registered for this session" : dbError(error));
  revalidateCalendar();
  return ok(`You're registered for ${s.title}`);
}

export async function cancelRegistration(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const id = str(fd, "session_id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid session");
  const supabase = await createClient();
  const { error, count } = await supabase.from("training_registrations").delete({ count: "exact" }).eq("session_id", id).eq("employee_id", me.id);
  if (error) return fail(dbError(error));
  if (!count) return fail("Registration can't be cancelled once the session has started");
  revalidateCalendar();
  return ok("Registration cancelled");
}

/** HR: mark a registrant present / absent (after the session has started). */
export async function markAttendance(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can mark attendance");
  const id = str(fd, "registration_id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid registration");
  const value = str(fd, "attended");
  if (value !== "true" && value !== "false" && value !== "clear") return fail("Invalid attendance value");
  const supabase = await createClient();
  const { data: r } = await supabase.from("training_registrations").select("id, session:training_sessions!training_registrations_session_id_fkey(starts_at)").eq("id", id).maybeSingle();
  if (!r) return fail("Registration not found");
  if (r.session && new Date(r.session.starts_at) > new Date()) return fail("Attendance can be marked once the session starts");
  const { error } = await supabase.from("training_registrations").update({ attended: value === "clear" ? null : value === "true" }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidateCalendar();
  return ok(value === "true" ? "Marked present" : value === "false" ? "Marked absent" : "Attendance cleared");
}

/** HR: remove someone from a session (e.g. to free a seat). */
export async function removeRegistrant(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  if (!me.isHR) return fail("Only HR can remove attendees");
  const id = str(fd, "registration_id");
  if (!id || !UUID_RE.test(id)) return fail("Invalid registration");
  const supabase = await createClient();
  const { error, count } = await supabase.from("training_registrations").delete({ count: "exact" }).eq("id", id);
  if (error) return fail(dbError(error));
  if (!count) return fail("Registration not found");
  revalidateCalendar();
  return ok("Attendee removed");
}
