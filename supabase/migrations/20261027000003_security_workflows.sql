-- People Success: row level security, workflow guards and side effects

-- ---------------------------------------------------------------------------
-- Generic workflow guard.
--   TG_ARGV[0]: comma separated statuses the employee may set on their own row.
-- Anyone who is not HR / in the management chain may only move a row into one
-- of those statuses, and may not touch a row that has already been processed
-- (except to cancel / withdraw it).
-- ---------------------------------------------------------------------------
create or replace function public.guard_workflow()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := string_to_array(TG_ARGV[0], ',');
  emp uuid := (to_jsonb(new) ->> 'employee_id')::uuid;
begin
  if auth.uid() is null or public.can_approve_for(emp) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not (new.status = any(allowed)) then
      raise exception 'Status % can only be set by an approver', new.status;
    end if;
    return new;
  end if;
  if new.status is distinct from old.status and not (new.status = any(allowed)) then
    raise exception 'Status % can only be set by an approver', new.status;
  end if;
  if not (old.status = any(allowed)) and new.status not in ('cancelled','withdrawn') then
    raise exception 'This request has already been processed';
  end if;
  return new;
end $$;

-- Generic notifications for request workflows.
--   TG_ARGV[0]: label, TG_ARGV[1]: link for employee, TG_ARGV[2]: link for approver,
--   TG_ARGV[3]: comma separated statuses that mean "awaiting approval"
create or replace function public.notify_workflow()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  label text := TG_ARGV[0];
  emp_link text := TG_ARGV[1];
  approver_link text := TG_ARGV[2];
  waiting text[] := string_to_array(TG_ARGV[3], ',');
  emp uuid := (to_jsonb(new) ->> 'employee_id')::uuid;
  emp_name text;
  mgr uuid;
  actor uuid := public.auth_employee_id();
begin
  select full_name, manager_id into emp_name, mgr from public.employees where id = emp;
  if (tg_op = 'INSERT' and new.status = any(waiting))
     or (tg_op = 'UPDATE' and new.status is distinct from old.status and new.status = any(waiting)) then
    if mgr is not null and mgr is distinct from actor then
      perform public.notify(mgr, label || ' awaiting your approval', emp_name || ' submitted a ' || lower(label) || '.', approver_link);
    end if;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and emp is distinct from actor then
    perform public.notify(emp, 'Your ' || lower(label) || ' was ' || replace(new.status, '_', ' '), null, emp_link);
  end if;
  return new;
end $$;

-- Attach guard + notification triggers to request tables
create trigger leave_guard before insert or update on public.leave_requests
  for each row execute function public.guard_workflow('pending,cancelled');
create trigger leave_notify after insert or update on public.leave_requests
  for each row execute function public.notify_workflow('Leave request', '/leave/details', '/leave/approvals', 'pending');

create trigger regularization_guard before insert or update on public.regularization_requests
  for each row execute function public.guard_workflow('pending,cancelled');
create trigger regularization_notify after insert or update on public.regularization_requests
  for each row execute function public.notify_workflow('Regularization request', '/attendance/regularization', '/attendance/bulk-approval', 'pending');

create trigger compoff_guard before insert or update on public.compoff_requests
  for each row execute function public.guard_workflow('pending,cancelled');
create trigger compoff_notify after insert or update on public.compoff_requests
  for each row execute function public.notify_workflow('Comp-off request', '/attendance/compoff', '/attendance/bulk-approval', 'pending');

create trigger claims_guard before insert or update on public.claims
  for each row execute function public.guard_workflow('draft,submitted,cancelled');
create trigger claims_notify after insert or update on public.claims
  for each row execute function public.notify_workflow('Reimbursement claim', '/reimbursement/claims', '/reimbursement/approvals', 'submitted');

create trigger vpf_guard before insert or update on public.vpf_declarations
  for each row execute function public.guard_workflow('pending,cancelled');
create trigger vpf_notify after insert or update on public.vpf_declarations
  for each row execute function public.notify_workflow('VPF declaration', '/payroll/vpf', '/payroll/admin', 'none');

create trigger fbp_guard before insert or update on public.fbp_declarations
  for each row execute function public.guard_workflow('draft,submitted');
create trigger fbp_notify after update on public.fbp_declarations
  for each row execute function public.notify_workflow('FBP declaration', '/payroll/fbp', '/payroll/admin', 'none');

create trigger investment_guard before insert or update on public.investment_declarations
  for each row execute function public.guard_workflow('draft,submitted');
create trigger investment_notify after update on public.investment_declarations
  for each row execute function public.notify_workflow('Investment declaration', '/payroll/investments', '/payroll/admin', 'none');

create trigger letter_request_guard before insert or update on public.letter_requests
  for each row execute function public.guard_workflow('pending,cancelled');
create trigger letter_request_notify after update on public.letter_requests
  for each row execute function public.notify_workflow('Letter request', '/hris/letters', '/hris/admin/letters', 'none');

create trigger goals_guard before insert or update on public.goals
  for each row when (new.employee_id is not null)
  execute function public.guard_workflow('draft,pending_approval,completed');
create trigger goals_notify after insert or update on public.goals
  for each row when (new.employee_id is not null)
  execute function public.notify_workflow('Goal', '/performance/goals', '/performance/team-goals', 'pending_approval');

create trigger resignation_guard before insert or update on public.resignations
  for each row execute function public.guard_workflow('pending_manager,withdrawn');
create trigger resignation_notify after insert or update on public.resignations
  for each row execute function public.notify_workflow('Resignation', '/exit/status', '/exit/approvals', 'pending_manager');

-- Reviews: employee may only write the self-assessment section
create or replace function public.guard_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.can_approve_for(new.employee_id) then
    return new;
  end if;
  if old.status <> 'pending_self' then
    raise exception 'Self review already submitted';
  end if;
  if new.status not in ('pending_self','pending_manager')
     or new.manager_rating is distinct from old.manager_rating
     or new.manager_comments is distinct from old.manager_comments
     or new.final_rating is distinct from old.final_rating
     or new.reviewer_id is distinct from old.reviewer_id
     or new.cycle_id is distinct from old.cycle_id
     or new.employee_id is distinct from old.employee_id then
    raise exception 'You can only update your self review';
  end if;
  return new;
end $$;
create trigger reviews_guard before update on public.reviews
  for each row execute function public.guard_review();
create trigger reviews_notify after update on public.reviews
  for each row execute function public.notify_workflow('Performance review', '/performance/reviews', '/performance/team-reviews', 'pending_manager');

-- ---------------------------------------------------------------------------
-- Side effects
-- ---------------------------------------------------------------------------

-- Leave balance bookkeeping
create or replace function public.apply_leave_balance()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  yr int := extract(year from new.start_date)::int;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    insert into public.leave_balances (employee_id, leave_type_id, year, allocated, used)
    values (new.employee_id, new.leave_type_id, yr, 0, new.days)
    on conflict (employee_id, leave_type_id, year)
    do update set used = public.leave_balances.used + excluded.used;
  elsif old.status = 'approved' and new.status in ('cancelled','rejected') then
    update public.leave_balances set used = greatest(used - old.days, 0)
    where employee_id = old.employee_id and leave_type_id = old.leave_type_id
      and year = extract(year from old.start_date)::int;
  end if;
  return new;
end $$;
create trigger leave_balance_effect after update on public.leave_requests
  for each row execute function public.apply_leave_balance();

-- Approved regularization writes the attendance record
create or replace function public.apply_regularization()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    insert into public.attendance_records (employee_id, date, check_in, check_out, status, work_mode, source, notes)
    values (
      new.employee_id, new.date, new.check_in, new.check_out,
      case new.request_type when 'wfh' then 'wfh' when 'on_duty' then 'on_duty' else 'present' end,
      case new.request_type when 'wfh' then 'remote' else 'office' end,
      'regularization', new.reason)
    on conflict (employee_id, date) do update set
      check_in = excluded.check_in, check_out = excluded.check_out,
      status = excluded.status, work_mode = excluded.work_mode,
      source = 'regularization', notes = excluded.notes;
  end if;
  return new;
end $$;
create trigger regularization_effect after update on public.regularization_requests
  for each row execute function public.apply_regularization();

-- Approved comp-off credits the COMP leave balance
create or replace function public.apply_compoff()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  comp_id uuid;
  yr int := extract(year from public.org_today())::int;
begin
  select id into comp_id from public.leave_types where code = 'COMP';
  if comp_id is null then return new; end if;
  if new.status = 'approved' and old.status is distinct from 'approved' then
    insert into public.leave_balances (employee_id, leave_type_id, year, allocated, used)
    values (new.employee_id, comp_id, yr, new.days, 0)
    on conflict (employee_id, leave_type_id, year)
    do update set allocated = public.leave_balances.allocated + excluded.allocated;
  elsif old.status = 'approved' and new.status in ('cancelled','rejected') then
    update public.leave_balances set allocated = greatest(allocated - old.days, 0)
    where employee_id = old.employee_id and leave_type_id = comp_id and year = yr;
  end if;
  return new;
end $$;
create trigger compoff_effect after update on public.compoff_requests
  for each row execute function public.apply_compoff();

-- Resignation lifecycle: notify HR, start clearance, update employee status
create or replace function public.apply_resignation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  hr record;
  emp_name text;
begin
  select full_name into emp_name from public.employees where id = new.employee_id;
  if new.status = 'pending_hr' and old.status is distinct from 'pending_hr' then
    for hr in select id from public.employees where role = 'hr_admin' and status <> 'exited' loop
      perform public.notify(hr.id, 'Resignation awaiting HR approval', emp_name || ' resignation was approved by their manager.', '/exit/approvals');
    end loop;
  end if;
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update public.employees set status = 'notice_period' where id = new.employee_id;
    insert into public.exit_clearances (resignation_id, department)
    select new.id, d from unnest(array['Reporting Manager','IT','Finance','Admin','HR']) as d
    on conflict do nothing;
  elsif new.status = 'completed' and old.status is distinct from 'completed' then
    update public.employees set status = 'exited' where id = new.employee_id;
  elsif new.status in ('withdrawn','rejected') and old.status = 'approved' then
    update public.employees set status = 'active' where id = new.employee_id;
  end if;
  return new;
end $$;
create trigger resignation_effect after update on public.resignations
  for each row execute function public.apply_resignation();

-- Notify on issued letters / published payslips / new assignments
create or replace function public.notify_letter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify(new.employee_id, 'New letter issued: ' || new.title, null,
    case when new.category = 'salary' then '/hris/salary-letters' else '/hris/letters' end);
  return new;
end $$;
create trigger letters_notify after insert on public.letters for each row execute function public.notify_letter();

create or replace function public.notify_payslip()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    perform public.notify(new.employee_id,
      'Payslip for ' || to_char(make_date(new.year, new.month, 1), 'Mon YYYY') || ' is available', null, '/payroll/slips');
  end if;
  return new;
end $$;
create trigger payslips_notify after insert or update on public.payslips for each row execute function public.notify_payslip();

create or replace function public.notify_enrollment()
returns trigger language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if new.assigned_by is not null and new.assigned_by <> new.employee_id then
    select title into c from public.courses where id = new.course_id;
    perform public.notify(new.employee_id, 'Course assigned: ' || c, null, '/learning/my-courses');
  end if;
  return new;
end $$;
create trigger enrollment_notify after insert on public.course_enrollments for each row execute function public.notify_enrollment();

create or replace function public.notify_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.employee_id is distinct from public.auth_employee_id() then
    perform public.notify(new.employee_id, 'Ticket HD-' || new.seq || ' is ' || replace(new.status, '_', ' '), new.subject, '/apps/helpdesk/' || new.id);
  end if;
  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform public.notify(new.assigned_to, 'Ticket HD-' || new.seq || ' assigned to you', new.subject, '/apps/helpdesk/' || new.id);
  end if;
  return new;
end $$;
create trigger tickets_notify after insert or update on public.helpdesk_tickets for each row execute function public.notify_ticket();

create or replace function public.stamp_ticket_resolved()
returns trigger language plpgsql as $$
begin
  if new.status = 'resolved' and (tg_op = 'INSERT' or old.status is distinct from 'resolved') then
    new.resolved_at := now();
  elsif new.status in ('open','in_progress') then
    new.resolved_at := null;
  end if;
  return new;
end $$;
create trigger tickets_resolved before insert or update on public.helpdesk_tickets for each row execute function public.stamp_ticket_resolved();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'contracts','letters','letter_requests','policies','policy_acknowledgements','faqs',
    'leave_types','leave_balances','leave_requests','holidays',
    'attendance_records','regularization_requests','compoff_requests',
    'salary_structures','payslips','vpf_declarations','fbp_declarations','investment_declarations',
    'claim_categories','claims',
    'review_cycles','goals','goal_updates','reviews',
    'resignations','exit_clearances',
    'courses','course_enrollments',
    'job_openings','candidates','interviews',
    'helpdesk_tickets','ticket_comments','declaration_forms','declaration_responses','addons'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Reference data readable by everyone, managed by HR
do $$
declare t text;
begin
  foreach t in array array['policies','faqs','leave_types','holidays','claim_categories','review_cycles','courses','job_openings','declaration_forms','addons'] loop
    execute format('create policy "read %1$s" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "hr manage %1$s" on public.%1$I for all to authenticated using (public.is_hr()) with check (public.is_hr())', t);
  end loop;
end $$;

-- Employee-owned request tables: own rows + approver chain; HR full access
do $$
declare t text;
begin
  foreach t in array array[
    'letter_requests','leave_requests','regularization_requests','compoff_requests',
    'vpf_declarations','fbp_declarations','investment_declarations','claims','resignations'
  ] loop
    execute format('create policy "select %1$s" on public.%1$I for select to authenticated using (employee_id = public.auth_employee_id() or public.can_approve_for(employee_id))', t);
    execute format('create policy "insert %1$s" on public.%1$I for insert to authenticated with check (employee_id = public.auth_employee_id() or public.is_hr())', t);
    execute format('create policy "update %1$s" on public.%1$I for update to authenticated using (employee_id = public.auth_employee_id() or public.can_approve_for(employee_id)) with check (employee_id = public.auth_employee_id() or public.can_approve_for(employee_id))', t);
    execute format('create policy "delete %1$s" on public.%1$I for delete to authenticated using (public.is_hr())', t);
  end loop;
end $$;

-- HR-issued records, visible to the employee
do $$
declare t text;
begin
  foreach t in array array['contracts','letters','salary_structures','payslips'] loop
    execute format('create policy "select %1$s" on public.%1$I for select to authenticated using (employee_id = public.auth_employee_id() or public.is_hr())', t);
    execute format('create policy "hr manage %1$s" on public.%1$I for all to authenticated using (public.is_hr()) with check (public.is_hr())', t);
  end loop;
end $$;

-- Policy acknowledgements
create policy "select acks" on public.policy_acknowledgements for select to authenticated
  using (employee_id = public.auth_employee_id() or public.is_hr());
create policy "insert own ack" on public.policy_acknowledgements for insert to authenticated
  with check (employee_id = public.auth_employee_id());

-- Leave balances: read own / team; HR manages allocations
create policy "select balances" on public.leave_balances for select to authenticated
  using (employee_id = public.auth_employee_id() or public.can_approve_for(employee_id));
create policy "hr manage balances" on public.leave_balances for all to authenticated
  using (public.is_hr()) with check (public.is_hr());

-- Attendance: employees may only punch for today
create policy "select attendance" on public.attendance_records for select to authenticated
  using (employee_id = public.auth_employee_id() or public.can_approve_for(employee_id));
create policy "punch in today" on public.attendance_records for insert to authenticated
  with check ((employee_id = public.auth_employee_id() and date = public.org_today() and source in ('web','mobile')) or public.is_hr());
create policy "punch out today" on public.attendance_records for update to authenticated
  using ((employee_id = public.auth_employee_id() and date = public.org_today()) or public.is_hr())
  with check ((employee_id = public.auth_employee_id() and date = public.org_today() and source in ('web','mobile')) or public.is_hr());
create policy "hr delete attendance" on public.attendance_records for delete to authenticated using (public.is_hr());

-- Goals: organisation objectives are public; personal goals for owner + chain
create policy "select goals" on public.goals for select to authenticated
  using (employee_id is null or employee_id = public.auth_employee_id() or public.can_approve_for(employee_id));
create policy "insert goals" on public.goals for insert to authenticated
  with check (
    (employee_id is null and public.is_hr())
    or employee_id = public.auth_employee_id()
    or public.can_approve_for(employee_id));
create policy "update goals" on public.goals for update to authenticated
  using ((employee_id is null and public.is_hr()) or employee_id = public.auth_employee_id() or public.can_approve_for(employee_id))
  with check ((employee_id is null and public.is_hr()) or employee_id = public.auth_employee_id() or public.can_approve_for(employee_id));
create policy "delete goals" on public.goals for delete to authenticated
  using (public.is_hr() or (employee_id = public.auth_employee_id() and status in ('draft','rejected')) or public.is_manager_of(employee_id));

create policy "select goal updates" on public.goal_updates for select to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id
    and (g.employee_id is null or g.employee_id = public.auth_employee_id() or public.can_approve_for(g.employee_id))));
create policy "insert goal updates" on public.goal_updates for insert to authenticated
  with check (author_id = public.auth_employee_id() and exists (select 1 from public.goals g where g.id = goal_id
    and (g.employee_id = public.auth_employee_id() or public.can_approve_for(g.employee_id))));

create policy "select reviews" on public.reviews for select to authenticated
  using (employee_id = public.auth_employee_id() or public.can_approve_for(employee_id));
create policy "insert reviews" on public.reviews for insert to authenticated
  with check (public.can_approve_for(employee_id));
create policy "update reviews" on public.reviews for update to authenticated
  using (employee_id = public.auth_employee_id() or public.can_approve_for(employee_id))
  with check (employee_id = public.auth_employee_id() or public.can_approve_for(employee_id));
create policy "hr delete reviews" on public.reviews for delete to authenticated using (public.is_hr());

-- Exit clearances: HR and the exiting employee's manager
create policy "select clearances" on public.exit_clearances for select to authenticated
  using (exists (select 1 from public.resignations r where r.id = resignation_id
    and (r.employee_id = public.auth_employee_id() or public.can_approve_for(r.employee_id))));
create policy "manage clearances" on public.exit_clearances for all to authenticated
  using (exists (select 1 from public.resignations r where r.id = resignation_id and public.can_approve_for(r.employee_id)))
  with check (exists (select 1 from public.resignations r where r.id = resignation_id and public.can_approve_for(r.employee_id)));

-- Learning
create policy "select enrollments" on public.course_enrollments for select to authenticated
  using (employee_id = public.auth_employee_id() or public.can_approve_for(employee_id));
create policy "insert enrollments" on public.course_enrollments for insert to authenticated
  with check (employee_id = public.auth_employee_id() or public.can_approve_for(employee_id));
create policy "update enrollments" on public.course_enrollments for update to authenticated
  using (employee_id = public.auth_employee_id() or public.can_approve_for(employee_id))
  with check (employee_id = public.auth_employee_id() or public.can_approve_for(employee_id));
create policy "delete enrollments" on public.course_enrollments for delete to authenticated
  using (public.is_hr() or public.is_manager_of(employee_id));

-- Recruit
create policy "select candidates" on public.candidates for select to authenticated
  using (public.is_hr() or referred_by = public.auth_employee_id()
    or exists (select 1 from public.job_openings j where j.id = job_id and j.hiring_manager_id = public.auth_employee_id()));
create policy "insert candidates" on public.candidates for insert to authenticated
  with check (public.is_hr() or (source = 'referral' and referred_by = public.auth_employee_id() and stage = 'applied'));
create policy "update candidates" on public.candidates for update to authenticated
  using (public.is_hr() or exists (select 1 from public.job_openings j where j.id = job_id and j.hiring_manager_id = public.auth_employee_id()))
  with check (public.is_hr() or exists (select 1 from public.job_openings j where j.id = job_id and j.hiring_manager_id = public.auth_employee_id()));
create policy "hr delete candidates" on public.candidates for delete to authenticated using (public.is_hr());

create policy "select interviews" on public.interviews for select to authenticated
  using (public.is_hr() or interviewer_id = public.auth_employee_id()
    or exists (select 1 from public.candidates c join public.job_openings j on j.id = c.job_id
      where c.id = candidate_id and j.hiring_manager_id = public.auth_employee_id()));
create policy "manage interviews" on public.interviews for all to authenticated
  using (public.is_hr() or exists (select 1 from public.candidates c join public.job_openings j on j.id = c.job_id
      where c.id = candidate_id and j.hiring_manager_id = public.auth_employee_id()))
  with check (public.is_hr() or exists (select 1 from public.candidates c join public.job_openings j on j.id = c.job_id
      where c.id = candidate_id and j.hiring_manager_id = public.auth_employee_id()));
create policy "interviewer feedback" on public.interviews for update to authenticated
  using (interviewer_id = public.auth_employee_id()) with check (interviewer_id = public.auth_employee_id());

-- Helpdesk
create policy "select tickets" on public.helpdesk_tickets for select to authenticated
  using (employee_id = public.auth_employee_id() or assigned_to = public.auth_employee_id() or public.is_hr());
create policy "insert tickets" on public.helpdesk_tickets for insert to authenticated
  with check (employee_id = public.auth_employee_id());
create policy "update tickets" on public.helpdesk_tickets for update to authenticated
  using (employee_id = public.auth_employee_id() or assigned_to = public.auth_employee_id() or public.is_hr())
  with check (employee_id = public.auth_employee_id() or assigned_to = public.auth_employee_id() or public.is_hr());
create policy "hr delete tickets" on public.helpdesk_tickets for delete to authenticated using (public.is_hr());

create policy "select ticket comments" on public.ticket_comments for select to authenticated
  using (exists (select 1 from public.helpdesk_tickets t where t.id = ticket_id
    and (t.employee_id = public.auth_employee_id() or t.assigned_to = public.auth_employee_id() or public.is_hr())));
create policy "insert ticket comments" on public.ticket_comments for insert to authenticated
  with check (author_id = public.auth_employee_id() and exists (select 1 from public.helpdesk_tickets t where t.id = ticket_id
    and (t.employee_id = public.auth_employee_id() or t.assigned_to = public.auth_employee_id() or public.is_hr())));

-- Declarations
create policy "select responses" on public.declaration_responses for select to authenticated
  using (employee_id = public.auth_employee_id() or public.is_hr());
create policy "insert own response" on public.declaration_responses for insert to authenticated
  with check (employee_id = public.auth_employee_id());
create policy "update own response" on public.declaration_responses for update to authenticated
  using (employee_id = public.auth_employee_id()) with check (employee_id = public.auth_employee_id());

-- ---------------------------------------------------------------------------
-- Storage: private "documents" bucket (receipts, resumes, attachments),
-- public "avatars" bucket. Files live under <auth uid>/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10485760), ('avatars', 'avatars', true, 2097152)
on conflict (id) do nothing;

create policy "upload own documents" on storage.objects for insert to authenticated
  with check (bucket_id in ('documents','avatars') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "update own documents" on storage.objects for update to authenticated
  using (bucket_id in ('documents','avatars') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read own documents" on storage.objects for select to authenticated
  using ((bucket_id = 'documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_hr()))
         or bucket_id = 'avatars');
create policy "delete own documents" on storage.objects for delete to authenticated
  using (bucket_id in ('documents','avatars') and (storage.foldername(name))[1] = auth.uid()::text);
