-- Employees can correct and resubmit a declaration HR rejected (it used to be stuck until HR reopened it),
-- which also lets them change their tax regime after a rejection. Approved declarations stay locked.
-- Same function as 20261108200200 with the rejected case opened up.

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
  elsif old.status = 'approved' then
    if content_changed or new.status is distinct from old.status then
      raise exception 'Your declaration is approved; contact HR to reopen it';
    end if;
    return new;
  elsif old.status not in ('draft','rejected') then
    if content_changed or new.status is distinct from old.status then
      raise exception 'Your declaration is %; contact HR to reopen it', old.status;
    end if;
    return new;
  end if;
  -- A rejected declaration goes back to the employee: they correct it and save a draft or resubmit.
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

-- The generic workflow guard also refused any edit once a declaration left draft/submitted.
-- Treat "rejected" as back with the employee. guard_declaration_integrity still stops an employee
-- from setting rejected (or approved) themselves.
drop trigger if exists fbp_guard on public.fbp_declarations;
create trigger fbp_guard before insert or update on public.fbp_declarations
  for each row execute function public.guard_workflow('draft,submitted,rejected');
drop trigger if exists investment_guard on public.investment_declarations;
create trigger investment_guard before insert or update on public.investment_declarations
  for each row execute function public.guard_workflow('draft,submitted,rejected');
