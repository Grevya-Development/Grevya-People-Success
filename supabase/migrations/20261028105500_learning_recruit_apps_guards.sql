-- Column / transition guards for Learning, Recruit, Helpdesk and Declarations.
-- The row-level policies decide WHO may touch a row; these close the gaps where a
-- user could change columns the UI never lets them change by calling the API
-- directly.
--   * candidates.notes are HR / hiring-manager only (referrers and interviewers
--     can read their candidate row, but not the private screening notes)
--   * learners can't edit assignment fields (assigned_by, due_date, …) of their
--     own enrollments
--   * ticket requesters can only close / reopen, not assign, re-prioritise or resolve
--   * interviewers can only fill in rating / feedback / result
--   * declaration responses can't be changed after the due date or once the
--     form is inactive
-- Service-role connections (auth.uid() is null: seeds, admin scripts) are not restricted.

-- ---------------------------------------------------------------------------
-- Candidates: hide notes behind a column grant + helper
-- ---------------------------------------------------------------------------
revoke select on public.candidates from anon, authenticated;
grant select (id, job_id, full_name, email, phone, current_company, experience_years, linkedin_url,
              resume_path, source, referred_by, stage, created_at, updated_at)
  on public.candidates to authenticated;

create or replace function public.candidate_notes(cand uuid)
returns text language sql stable security definer set search_path = public as $$
  select c.notes
  from public.candidates c
  join public.job_openings j on j.id = c.job_id
  where c.id = cand
    and (public.is_hr() or j.hiring_manager_id = public.auth_employee_id())
$$;
revoke execute on function public.candidate_notes(uuid) from public, anon;
grant execute on function public.candidate_notes(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Course enrollments: learners can't rewrite assignment metadata
-- ---------------------------------------------------------------------------
create or replace function public.guard_enrollment()
returns trigger language plpgsql security definer set search_path = public as $$
declare me uuid := public.auth_employee_id();
begin
  if auth.uid() is null or me is null or public.is_hr() or new.employee_id <> me then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.assigned_by is not null and new.assigned_by <> me then
      raise exception 'You can only enroll yourself' using errcode = '42501';
    end if;
  elsif new.course_id is distinct from old.course_id
     or new.employee_id is distinct from old.employee_id
     or new.assigned_by is distinct from old.assigned_by
     or new.due_date is distinct from old.due_date
     or new.enrolled_at is distinct from old.enrolled_at then
    raise exception 'Only your manager or HR can change this assignment' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists enrollment_guard on public.course_enrollments;
create trigger enrollment_guard before insert or update on public.course_enrollments
  for each row execute function public.guard_enrollment();

-- ---------------------------------------------------------------------------
-- Helpdesk: requesters may only close / reopen their own ticket
-- ---------------------------------------------------------------------------
create or replace function public.guard_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
declare me uuid := public.auth_employee_id();
begin
  if auth.uid() is null or public.is_hr() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'open';
    new.assigned_to := null;
    return new;
  end if;
  -- The assignee works the ticket like HR does.
  if old.assigned_to is not null and old.assigned_to = me then
    if new.assigned_to is distinct from old.assigned_to or new.employee_id is distinct from old.employee_id then
      raise exception 'Only HR can reassign tickets' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.employee_id is distinct from old.employee_id
     or new.assigned_to is distinct from old.assigned_to
     or new.subject is distinct from old.subject
     or new.description is distinct from old.description
     or new.category is distinct from old.category
     or new.priority is distinct from old.priority then
    raise exception 'You can only close or reopen your ticket' using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and not (new.status = 'closed'
              or (new.status = 'open' and old.status in ('resolved', 'closed'))) then
    raise exception 'You can only close or reopen your ticket' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists tickets_guard on public.helpdesk_tickets;
create trigger tickets_guard before insert or update on public.helpdesk_tickets
  for each row execute function public.guard_ticket();

-- ---------------------------------------------------------------------------
-- Interviews: an interviewer (who doesn't manage the job) only gives feedback
-- ---------------------------------------------------------------------------
create or replace function public.guard_interview_feedback()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_hr() then
    return new;
  end if;
  if exists (select 1 from public.candidates c join public.job_openings j on j.id = c.job_id
             where c.id = old.candidate_id and j.hiring_manager_id = public.auth_employee_id()) then
    return new;
  end if;
  if new.candidate_id is distinct from old.candidate_id
     or new.interviewer_id is distinct from old.interviewer_id
     or new.scheduled_at is distinct from old.scheduled_at
     or new.mode is distinct from old.mode
     or new.round_name is distinct from old.round_name then
    raise exception 'Interviewers can only submit feedback' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists interviews_guard on public.interviews;
create trigger interviews_guard before update on public.interviews
  for each row execute function public.guard_interview_feedback();

-- ---------------------------------------------------------------------------
-- Declarations: no edits after the due date / once the form is inactive
-- ---------------------------------------------------------------------------
create or replace function public.guard_declaration_response()
returns trigger language plpgsql security definer set search_path = public as $$
declare f record;
begin
  if auth.uid() is null or public.is_hr() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.form_id is distinct from old.form_id then
    raise exception 'You can''t move a response to another form' using errcode = '42501';
  end if;
  select active, due_date into f from public.declaration_forms where id = new.form_id;
  if not found or not f.active then
    raise exception 'This form is no longer accepting responses' using errcode = '42501';
  end if;
  if f.due_date is not null and public.org_today() > f.due_date then
    raise exception 'The due date for this declaration has passed' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists declaration_response_guard on public.declaration_responses;
create trigger declaration_response_guard before insert or update on public.declaration_responses
  for each row execute function public.guard_declaration_response();

-- Trigger functions are not meant to be called directly.
revoke execute on function public.guard_enrollment() from public, anon, authenticated;
revoke execute on function public.guard_ticket() from public, anon, authenticated;
revoke execute on function public.guard_interview_feedback() from public, anon, authenticated;
revoke execute on function public.guard_declaration_response() from public, anon, authenticated;
