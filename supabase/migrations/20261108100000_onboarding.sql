-- Onboarding for new joiners.
--  * A checklist per joiner, built from an HR-editable template, with owners (HR, manager, IT,
--    finance, the joiner) and due dates relative to the joining date.
--  * Tasks tick themselves off when the matching thing happens (letter issued, contract recorded,
--    salary structure set, bank details added, policies accepted, first goal set, login created).
--  * Probation end date + confirmation date on the employee, with reminders to HR and the manager.
-- The Service Desk opens the IT setup request for the "it_setup" task (desk migration 0010).

-- ---------------------------------------------------------------------------
-- Probation
-- ---------------------------------------------------------------------------
alter table public.employees
  add column if not exists probation_end_date date,
  add column if not exists confirmation_date date;

alter table public.employees drop constraint if exists employees_probation_after_joining;
alter table public.employees add constraint employees_probation_after_joining
  check (probation_end_date is null or probation_end_date > date_of_joining);

-- Same guard as before, plus the two probation columns are HR-only.
create or replace function public.guard_employee_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  if public.is_hr() then
    if new.role is distinct from old.role
       and (new.role in ('hr_admin','super_admin') or old.role in ('hr_admin','super_admin')) then
      raise exception 'Only a Super Admin can grant or remove admin roles';
    end if;
    if new.user_id is distinct from old.user_id and old.role in ('hr_admin','super_admin') then
      raise exception 'Only a Super Admin can change an admin''s login';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.manager_id is distinct from old.manager_id
     or new.department_id is distinct from old.department_id
     or new.designation_id is distinct from old.designation_id
     or new.location_id is distinct from old.location_id
     or new.status is distinct from old.status
     or new.employee_code is distinct from old.employee_code
     or new.email is distinct from old.email
     or new.user_id is distinct from old.user_id
     or new.employment_type is distinct from old.employment_type
     or new.date_of_joining is distinct from old.date_of_joining
     or new.probation_end_date is distinct from old.probation_end_date
     or new.confirmation_date is distinct from old.confirmation_date then
    raise exception 'Only HR can change organisation details';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Checklist template (HR edits it in HR Admin → Onboarding → Checklist template)
-- ---------------------------------------------------------------------------
create table if not exists public.onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 2 and 120),
  description text check (description is null or length(description) <= 500),
  owner text not null check (owner in ('hr','manager','it','finance','employee')),
  due_basis text not null default 'joining' check (due_basis in ('joining','probation_end')),
  due_offset_days int not null default 0 check (due_offset_days between -90 and 365),
  auto_key text check (auto_key in ('login','offer_letter','appointment_letter','contract','bank_details',
                                    'policies','salary_structure','it_setup','goals','confirmation')),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  template_id uuid references public.onboarding_templates(id) on delete set null,
  title text not null check (length(title) between 2 and 120),
  description text check (description is null or length(description) <= 500),
  owner text not null check (owner in ('hr','manager','it','finance','employee')),
  auto_key text,
  due_date date,
  status text not null default 'pending' check (status in ('pending','done','skipped')),
  completed_by uuid references public.employees(id) on delete set null,
  completed_at timestamptz,
  note text check (note is null or length(note) <= 500),
  link text,
  link_label text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (employee_id, template_id)
);
create index if not exists onboarding_tasks_employee on public.onboarding_tasks (employee_id, sort_order);
create index if not exists onboarding_tasks_pending on public.onboarding_tasks (due_date) where status = 'pending';

alter table public.onboarding_templates enable row level security;
alter table public.onboarding_tasks enable row level security;

drop policy if exists "hr reads templates" on public.onboarding_templates;
create policy "hr reads templates" on public.onboarding_templates for select to authenticated using (public.is_hr());
drop policy if exists "hr manages templates" on public.onboarding_templates;
create policy "hr manages templates" on public.onboarding_templates for all to authenticated
  using (public.is_hr()) with check (public.is_hr());

-- HR, the joiner's managers and the joiner can see the checklist.
drop policy if exists "see onboarding" on public.onboarding_tasks;
create policy "see onboarding" on public.onboarding_tasks for select to authenticated
  using (public.is_hr() or employee_id = public.auth_employee_id() or public.is_manager_of(employee_id));
-- Only HR adds, edits or removes tasks directly; ticking a task off goes through set_onboarding_task().
drop policy if exists "hr manages onboarding" on public.onboarding_tasks;
create policy "hr manages onboarding" on public.onboarding_tasks for all to authenticated
  using (public.is_hr()) with check (public.is_hr());

grant select, insert, update, delete on public.onboarding_templates to authenticated;
grant select, insert, update, delete on public.onboarding_tasks to authenticated;
grant all on public.onboarding_templates, public.onboarding_tasks to service_role;

insert into public.onboarding_templates (title, description, owner, due_basis, due_offset_days, auto_key, sort_order)
select * from (values
  ('Send the offer letter', 'Issue it from HR Admin → Letters & Contracts.', 'hr', 'joining', -14, 'offer_letter', 10),
  ('Share login details', 'Ticks itself off once a login exists. The welcome email sends the details.', 'hr', 'joining', -1, 'login', 20),
  ('Laptop, accounts and access', 'A Service Desk request is opened for IT automatically.', 'it', 'joining', -2, 'it_setup', 30),
  ('Issue the appointment letter', 'Issue it from HR Admin → Letters & Contracts.', 'hr', 'joining', 0, 'appointment_letter', 40),
  ('Record the employment contract', 'Add it under HRIS → Contract Management.', 'hr', 'joining', 0, 'contract', 50),
  ('Welcome call and first-week plan', 'Meet on day one. Share the plan for the first week and who to ask for help.', 'manager', 'joining', 0, null, 60),
  ('Assign an onboarding buddy', 'Pick a teammate to help with the first few weeks.', 'manager', 'joining', 0, null, 70),
  ('Add your PAN and bank details', 'My Profile → Bank details. Payroll needs these.', 'employee', 'joining', 3, 'bank_details', 80),
  ('Read and accept company policies', 'HRIS → Policies & FAQs. Accept every policy marked as required.', 'employee', 'joining', 7, 'policies', 90),
  ('Set up the salary structure', 'HR Admin → Payroll Run & Salary → Salary structures.', 'finance', 'joining', 7, 'salary_structure', 100),
  ('Agree first goals', 'Create at least one goal together under Performance → Goals.', 'manager', 'joining', 30, 'goals', 110),
  ('Probation review and confirmation', 'Review with the manager, then issue the confirmation letter or extend probation.', 'hr', 'probation_end', 0, 'confirmation', 120)
) as v(title, description, owner, due_basis, due_offset_days, auto_key, sort_order)
where not exists (select 1 from public.onboarding_templates);

-- ---------------------------------------------------------------------------
-- Auto-completion
-- ---------------------------------------------------------------------------
create or replace function public.onboarding_condition(p_employee uuid, p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_key
    when 'login' then exists (select 1 from public.employees where id = p_employee and user_id is not null)
    when 'offer_letter' then exists (select 1 from public.letters where employee_id = p_employee and letter_type = 'offer')
    when 'appointment_letter' then exists (select 1 from public.letters where employee_id = p_employee and letter_type = 'appointment')
    when 'contract' then exists (select 1 from public.contracts where employee_id = p_employee
                                   and contract_type in ('employment','internship','consultant') and status <> 'draft')
    when 'bank_details' then exists (select 1 from public.employee_private where employee_id = p_employee
                                   and coalesce(trim(pan_number), '') <> '' and coalesce(trim(bank_account), '') <> '' and coalesce(trim(ifsc), '') <> '')
    when 'policies' then not exists (select 1 from public.policies p where p.published and p.requires_acknowledgement
                                   and not exists (select 1 from public.policy_acknowledgements a where a.policy_id = p.id and a.employee_id = p_employee))
    when 'salary_structure' then exists (select 1 from public.salary_structures where employee_id = p_employee)
    when 'goals' then exists (select 1 from public.goals where employee_id = p_employee)
    when 'confirmation' then exists (select 1 from public.employees where id = p_employee and confirmation_date is not null)
    else false
  end
$$;

-- Tick off every pending automatic task whose condition now holds. Cheap when there's nothing pending.
create or replace function public.refresh_onboarding(p_employee uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_employee is null then return; end if;
  update public.onboarding_tasks t
     set status = 'done', completed_at = now(), completed_by = public.auth_employee_id(),
         note = coalesce(t.note, 'Done automatically')
   where t.employee_id = p_employee and t.status = 'pending'
     and t.auto_key is not null and t.auto_key <> 'it_setup'
     and public.onboarding_condition(p_employee, t.auto_key);
end $$;
revoke execute on function public.refresh_onboarding(uuid) from public, anon;
revoke execute on function public.onboarding_condition(uuid, text) from public, anon;

-- ---------------------------------------------------------------------------
-- Start onboarding (automatic for new joiners; HR can also start it for anyone)
-- ---------------------------------------------------------------------------
create or replace function public.start_onboarding(p_employee uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  e public.employees;
  n int;
  mgr_tasks int;
begin
  if auth.uid() is not null and not public.is_hr() then raise exception 'Only HR can start onboarding'; end if;
  select * into e from public.employees where id = p_employee;
  if not found then raise exception 'Employee not found'; end if;
  if e.status = 'exited' then raise exception 'This employee has exited'; end if;

  insert into public.onboarding_tasks (employee_id, template_id, title, description, owner, auto_key, due_date, sort_order)
  select e.id, t.id, t.title, t.description, t.owner, t.auto_key,
         case when t.due_basis = 'probation_end' then e.probation_end_date
              else greatest(e.date_of_joining + t.due_offset_days, current_date) end,
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
      e.full_name || case when e.date_of_joining >= current_date then ' joins on ' || to_char(e.date_of_joining, 'DD Mon') else ' has joined your team' end,
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
-- The joiner: their own tasks. Only HR can skip.
create or replace function public.set_onboarding_task(p_task uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.onboarding_tasks;
  me uuid := public.auth_employee_id();
begin
  if p_status not in ('pending','done','skipped') then raise exception 'Invalid status'; end if;
  select * into t from public.onboarding_tasks where id = p_task for update;
  if not found then raise exception 'Task not found'; end if;
  if not (public.is_hr()
          or (t.owner = 'manager' and public.is_manager_of(t.employee_id))
          or (t.owner = 'employee' and t.employee_id = me)) then
    raise exception 'You can''t update this task';
  end if;
  if p_status = 'skipped' and not public.is_hr() then raise exception 'Only HR can skip a task'; end if;
  update public.onboarding_tasks
     set status = p_status,
         completed_at = case when p_status = 'pending' then null else now() end,
         completed_by = case when p_status = 'pending' then null else me end,
         note = case when p_status = 'pending' then null else coalesce(nullif(trim(p_note), ''), note) end
   where id = p_task;
end $$;
revoke execute on function public.set_onboarding_task(uuid, text, text) from public, anon;
grant execute on function public.set_onboarding_task(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
-- New joiner (joining date within the last 30 days or in the future) → start onboarding.
-- Never blocks adding the employee.
create or replace function public.employees_onboarding_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and new.date_of_joining >= current_date - 30 then
    begin
      perform public.start_onboarding(new.id);
    exception when others then
      raise warning 'onboarding not started for %: %', new.id, sqlerrm;
    end;
  end if;
  return null;
end $$;
drop trigger if exists employees_onboarding_insert on public.employees;
create trigger employees_onboarding_insert after insert on public.employees
  for each row execute function public.employees_onboarding_insert();

create or replace function public.employees_onboarding_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Probation set, moved or removed.
  if new.probation_end_date is distinct from old.probation_end_date then
    if new.probation_end_date is null then
      update public.onboarding_tasks set status = 'skipped', completed_at = now(), completed_by = public.auth_employee_id(), note = 'No probation'
       where employee_id = new.id and auto_key = 'confirmation' and status = 'pending';
    else
      update public.onboarding_tasks set due_date = new.probation_end_date
       where employee_id = new.id and auto_key = 'confirmation' and status = 'pending';
      update public.onboarding_tasks set status = 'pending', due_date = new.probation_end_date, completed_at = null, completed_by = null, note = null
       where employee_id = new.id and auto_key = 'confirmation' and status = 'skipped' and note = 'No probation';
      if exists (select 1 from public.onboarding_tasks where employee_id = new.id) then
        insert into public.onboarding_tasks (employee_id, template_id, title, description, owner, auto_key, due_date, sort_order)
        select new.id, t.id, t.title, t.description, t.owner, t.auto_key, new.probation_end_date, t.sort_order
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
  return null;
end $$;
drop trigger if exists employees_onboarding_update on public.employees;
create trigger employees_onboarding_update after update on public.employees
  for each row execute function public.employees_onboarding_update();

-- Issuing a confirmation letter confirms the employee.
create or replace function public.letters_onboarding()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.letter_type = 'confirmation' then
    update public.employees set confirmation_date = new.issued_on
     where id = new.employee_id and confirmation_date is null;
  end if;
  perform public.refresh_onboarding(new.employee_id);
  return null;
end $$;
drop trigger if exists letters_onboarding on public.letters;
create trigger letters_onboarding after insert on public.letters
  for each row execute function public.letters_onboarding();

create or replace function public.onboarding_refresh_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_onboarding(new.employee_id);
  return null;
end $$;

drop trigger if exists contracts_onboarding on public.contracts;
create trigger contracts_onboarding after insert or update on public.contracts
  for each row execute function public.onboarding_refresh_row();
drop trigger if exists salary_structures_onboarding on public.salary_structures;
create trigger salary_structures_onboarding after insert on public.salary_structures
  for each row execute function public.onboarding_refresh_row();
drop trigger if exists employee_private_onboarding on public.employee_private;
create trigger employee_private_onboarding after insert or update on public.employee_private
  for each row execute function public.onboarding_refresh_row();
drop trigger if exists policy_ack_onboarding on public.policy_acknowledgements;
create trigger policy_ack_onboarding after insert on public.policy_acknowledgements
  for each row execute function public.onboarding_refresh_row();
drop trigger if exists goals_onboarding on public.goals;
create trigger goals_onboarding after insert on public.goals
  for each row when (new.employee_id is not null) execute function public.onboarding_refresh_row();

-- ---------------------------------------------------------------------------
-- Probation reminders: 14 days before the end date, and once it has passed.
-- Sent to HR admins (Super Admins if there are none) and the manager. Daily at 09:00 IST.
-- ---------------------------------------------------------------------------
create table if not exists public.probation_reminders (
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind text not null check (kind in ('due_soon','due')),
  probation_end_date date not null,
  sent_at timestamptz not null default now(),
  primary key (employee_id, kind, probation_end_date)
);
alter table public.probation_reminders enable row level security;
revoke all on public.probation_reminders from authenticated, anon;
grant all on public.probation_reminders to service_role;

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
begin
  hr_role := case when exists (select 1 from public.employees where role = 'hr_admin' and status <> 'exited') then 'hr_admin' else 'super_admin' end;
  for r in
    select e.id, e.full_name, e.manager_id, e.probation_end_date
      from public.employees e
     where e.status = 'active' and e.confirmation_date is null
       and e.probation_end_date is not null and e.probation_end_date <= current_date + 14
  loop
    k := case when r.probation_end_date <= current_date then 'due' else 'due_soon' end;
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

do $$
begin
  perform cron.schedule('people-success-probation-reminders', '30 3 * * *', 'select public.send_probation_reminders()');
exception when others then
  raise notice 'pg_cron not available (%)', sqlerrm;
end $$;
