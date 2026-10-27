-- Super Admin role: owns user accounts and admin rights.
--   super_admin  everything HR can do + grant/remove admin roles, manage logins
--   hr_admin     all HR data; cannot grant or remove admin roles

alter table public.employees drop constraint if exists employees_role_check;
alter table public.employees add constraint employees_role_check
  check (role in ('employee','manager','hr_admin','super_admin'));

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' from public.employees where user_id = auth.uid() limit 1), false)
$$;
revoke execute on function public.is_super_admin() from anon;

-- Super Admins are HR too (RLS everywhere keys off is_hr)
create or replace function public.is_hr()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('hr_admin','super_admin') from public.employees where user_id = auth.uid() limit 1), false)
$$;

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
     or new.date_of_joining is distinct from old.date_of_joining then
    raise exception 'Only HR can change organisation details';
  end if;
  return new;
end $$;

create or replace function public.guard_employee_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_super_admin() and new.role in ('hr_admin','super_admin') then
    raise exception 'Only a Super Admin can grant or remove admin roles';
  end if;
  return new;
end $$;

drop trigger if exists employees_guard_insert on public.employees;
create trigger employees_guard_insert before insert on public.employees
  for each row execute function public.guard_employee_insert();

-- Only Super Admins may delete admin employee records
drop policy if exists "hr delete employees" on public.employees;
create policy "hr delete employees" on public.employees for delete to authenticated
  using (public.is_super_admin() or (public.is_hr() and role not in ('hr_admin','super_admin')));

-- Notify all Super Admins as well as HR on HR-wide events
create or replace function public.apply_resignation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  hr record;
  emp_name text;
begin
  select full_name into emp_name from public.employees where id = new.employee_id;
  if new.status = 'pending_hr' and old.status is distinct from 'pending_hr' then
    for hr in select id from public.employees where role in ('hr_admin','super_admin') and status <> 'exited' loop
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
