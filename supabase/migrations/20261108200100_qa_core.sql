-- QA fixes: identity + onboarding.
--  * Exited employees keep employee-level access (payslips, letters) but lose HR / Super Admin /
--    manager powers, even if their login hasn't been removed yet.
--  * Onboarding: internal helpers are no longer callable by users; "today" is India time; due dates
--    honour the template offset for probation-based tasks and follow joining / probation changes;
--    automatic tasks can only be ticked by hand by HR.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Exited employees lose elevated access
-- ---------------------------------------------------------------------------
create or replace function public.is_hr()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('hr_admin','super_admin') and status <> 'exited'
                     from public.employees where user_id = auth.uid() limit 1), false)
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' and status <> 'exited'
                     from public.employees where user_id = auth.uid() limit 1), false)
$$;

create or replace function public.is_manager_of(emp uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with recursive me as (
    select id from public.employees where user_id = auth.uid() and status <> 'exited' limit 1
  ), chain as (
    select e.id, e.manager_id, 1 as depth from public.employees e where e.id = emp
    union all
    select e.id, e.manager_id, c.depth + 1
    from public.employees e join chain c on e.id = c.manager_id
    where c.depth < 15
  )
  select exists (select 1 from chain join me on chain.manager_id = me.id)
$$;

-- ---------------------------------------------------------------------------
-- Onboarding: internal helpers are not part of the API
-- ---------------------------------------------------------------------------
revoke execute on function public.refresh_onboarding(uuid) from public, anon, authenticated;
revoke execute on function public.onboarding_condition(uuid, text) from public, anon, authenticated;
grant execute on function public.refresh_onboarding(uuid) to service_role;
grant execute on function public.onboarding_condition(uuid, text) to service_role;
-- Trigger functions can't be called directly anyway; keep them out of the API surface too.
revoke execute on function public.employees_onboarding_insert() from public, anon, authenticated;
revoke execute on function public.employees_onboarding_update() from public, anon, authenticated;
revoke execute on function public.letters_onboarding() from public, anon, authenticated;
revoke execute on function public.onboarding_refresh_row() from public, anon, authenticated;

-- Due date for a template item, given the joiner's dates. Never in the past when first created.
create or replace function public.onboarding_due_date(p_basis text, p_offset int, p_joining date, p_probation_end date)
returns date language sql immutable as $$
  select case when p_basis = 'probation_end' then p_probation_end + p_offset
              else p_joining + p_offset end
$$;
revoke execute on function public.onboarding_due_date(text, int, date, date) from public, anon;

create or replace function public.start_onboarding(p_employee uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  e public.employees;
  n int;
  mgr_tasks int;
  today date := public.org_today();
begin
  if auth.uid() is not null and not public.is_hr() then raise exception 'Only HR can start onboarding'; end if;
  select * into e from public.employees where id = p_employee;
  if not found then raise exception 'Employee not found'; end if;
  if e.status = 'exited' then raise exception 'This employee has exited'; end if;

  insert into public.onboarding_tasks (employee_id, template_id, title, description, owner, auto_key, due_date, sort_order)
  select e.id, t.id, t.title, t.description, t.owner, t.auto_key,
         greatest(public.onboarding_due_date(t.due_basis, t.due_offset_days, e.date_of_joining, e.probation_end_date), today),
         t.sort_order
    from public.onboarding_templates t
   where t.active and (t.due_basis = 'joining' or e.probation_end_date is not null)
  on conflict (employee_id, template_id) do nothing;
  get diagnostics n = row_count;

  perform public.refresh_onboarding(e.id);

  if n > 0 and e.manager_id is not null then
    select count(*) into mgr_tasks from public.onboarding_tasks
     where employee_id = e.id and owner = 'manager' and status = 'pending';
    perform public.notify(
      e.manager_id,
      e.full_name || case when e.date_of_joining > today then ' joins on ' || to_char(e.date_of_joining, 'DD Mon')
                          when e.date_of_joining = today then ' joins today'
                          else ' has joined your team' end,
      case when mgr_tasks > 0 then 'You have ' || mgr_tasks || ' onboarding task' || case when mgr_tasks = 1 then '' else 's' end || ' to help them settle in.'
           else 'Their onboarding checklist is ready.' end,
      '/onboarding/' || e.id
    );
  end if;
  return n;
end $$;
revoke execute on function public.start_onboarding(uuid) from public, anon;
grant execute on function public.start_onboarding(uuid) to authenticated, service_role;

-- Tick a task off (or reopen / skip it). HR: any task. Managers: manager tasks for their team.
-- The joiner: their own tasks. Only HR can skip, or tick automatic tasks by hand.
create or replace function public.set_onboarding_task(p_task uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.onboarding_tasks;
  me uuid := public.auth_employee_id();
  hr boolean := public.is_hr();
begin
  if p_status is null or p_status not in ('pending','done','skipped') then raise exception 'Invalid status'; end if;
  if length(p_note) > 500 then raise exception 'Keep the note under 500 characters'; end if;
  select * into t from public.onboarding_tasks where id = p_task for update;
  if not found then raise exception 'Task not found'; end if;
  if not (hr
          or (t.owner = 'manager' and public.is_manager_of(t.employee_id))
          or (t.owner = 'employee' and t.employee_id = me)) then
    raise exception 'You can''t update this task';
  end if;
  if p_status = 'skipped' and not hr then raise exception 'Only HR can skip a task'; end if;
  if not hr and t.auto_key is not null then
    -- Done means done: bank details added, policies accepted, first goal created...
    perform public.refresh_onboarding(t.employee_id);
    if p_status = 'done' then
      if (select status from public.onboarding_tasks where id = p_task) = 'done' then return; end if;
      raise exception 'This task ticks itself off once it''s done';
    end if;
    raise exception 'Only HR can reopen an automatic task';
  end if;
  if not hr and t.status = 'skipped' then raise exception 'HR skipped this task'; end if;
  update public.onboarding_tasks
     set status = p_status,
         completed_at = case when p_status = 'pending' then null else now() end,
         completed_by = case when p_status = 'pending' then null else me end,
         note = case when p_status = 'pending' then null else coalesce(nullif(trim(p_note), ''), note) end
   where id = p_task;
end $$;
revoke execute on function public.set_onboarding_task(uuid, text, text) from public, anon;
grant execute on function public.set_onboarding_task(uuid, text, text) to authenticated;

create or replace function public.employees_onboarding_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and new.date_of_joining >= public.org_today() - 30 then
    begin
      perform public.start_onboarding(new.id);
    exception when others then
      raise warning 'onboarding not started for %: %', new.id, sqlerrm;
    end;
  end if;
  return null;
end $$;

create or replace function public.employees_onboarding_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  today date := public.org_today();
  mgr_tasks int;
begin
  -- Joining date corrected: move pending joining-based tasks with it.
  if new.date_of_joining is distinct from old.date_of_joining then
    update public.onboarding_tasks ot
       set due_date = greatest(public.onboarding_due_date('joining', t.due_offset_days, new.date_of_joining, null), today)
      from public.onboarding_templates t
     where ot.template_id = t.id and ot.employee_id = new.id and ot.status = 'pending' and t.due_basis = 'joining';
  end if;

  -- Probation set, moved or removed.
  if new.probation_end_date is distinct from old.probation_end_date then
    if new.probation_end_date is null then
      update public.onboarding_tasks ot
         set status = 'skipped', completed_at = now(), completed_by = public.auth_employee_id(), note = 'No probation'
       where ot.employee_id = new.id and ot.status = 'pending'
         and (ot.auto_key = 'confirmation'
              or exists (select 1 from public.onboarding_templates t where t.id = ot.template_id and t.due_basis = 'probation_end'));
    else
      update public.onboarding_tasks ot
         set due_date = public.onboarding_due_date('probation_end', coalesce(t.due_offset_days, 0), null, new.probation_end_date),
             status = 'pending', completed_at = null, completed_by = null,
             note = case when ot.status = 'skipped' then null else ot.note end
        from public.onboarding_tasks src
        left join public.onboarding_templates t on t.id = src.template_id
       where src.id = ot.id and ot.employee_id = new.id
         and (ot.status = 'pending' or (ot.status = 'skipped' and ot.note = 'No probation'))
         and (ot.auto_key = 'confirmation' or t.due_basis = 'probation_end');
      if exists (select 1 from public.onboarding_tasks where employee_id = new.id) then
        insert into public.onboarding_tasks (employee_id, template_id, title, description, owner, auto_key, due_date, sort_order)
        select new.id, t.id, t.title, t.description, t.owner, t.auto_key,
               greatest(public.onboarding_due_date('probation_end', t.due_offset_days, null, new.probation_end_date), today), t.sort_order
          from public.onboarding_templates t
         where t.active and t.due_basis = 'probation_end'
        on conflict (employee_id, template_id) do nothing;
      end if;
    end if;
  end if;

  -- Left the company → nothing left to do.
  if new.status = 'exited' and old.status is distinct from 'exited' then
    update public.onboarding_tasks set status = 'skipped', completed_at = now(), note = 'Employee exited'
     where employee_id = new.id and status = 'pending';
  end if;

  if new.user_id is distinct from old.user_id or new.confirmation_date is distinct from old.confirmation_date then
    perform public.refresh_onboarding(new.id);
  end if;

  -- New reporting manager while onboarding is still open: tell them what's theirs.
  if new.manager_id is distinct from old.manager_id and new.manager_id is not null and new.status <> 'exited' then
    select count(*) into mgr_tasks from public.onboarding_tasks
     where employee_id = new.id and owner = 'manager' and status = 'pending';
    if mgr_tasks > 0 then
      perform public.notify(
        new.manager_id,
        new.full_name || ' now reports to you',
        'You have ' || mgr_tasks || ' onboarding task' || case when mgr_tasks = 1 then '' else 's' end || ' to help them settle in.',
        '/onboarding/' || new.id
      );
    end if;
  end if;
  return null;
end $$;

create or replace function public.send_probation_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  hr record;
  k text;
  inserted int;
  sent int := 0;
  title text;
  hr_role text;
  today date := public.org_today();
begin
  hr_role := case when exists (select 1 from public.employees where role = 'hr_admin' and status <> 'exited') then 'hr_admin' else 'super_admin' end;
  for r in
    select e.id, e.full_name, e.manager_id, e.probation_end_date
      from public.employees e
     where e.status = 'active' and e.confirmation_date is null
       and e.probation_end_date is not null and e.probation_end_date <= today + 14
  loop
    k := case when r.probation_end_date <= today then 'due' else 'due_soon' end;
    insert into public.probation_reminders (employee_id, kind, probation_end_date)
    values (r.id, k, r.probation_end_date) on conflict do nothing;
    get diagnostics inserted = row_count;
    continue when inserted = 0;

    title := case k when 'due' then r.full_name || '''s probation has ended'
                    else r.full_name || '''s probation ends on ' || to_char(r.probation_end_date, 'DD Mon') end;
    for hr in select id from public.employees where role = hr_role and status <> 'exited' and id is distinct from r.id loop
      perform public.notify(hr.id, title, 'Review with the manager, then issue the confirmation letter or extend probation.', '/onboarding/' || r.id);
    end loop;
    if r.manager_id is not null then
      perform public.notify(r.manager_id, title, 'Share your review with HR so they can confirm or extend the probation.', '/onboarding/' || r.id);
    end if;
    sent := sent + 1;
  end loop;
  return sent;
end $$;
revoke execute on function public.send_probation_reminders() from public, anon, authenticated;
grant execute on function public.send_probation_reminders() to service_role;

-- ---------------------------------------------------------------------------
-- Exit: each role can only take its own step, even through the API.
--  * The resignee can only withdraw a pending resignation (no editing remarks or dates).
--  * A reporting manager can only approve / reject at the manager step (they could jump
--    straight to "approved" or "completed" — which marks the employee exited — via the API).
--  * HR approves, sets the last day and completes; nobody acts on their own exit.
--  (Exit clearance items are locked down in 20261108200400_qa_security.sql.)
-- ---------------------------------------------------------------------------
create or replace function public.guard_resignation_steps()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.auth_employee_id();
begin
  if auth.uid() is null then return new; end if;
  if new.employee_id is distinct from old.employee_id or new.resignation_date is distinct from old.resignation_date then
    raise exception 'A resignation can''t be moved to another employee or date';
  end if;

  if old.employee_id = me then
    if (new.reason_category, new.reason, new.requested_last_day, new.approved_last_day, new.notice_period_days,
        new.manager_remarks, new.manager_action_at, new.hr_remarks, new.hr_action_at,
        new.correspondence_email, new.correspondence_phone, new.attachment_path, new.attachment_name)
       is distinct from
       (old.reason_category, old.reason, old.requested_last_day, old.approved_last_day, old.notice_period_days,
        old.manager_remarks, old.manager_action_at, old.hr_remarks, old.hr_action_at,
        old.correspondence_email, old.correspondence_phone, old.attachment_path, old.attachment_name) then
      raise exception 'A submitted resignation can''t be edited. Withdraw it and submit a new one.';
    end if;
    if new.status is distinct from old.status
       and not (new.status = 'withdrawn' and old.status in ('pending_manager','pending_hr')) then
      raise exception 'You can only withdraw your own resignation';
    end if;
    return new;
  end if;

  if public.is_hr() then return new; end if;

  -- Reporting manager (RLS already limits this to their chain).
  if new.status is distinct from old.status
     and not (old.status = 'pending_manager' and new.status in ('pending_hr','rejected')) then
    raise exception 'Only HR can take this step';
  end if;
  if (new.reason_category, new.reason, new.requested_last_day, new.approved_last_day, new.notice_period_days,
      new.hr_remarks, new.hr_action_at, new.correspondence_email, new.correspondence_phone, new.attachment_path, new.attachment_name)
     is distinct from
     (old.reason_category, old.reason, old.requested_last_day, old.approved_last_day, old.notice_period_days,
      old.hr_remarks, old.hr_action_at, old.correspondence_email, old.correspondence_phone, old.attachment_path, old.attachment_name) then
    raise exception 'Only HR can change these details';
  end if;
  return new;
end $$;
revoke execute on function public.guard_resignation_steps() from public, anon, authenticated;
drop trigger if exists resignation_steps_guard on public.resignations;
create trigger resignation_steps_guard before update on public.resignations
  for each row execute function public.guard_resignation_steps();

-- The PAN / bank form is on My Profile → Personal details (the old hint pointed at a section that doesn't exist).
update public.onboarding_templates set description = 'My Profile → Personal details → Statutory & Bank. Payroll needs these.'
 where auto_key = 'bank_details' and description = 'My Profile → Bank details. Payroll needs these.';
update public.onboarding_tasks set description = 'My Profile → Personal details → Statutory & Bank. Payroll needs these.'
 where auto_key = 'bank_details' and description = 'My Profile → Bank details. Payroll needs these.';
