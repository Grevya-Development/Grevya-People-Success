-- QA security fixes (data access). Idempotent: safe to re-run.
--  * Anonymous visitors can no longer probe whether an email applied for a job.
--  * Letter requests are approved by HR only (managers could approve via the API).
--  * Exit clearance: managers may sign off only the "Reporting Manager" item of their
--    reports' exits; IT / Finance / Admin / HR items and adding/removing items are HR-only.
--  * Hiring managers can no longer change a job's referral bonus or owner via the API.
--  * Storage paths that users write into rows (receipts, certificates, resumes, resignation
--    letters, remote-attendance selfies) must point into the writer's own folder and may not
--    contain "..": the app signs these paths with the service role, and "uid/../other/file"
--    was normalised by the storage API into someone else's file.
--  * Avatars (a public bucket) accept raster images only — no SVG/HTML.
--  * anon/authenticated lose TRUNCATE, which bypasses RLS (defence in depth).

-- ---------------------------------------------------------------------------
-- Candidate de-duplication check: signed-in employees only
-- ---------------------------------------------------------------------------
revoke execute on function public.candidate_exists(uuid, text) from public, anon;
grant execute on function public.candidate_exists(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Letter requests: HR decides
-- ---------------------------------------------------------------------------
drop policy if exists "update letter_requests" on public.letter_requests;
create policy "update letter_requests" on public.letter_requests for update to authenticated
  using (employee_id = public.auth_employee_id() or public.is_hr())
  with check (employee_id = public.auth_employee_id() or public.is_hr());

-- ---------------------------------------------------------------------------
-- Exit clearances
-- ---------------------------------------------------------------------------
drop policy if exists "manage clearances" on public.exit_clearances;
drop policy if exists "hr manage clearances" on public.exit_clearances;
drop policy if exists "manager clears reporting manager item" on public.exit_clearances;

create policy "hr manage clearances" on public.exit_clearances for all to authenticated
  using (public.is_hr() and exists (select 1 from public.resignations r
                                    where r.id = exit_clearances.resignation_id
                                      and r.employee_id is distinct from public.auth_employee_id()))
  with check (public.is_hr() and exists (select 1 from public.resignations r
                                         where r.id = exit_clearances.resignation_id
                                           and r.employee_id is distinct from public.auth_employee_id()));

create policy "manager clears reporting manager item" on public.exit_clearances for update to authenticated
  using (department = 'Reporting Manager'
         and exists (select 1 from public.resignations r
                     where r.id = exit_clearances.resignation_id and public.is_manager_of(r.employee_id)))
  with check (department = 'Reporting Manager'
              and exists (select 1 from public.resignations r
                          where r.id = exit_clearances.resignation_id and public.is_manager_of(r.employee_id)));

-- ---------------------------------------------------------------------------
-- Job openings: hiring managers edit the posting, not the bonus or ownership
-- ---------------------------------------------------------------------------
create or replace function public.guard_job_opening()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_hr() then
    return new;
  end if;
  if new.referral_bonus is distinct from old.referral_bonus
     or new.hiring_manager_id is distinct from old.hiring_manager_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Only HR can change the referral bonus or hiring manager' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.guard_job_opening() from public, anon, authenticated;

drop trigger if exists job_openings_guard on public.job_openings;
create trigger job_openings_guard before update on public.job_openings
  for each row execute function public.guard_job_opening();

-- ---------------------------------------------------------------------------
-- Storage paths written by users
-- ---------------------------------------------------------------------------
-- TG_ARGV = the path columns to check. HR may reference any (well-formed) path; everyone else
-- only files in their own "<auth.uid()>/" folder.
create or replace function public.guard_storage_paths()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  col text;
  p text;
  prev text;
  hr boolean;
begin
  if auth.uid() is null then
    return new;
  end if;
  hr := public.is_hr();
  foreach col in array TG_ARGV loop
    p := to_jsonb(new) ->> col;
    prev := case when tg_op = 'UPDATE' then to_jsonb(old) ->> col end;
    continue when p is null or p is not distinct from prev;
    if p ~ '(^|/)\.\.?(/|$)' or p ~ '[\\%?#]' or p ~ '^/' or p ~ '[[:cntrl:]]' then
      raise exception 'Invalid file reference' using errcode = '22023';
    end if;
    if not hr and p not like auth.uid()::text || '/%' then
      raise exception 'You can only attach files you uploaded' using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;
revoke execute on function public.guard_storage_paths() from public, anon, authenticated;

drop trigger if exists candidates_storage_paths on public.candidates;
create trigger candidates_storage_paths before insert or update on public.candidates
  for each row execute function public.guard_storage_paths('resume_path');

drop trigger if exists claims_storage_paths on public.claims;
create trigger claims_storage_paths before insert or update on public.claims
  for each row execute function public.guard_storage_paths('receipt_path');

drop trigger if exists external_trainings_storage_paths on public.external_trainings;
create trigger external_trainings_storage_paths before insert or update on public.external_trainings
  for each row execute function public.guard_storage_paths('certificate_path');

drop trigger if exists resignations_storage_paths on public.resignations;
create trigger resignations_storage_paths before insert or update on public.resignations
  for each row execute function public.guard_storage_paths('attachment_path');

drop trigger if exists remote_sessions_storage_paths on public.remote_work_sessions;
create trigger remote_sessions_storage_paths before insert or update on public.remote_work_sessions
  for each row execute function public.guard_storage_paths('check_in_photo', 'check_out_photo');

-- ---------------------------------------------------------------------------
-- Avatars: public bucket, raster images only
-- ---------------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
 where id = 'avatars';

-- ---------------------------------------------------------------------------
-- TRUNCATE ignores RLS; API roles never need it
-- ---------------------------------------------------------------------------
revoke truncate on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate on tables from anon, authenticated;
