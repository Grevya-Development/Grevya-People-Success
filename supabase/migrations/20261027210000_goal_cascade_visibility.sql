-- Let employees read the approved / completed goals of everyone above them in
-- the reporting line, so goals can be aligned to a manager's goal and the
-- objective tree shows the full cascade.
create or replace function public.is_above_me(emp uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with recursive up as (
    select e.manager_id, 1 as depth from public.employees e where e.id = public.auth_employee_id()
    union all
    select e.manager_id, u.depth + 1 from public.employees e join up u on e.id = u.manager_id
    where u.depth < 15
  )
  select exists (select 1 from up where manager_id = emp)
$$;
revoke execute on function public.is_above_me(uuid) from anon;

create policy "read goals above me" on public.goals for select to authenticated
  using (employee_id is not null and status in ('approved','completed') and public.is_above_me(employee_id));
