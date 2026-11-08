-- QA (time & money): database-side integrity for Leave, Attendance, Payroll declarations
-- and Reimbursement.
--
-- The server actions validate everything, but the tables are also reachable
-- directly through the REST API with a signed-in user's token. The generic
-- guard_workflow() trigger only polices the *status* column, so an employee
-- could, for example:
--   * insert a 5-day leave with days = 0.5 (only 0.5 deducted on approval),
--   * edit the dates / days of a pending leave after applying,
--   * cancel an approved leave that was already taken (balance restored),
--   * cancel a paid claim (frees the FBP claim balance for a second payout),
--   * raise claims above the category limit, or point receipt_path at
--     another user's file (the app signs it with the service role),
--   * regularize future dates / claim comp-off for future dates,
--   * use another user's selfie path for a remote check-in.
-- HR (is_hr() makes can_approve_for() true for everyone, including
-- themselves) could also approve their own leave / claims via the API, and
-- managers could approve payroll declarations, which are HR-only.
--
-- These triggers run after the generic guards (alphabetical order) and only
-- apply to signed-in users; server jobs and SQL (auth.uid() is null) pass.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Chargeable leave days: Mon-Fri that are not public holidays (org-wide or the
-- employee's location). Optional holidays are working days. Mirrors
-- computeLeaveDays() in src/app/(portal)/leave/_lib/dates.ts.
create or replace function public.leave_working_days(p_emp uuid, p_start date, p_end date, p_half boolean default false)
returns numeric language sql stable security definer set search_path = public as $$
  with loc as (select location_id from public.employees where id = p_emp),
  d as (select g::date as day from generate_series(p_start, p_end, interval '1 day') g)
  select case when p_half and p_start = p_end and count(*) = 1 then 0.5 else count(*)::numeric end
  from d
  where extract(isodow from d.day) < 6
    and not exists (
      select 1 from public.holidays h
      where h.date = d.day and h.type = 'public'
        and (h.location_id is null or h.location_id = (select location_id from loc))
    )
$$;
revoke execute on function public.leave_working_days(uuid, date, date, boolean) from public, anon;
grant execute on function public.leave_working_days(uuid, date, date, boolean) to authenticated, service_role;

-- "2026-27" for today (India time)
create or replace function public.current_fy_label()
returns text language sql stable set search_path = public as $$
  select case when extract(month from public.org_today()) >= 4
              then extract(year from public.org_today())::int
              else extract(year from public.org_today())::int - 1 end::text
         || '-' || lpad((((case when extract(month from public.org_today()) >= 4
              then extract(year from public.org_today())::int
              else extract(year from public.org_today())::int - 1 end) + 1) % 100)::text, 2, '0')
$$;

-- ---------------------------------------------------------------------------
-- Leave requests
-- ---------------------------------------------------------------------------
create or replace function public.guard_leave_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.auth_employee_id();
  is_self boolean := coalesce(new.employee_id = me, false);
  lt record;
  expected numeric;
  avail numeric;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select * into lt from public.leave_types where id = new.leave_type_id;
    if lt.id is null or not lt.active then
      raise exception 'This leave type is not available';
    end if;
    if new.half_day then
      if not lt.allow_half_day then
        raise exception '% cannot be taken as a half day', lt.name;
      end if;
      if new.start_date <> new.end_date or new.half_day_session is null then
        raise exception 'Half day is only allowed for a single day, with a session';
      end if;
    else
      new.half_day_session := null;
    end if;
    if extract(year from new.start_date) <> extract(year from new.end_date) then
      raise exception 'Leave cannot span two calendar years';
    end if;
    if new.end_date - new.start_date + 1 > 90 then
      raise exception 'A single request can cover at most 90 days';
    end if;
    -- The day count always comes from the calendar, never from the client.
    expected := public.leave_working_days(new.employee_id, new.start_date, new.end_date, new.half_day);
    if expected <= 0 then
      raise exception 'The selected dates fall on weekends or holidays — no working days to apply for';
    end if;
    new.days := expected;

    if is_self then
      if new.status <> 'pending' then
        raise exception 'A new leave request must go to your approver';
      end if;
      new.approver_id := null;
      new.approver_remarks := null;
      new.actioned_at := null;
      if new.start_date < public.org_today() - 30 then
        raise exception 'Leave can be backdated by at most 30 days';
      end if;
    end if;

    -- One request at a time per employee, so overlap / balance checks can't race.
    perform pg_advisory_xact_lock(hashtext('leave_request:' || new.employee_id::text));
    if exists (
      select 1 from public.leave_requests o
      where o.employee_id = new.employee_id and o.status in ('pending','approved')
        and o.start_date <= new.end_date and o.end_date >= new.start_date
        and not (new.half_day and o.half_day and o.start_date = new.start_date
                 and o.half_day_session is distinct from new.half_day_session)
    ) then
      raise exception 'You already have a leave request overlapping these dates';
    end if;
    if is_self and lt.is_paid then
      select coalesce(sum(b.allocated - b.used), 0) into avail
        from public.leave_balances b
       where b.employee_id = new.employee_id and b.leave_type_id = new.leave_type_id
         and b.year = extract(year from new.start_date)::int;
      select avail - coalesce(sum(p.days), 0) into avail
        from public.leave_requests p
       where p.employee_id = new.employee_id and p.leave_type_id = new.leave_type_id and p.status = 'pending'
         and extract(year from p.start_date) = extract(year from new.start_date);
      if new.days > avail then
        raise exception 'Insufficient % balance: % available, % requested', lt.name, trim_scale(greatest(avail, 0)), trim_scale(new.days);
      end if;
    end if;
    return new;
  end if;

  -- UPDATE: a request is immutable apart from its workflow fields.
  if new.employee_id is distinct from old.employee_id
     or new.leave_type_id is distinct from old.leave_type_id
     or new.start_date is distinct from old.start_date
     or new.end_date is distinct from old.end_date
     or new.half_day is distinct from old.half_day
     or new.half_day_session is distinct from old.half_day_session
     or new.days is distinct from old.days
     or new.reason is distinct from old.reason
     or new.created_at is distinct from old.created_at then
    raise exception 'A leave request cannot be edited — cancel it and apply again';
  end if;

  if is_self or not public.can_approve_for(new.employee_id) then
    -- Own request (HR included): the only change allowed is cancelling it.
    new.approver_id := old.approver_id;
    new.approver_remarks := old.approver_remarks;
    new.actioned_at := old.actioned_at;
    if new.status is not distinct from old.status then
      return new;
    end if;
    if new.status <> 'cancelled' then
      raise exception 'You cannot approve or reject your own leave';
    end if;
    if not (old.status = 'pending' or (old.status = 'approved' and old.start_date > public.org_today())) then
      raise exception 'Only pending leave, or approved leave that has not started, can be cancelled';
    end if;
    return new;
  end if;

  -- Approver (manager chain / HR) acting on someone else's request.
  if new.status is not distinct from old.status then
    return new;
  end if;
  if not ((old.status = 'pending' and new.status in ('approved','rejected','cancelled'))
          or (old.status = 'approved' and new.status = 'cancelled')) then
    raise exception 'This leave request is already %', old.status;
  end if;
  if new.status = 'approved' then
    select * into lt from public.leave_types where id = new.leave_type_id;
    if lt.is_paid then
      -- Lock the balance row so two approvals can't both spend the last days.
      perform 1 from public.leave_balances b
       where b.employee_id = new.employee_id and b.leave_type_id = new.leave_type_id
         and b.year = extract(year from new.start_date)::int
       for update;
      select coalesce(sum(b.allocated - b.used), 0) into avail
        from public.leave_balances b
       where b.employee_id = new.employee_id and b.leave_type_id = new.leave_type_id
         and b.year = extract(year from new.start_date)::int;
      if new.days > avail then
        raise exception 'Insufficient % balance: % available, % requested', lt.name, trim_scale(greatest(avail, 0)), trim_scale(new.days);
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists leave_integrity_guard on public.leave_requests;
create trigger leave_integrity_guard before insert or update on public.leave_requests
  for each row execute function public.guard_leave_integrity();

-- ---------------------------------------------------------------------------
-- Regularization requests
-- ---------------------------------------------------------------------------
create or replace function public.guard_regularization_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_self boolean := coalesce(new.employee_id = public.auth_employee_id(), false);
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if is_self then
      if new.status <> 'pending' then
        raise exception 'A new request must go to your approver';
      end if;
      new.approver_id := null;
      new.approver_remarks := null;
      new.actioned_at := null;
      if new.date > public.org_today() then
        raise exception 'You can''t regularize a future date';
      end if;
      if new.date < public.org_today() - 30 then
        raise exception 'Only the last 30 days can be regularized';
      end if;
      if new.check_out > now() then
        raise exception 'Check-out time can''t be in the future';
      end if;
    end if;
    if new.check_out <= new.check_in then
      raise exception 'Check-out must be after check-in';
    end if;
    if (new.check_in at time zone 'Asia/Kolkata')::date <> new.date then
      raise exception 'Check-in must be on the regularized date';
    end if;
    return new;
  end if;

  if new.employee_id is distinct from old.employee_id
     or new.date is distinct from old.date
     or new.request_type is distinct from old.request_type
     or new.check_in is distinct from old.check_in
     or new.check_out is distinct from old.check_out
     or new.reason is distinct from old.reason
     or new.created_at is distinct from old.created_at then
    raise exception 'A regularization request cannot be edited — cancel it and raise a new one';
  end if;

  if is_self or not public.can_approve_for(new.employee_id) then
    new.approver_id := old.approver_id;
    new.approver_remarks := old.approver_remarks;
    new.actioned_at := old.actioned_at;
    if new.status is not distinct from old.status then
      return new;
    end if;
    if new.status <> 'cancelled' or old.status <> 'pending' then
      raise exception 'Only your pending requests can be cancelled';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     and not (old.status = 'pending' and new.status in ('approved','rejected','cancelled')) then
    raise exception 'This request is already %', old.status;
  end if;
  return new;
end $$;

drop trigger if exists regularization_integrity_guard on public.regularization_requests;
create trigger regularization_integrity_guard before insert or update on public.regularization_requests
  for each row execute function public.guard_regularization_integrity();

-- ---------------------------------------------------------------------------
-- Comp-off requests
-- ---------------------------------------------------------------------------
create or replace function public.guard_compoff_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_self boolean := coalesce(new.employee_id = public.auth_employee_id(), false);
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if is_self then
      if new.status <> 'pending' then
        raise exception 'A new request must go to your approver';
      end if;
      new.approver_id := null;
      new.approver_remarks := null;
      new.actioned_at := null;
      if new.worked_date > public.org_today() then
        raise exception 'The worked date can''t be in the future';
      end if;
      if new.worked_date < public.org_today() - 60 then
        raise exception 'Comp-off must be claimed within 60 days';
      end if;
      if extract(isodow from new.worked_date) < 6 and not exists (
        select 1 from public.holidays h
        where h.date = new.worked_date and h.type = 'public'
          and (h.location_id is null or h.location_id = (select location_id from public.employees where id = new.employee_id))
      ) then
        raise exception 'Comp-off can only be claimed for work on a weekend or public holiday';
      end if;
    end if;
    perform pg_advisory_xact_lock(hashtext('compoff_request:' || new.employee_id::text));
    if exists (select 1 from public.compoff_requests c
               where c.employee_id = new.employee_id and c.worked_date = new.worked_date
                 and c.status in ('pending','approved')) then
      raise exception 'You already have a comp-off request for this date';
    end if;
    return new;
  end if;

  if new.employee_id is distinct from old.employee_id
     or new.worked_date is distinct from old.worked_date
     or new.days is distinct from old.days
     or new.reason is distinct from old.reason
     or new.created_at is distinct from old.created_at then
    raise exception 'A comp-off request cannot be edited — cancel it and raise a new one';
  end if;

  if is_self or not public.can_approve_for(new.employee_id) then
    new.approver_id := old.approver_id;
    new.approver_remarks := old.approver_remarks;
    new.actioned_at := old.actioned_at;
    new.expires_on := old.expires_on;
    if new.status is not distinct from old.status then
      return new;
    end if;
    if new.status <> 'cancelled' or old.status <> 'pending' then
      raise exception 'Only your pending requests can be cancelled';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     and not ((old.status = 'pending' and new.status in ('approved','rejected','cancelled'))
              or (old.status = 'approved' and new.status = 'cancelled')) then
    raise exception 'This request is already %', old.status;
  end if;
  -- apply_compoff() credits the balance of the year it was actioned in, so the approver
  -- can't choose that date.
  new.actioned_at := case when new.status is distinct from old.status then now() else old.actioned_at end;
  return new;
end $$;

drop trigger if exists compoff_integrity_guard on public.compoff_requests;
create trigger compoff_integrity_guard before insert or update on public.compoff_requests
  for each row execute function public.guard_compoff_integrity();

-- Credit / revoke comp-off in the leave year it was approved in (a revocation
-- in January used to debit the new year's balance instead of last year's).
create or replace function public.apply_compoff()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  comp_id uuid;
  yr int;
begin
  select id into comp_id from public.leave_types where code = 'COMP';
  if comp_id is null then return new; end if;
  if new.status = 'approved' and old.status is distinct from 'approved' then
    yr := extract(year from (coalesce(new.actioned_at, now()) at time zone 'Asia/Kolkata'))::int;
    insert into public.leave_balances (employee_id, leave_type_id, year, allocated, used)
    values (new.employee_id, comp_id, yr, new.days, 0)
    on conflict (employee_id, leave_type_id, year)
    do update set allocated = public.leave_balances.allocated + excluded.allocated;
  elsif old.status = 'approved' and new.status in ('cancelled','rejected') then
    yr := extract(year from (coalesce(old.actioned_at, now()) at time zone 'Asia/Kolkata'))::int;
    update public.leave_balances set allocated = greatest(allocated - old.days, 0)
    where employee_id = old.employee_id and leave_type_id = comp_id and year = yr;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Reimbursement claims
-- ---------------------------------------------------------------------------
create or replace function public.guard_claim_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_self boolean := coalesce(new.employee_id = public.auth_employee_id(), false);
  cat record;
  content_changed boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  content_changed := tg_op = 'INSERT' or (
       new.category_id is distinct from old.category_id
    or new.title is distinct from old.title
    or new.expense_date is distinct from old.expense_date
    or new.amount is distinct from old.amount
    or new.description is distinct from old.description
    or new.receipt_path is distinct from old.receipt_path);

  if tg_op = 'UPDATE' and (new.employee_id is distinct from old.employee_id
                           or new.seq is distinct from old.seq
                           or new.created_at is distinct from old.created_at) then
    raise exception 'A claim cannot be moved to another employee';
  end if;

  if is_self then
    new.approver_id := case when tg_op = 'INSERT' then null else old.approver_id end;
    new.approver_remarks := case when tg_op = 'INSERT' then null else old.approver_remarks end;
    new.actioned_at := case when tg_op = 'INSERT' then null else old.actioned_at end;
    new.paid_at := case when tg_op = 'INSERT' then null else old.paid_at end;

    if tg_op = 'UPDATE' and old.status <> 'draft' then
      if old.status = 'submitted' and new.status = 'cancelled' and not content_changed then
        return new;
      end if;
      if new.status is not distinct from old.status and not content_changed then
        return new;
      end if;
      raise exception 'This claim is already % and can no longer be changed', old.status;
    end if;

    -- Cancelling an untouched draft is always allowed, even if it no longer meets today's rules
    -- (e.g. HR lowered the category cap after it was saved).
    if tg_op = 'UPDATE' and old.status = 'draft' and new.status = 'cancelled' and not content_changed then
      return new;
    end if;

    -- New claim or own draft.
    if new.status not in ('draft','submitted','cancelled') then
      raise exception 'Status % can only be set by an approver', new.status;
    end if;
    select * into cat from public.claim_categories where id = new.category_id;
    if cat.id is null then
      raise exception 'Please choose a valid category';
    end if;
    if not cat.active and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id) then
      raise exception 'This category is no longer active';
    end if;
    if new.expense_date > public.org_today() then
      raise exception 'Expense date cannot be in the future';
    end if;
    if cat.max_amount is not null and new.amount > cat.max_amount then
      raise exception '% claims are limited to %', cat.name, cat.max_amount;
    end if;
    if new.receipt_path is not null
       and (tg_op = 'INSERT' or new.receipt_path is distinct from old.receipt_path)
       and new.receipt_path not like auth.uid()::text || '/%' then
      raise exception 'Invalid receipt file';
    end if;
    if new.status = 'submitted' and cat.requires_receipt and new.receipt_path is null then
      raise exception 'A receipt is required for % claims', cat.name;
    end if;
    return new;
  end if;

  -- HR / manager chain acting on someone else's claim.
  if tg_op = 'INSERT' then
    return new;
  end if;
  if content_changed then
    raise exception 'Approvers cannot edit claim details';
  end if;
  if new.status is distinct from old.status then
    if not ((old.status = 'submitted' and new.status in ('approved','rejected','cancelled'))
            or (old.status = 'draft' and new.status = 'cancelled')
            or (old.status = 'approved' and new.status = 'paid')) then
      raise exception 'This claim is already %', old.status;
    end if;
    if new.status = 'paid' and not public.is_hr() then
      raise exception 'Only HR can mark claims as paid';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists claims_integrity_guard on public.claims;
create trigger claims_integrity_guard before insert or update on public.claims
  for each row execute function public.guard_claim_integrity();

-- ---------------------------------------------------------------------------
-- Payroll declarations (VPF / FBP / investments) — HR-only review
-- ---------------------------------------------------------------------------

-- Salary & tax declarations are between the employee and HR: managers no
-- longer read or write their reports' declarations.
do $$
declare t text;
begin
  foreach t in array array['vpf_declarations','fbp_declarations','investment_declarations'] loop
    execute format('drop policy if exists "select %1$s" on public.%1$I', t);
    execute format('drop policy if exists "update %1$s" on public.%1$I', t);
    execute format('create policy "select %1$s" on public.%1$I for select to authenticated using (employee_id = public.auth_employee_id() or public.is_hr())', t);
    execute format('create policy "update %1$s" on public.%1$I for update to authenticated using (employee_id = public.auth_employee_id() or public.is_hr()) with check (employee_id = public.auth_employee_id() or public.is_hr())', t);
  end loop;
end $$;

create or replace function public.guard_declaration_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  kind text := TG_ARGV[0];
  is_self boolean := coalesce(new.employee_id = public.auth_employee_id(), false);
  doc jsonb := to_jsonb(new);
  prev jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  content_changed boolean;
  fbp_total numeric;
  declared numeric;
  el jsonb;
  lim numeric;
begin
  if auth.uid() is null then
    return new;
  end if;

  content_changed := tg_op = 'INSERT' or (
    (doc - array['status','approver_id','approver_remarks','actioned_at','submitted_at'])
    is distinct from
    (prev - array['status','approver_id','approver_remarks','actioned_at','submitted_at']));

  if not is_self then
    if not public.is_hr() then
      raise exception 'Only HR can review payroll declarations';
    end if;
    if tg_op = 'UPDATE' and content_changed then
      raise exception 'HR cannot edit the employee''s declaration';
    end if;
    -- HR reviews what was submitted (approve / reject / return) or reopens a decision; nothing else.
    if tg_op = 'UPDATE' and new.status is distinct from old.status
       and not ((old.status in ('pending','submitted') and new.status in ('approved','rejected','draft'))
                or (old.status in ('approved','rejected') and new.status = 'draft')) then
      raise exception 'This declaration is already %', old.status;
    end if;
    return new;
  end if;

  -- Employee (HR included) on their own declaration.
  new.approver_id := case when tg_op = 'INSERT' then null else old.approver_id end;
  new.approver_remarks := case when tg_op = 'INSERT' then null else old.approver_remarks end;
  new.actioned_at := case when tg_op = 'INSERT' then null else old.actioned_at end;

  if kind = 'vpf' then
    if tg_op = 'INSERT' then
      if new.status <> 'pending' then
        raise exception 'A new VPF request must go to HR';
      end if;
      if new.effective_month < date_trunc('month', public.org_today())::date then
        raise exception 'Effective month cannot be in the past';
      end if;
      return new;
    end if;
    if content_changed then
      raise exception 'A VPF request cannot be edited — cancel it and raise a new one';
    end if;
    if new.status is distinct from old.status and not (old.status = 'pending' and new.status = 'cancelled') then
      raise exception 'Only pending requests can be cancelled';
    end if;
    return new;
  end if;

  -- FBP / investments
  if tg_op = 'INSERT' then
    if new.financial_year <> public.current_fy_label() then
      raise exception 'Declarations can only be made for the current financial year';
    end if;
  elsif old.status = 'submitted' then
    if content_changed or new.status not in ('submitted','draft') then
      raise exception 'Your declaration is with HR. Recall it to make changes.';
    end if;
    return new;
  elsif old.status <> 'draft' then
    if content_changed or new.status is distinct from old.status then
      raise exception 'Your declaration is %; contact HR to reopen it', old.status;
    end if;
    return new;
  end if;
  if new.status not in ('draft','submitted') then
    raise exception 'Status % can only be set by HR', new.status;
  end if;

  if kind = 'fbp' then
    if jsonb_typeof(new.components) <> 'array' then
      raise exception 'Invalid FBP components';
    end if;
    declared := 0;
    for el in select * from jsonb_array_elements(new.components) loop
      lim := case el ->> 'code'
        when 'fuel' then 60000 when 'telephone' then 24000 when 'meal' then 26400
        when 'books' then 12000 when 'lta' then 50000 when 'uniform' then 30000 end;
      if lim is null then
        raise exception 'Unknown FBP component %', el ->> 'code';
      end if;
      if jsonb_typeof(el -> 'declared') <> 'number' or (el ->> 'declared')::numeric < 0 or (el ->> 'declared')::numeric > lim then
        raise exception 'FBP component % must be between 0 and %', el ->> 'code', lim;
      end if;
      declared := declared + (el ->> 'declared')::numeric;
    end loop;
    select s.fbp_total into fbp_total from public.salary_structures s
     where s.employee_id = new.employee_id and s.is_current
     order by s.effective_from desc limit 1;
    if declared > coalesce(fbp_total, 0) then
      raise exception 'Total FBP declared exceeds your entitlement of %', coalesce(fbp_total, 0);
    end if;
  else
    if jsonb_typeof(new.items) <> 'array' then
      raise exception 'Invalid investment items';
    end if;
    for el in select * from jsonb_array_elements(new.items) loop
      if coalesce((el ->> 'declared')::numeric, 0) not between 0 and 100000000
         or coalesce((el ->> 'proof_amount')::numeric, 0) not between 0 and 100000000 then
        raise exception 'Investment amounts must be between 0 and 10 crore';
      end if;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists vpf_integrity_guard on public.vpf_declarations;
create trigger vpf_integrity_guard before insert or update on public.vpf_declarations
  for each row execute function public.guard_declaration_integrity('vpf');
drop trigger if exists fbp_integrity_guard on public.fbp_declarations;
create trigger fbp_integrity_guard before insert or update on public.fbp_declarations
  for each row execute function public.guard_declaration_integrity('fbp');
drop trigger if exists investment_integrity_guard on public.investment_declarations;
create trigger investment_integrity_guard before insert or update on public.investment_declarations
  for each row execute function public.guard_declaration_integrity('investment');

-- ---------------------------------------------------------------------------
-- Remote attendance: selfies must be the user's own uploads
-- ---------------------------------------------------------------------------
create or replace function public.guard_remote_session()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and not public.is_hr() then
      if new.check_in_photo not like auth.uid()::text || '/%' then
        raise exception 'Invalid check-in photo';
      end if;
      new.check_in_at := now();
      new.work_date := public.org_today();
      new.check_out_at := null;
      new.check_out_photo := null;
    end if;
    return new;
  end if;

  if auth.uid() is null or public.is_hr() then
    return new;
  end if;
  if old.check_out_at is not null then
    raise exception 'This session is already checked out';
  end if;
  if new.employee_id is distinct from old.employee_id
     or new.work_date is distinct from old.work_date
     or new.check_in_at is distinct from old.check_in_at
     or new.check_in_photo is distinct from old.check_in_photo
     or new.check_in_lat is distinct from old.check_in_lat
     or new.check_in_lng is distinct from old.check_in_lng then
    raise exception 'Check-in details cannot be changed';
  end if;
  if new.check_out_photo is null then
    raise exception 'A check-out photo is required';
  end if;
  if new.check_out_photo not like auth.uid()::text || '/%' then
    raise exception 'Invalid check-out photo';
  end if;
  new.check_out_at := now();
  return new;
end $$;
