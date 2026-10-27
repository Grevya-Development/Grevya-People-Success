-- Learning / Recruit access gaps
--  * employees can un-enroll from courses they enrolled in themselves (not completed)
--  * hiring managers can edit their own job openings and add candidates to them
--  * interviewers can read the candidates they interview (security definer helper
--    avoids policy recursion between candidates <-> interviews)
--  * duplicate-referral check that works without exposing other people's referrals
--  * notify the referrer when their candidate changes stage, and the interviewer
--    when an interview is scheduled

create policy "delete own self enrollment" on public.course_enrollments for delete to authenticated
  using (
    employee_id = public.auth_employee_id()
    and (assigned_by is null or assigned_by = employee_id)
    and status <> 'completed'
  );

create policy "hiring manager update own jobs" on public.job_openings for update to authenticated
  using (hiring_manager_id = public.auth_employee_id())
  with check (hiring_manager_id = public.auth_employee_id());

create policy "hiring manager insert candidates" on public.candidates for insert to authenticated
  with check (exists (
    select 1 from public.job_openings j
    where j.id = job_id and j.hiring_manager_id = public.auth_employee_id()
  ));

create or replace function public.is_interviewer_for(cand uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.interviews
    where candidate_id = cand and interviewer_id = public.auth_employee_id()
  )
$$;

create policy "interviewer read candidates" on public.candidates for select to authenticated
  using (public.is_interviewer_for(id));

create or replace function public.candidate_exists(p_job uuid, p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.candidates
    where job_id = p_job and lower(email) = lower(trim(p_email))
  )
$$;

create or replace function public.notify_candidate_stage()
returns trigger language plpgsql security definer set search_path = public as $$
declare j text;
begin
  if new.stage is distinct from old.stage and new.referred_by is not null then
    select title into j from public.job_openings where id = new.job_id;
    perform public.notify(new.referred_by,
      'Referral update: ' || new.full_name || ' is now ' || initcap(new.stage),
      j, '/recruit/referrals');
  end if;
  return new;
end $$;
create trigger candidates_stage_notify after update on public.candidates
  for each row execute function public.notify_candidate_stage();

create or replace function public.notify_interview()
returns trigger language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if tg_op = 'INSERT' or new.interviewer_id is distinct from old.interviewer_id then
    select full_name into c from public.candidates where id = new.candidate_id;
    perform public.notify(new.interviewer_id,
      'Interview scheduled: ' || c || ' (' || new.round_name || ')',
      to_char(new.scheduled_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM'), '/recruit');
  end if;
  return new;
end $$;
create trigger interviews_notify after insert or update on public.interviews
  for each row execute function public.notify_interview();
