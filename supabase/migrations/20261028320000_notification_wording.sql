-- Friendlier workflow notification text ("Your VPF declaration was returned to
-- you for changes" instead of "Your vpf declaration was draft").
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
  first_word text := split_part(label, ' ', 1);
  -- keep acronyms (VPF, FBP) capitalised, lower-case the rest of the first word
  noun text := case when first_word = upper(first_word) then label else lower(left(label, 1)) || substr(label, 2) end;
  outcome text;
begin
  select full_name, manager_id into emp_name, mgr from public.employees where id = emp;
  if (tg_op = 'INSERT' and new.status = any(waiting))
     or (tg_op = 'UPDATE' and new.status is distinct from old.status and new.status = any(waiting)) then
    if mgr is not null and mgr is distinct from actor then
      perform public.notify(mgr, label || ' awaiting your approval', emp_name || ' submitted a ' || noun || '.', approver_link);
    end if;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and emp is distinct from actor then
    outcome := case new.status
      when 'approved' then 'approved'
      when 'rejected' then 'rejected'
      when 'cancelled' then 'cancelled'
      when 'withdrawn' then 'withdrawn'
      when 'paid' then 'paid'
      when 'completed' then 'completed'
      when 'pending_hr' then 'approved by your manager and sent to HR'
      when 'pending_manager' then 'sent to your manager'
      when 'pending_manager_review' then 'sent to your manager'
      when 'pending_approval' then 'sent for approval'
      when 'submitted' then 'submitted'
      when 'draft' then 'returned to you for changes'
      when 'pending' then 'reopened'
      when 'pending_self' then 'reopened for your self review'
      else replace(new.status, '_', ' ')
    end;
    perform public.notify(emp, 'Your ' || noun || ' was ' || outcome, null, emp_link);
  end if;
  return new;
end $$;
