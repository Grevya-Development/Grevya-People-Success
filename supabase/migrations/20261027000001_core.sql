-- People Success: core organisation tables, helpers and shared infrastructure

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Organisation
-- ---------------------------------------------------------------------------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table public.designations (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  level int not null default 1,
  created_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  city text,
  country text not null default 'India',
  created_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  employee_code text not null unique,
  first_name text not null,
  last_name text not null default '',
  full_name text generated always as (trim(first_name || ' ' || last_name)) stored,
  email text not null unique,
  phone text,
  avatar_url text,
  gender text check (gender in ('male','female','other')),
  date_of_birth date,
  date_of_joining date not null default current_date,
  department_id uuid references public.departments(id) on delete set null,
  designation_id uuid references public.designations(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  manager_id uuid references public.employees(id) on delete set null,
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time','part_time','contract','intern')),
  status text not null default 'active'
    check (status in ('active','notice_period','exited')),
  role text not null default 'employee'
    check (role in ('employee','manager','hr_admin')),
  blood_group text,
  marital_status text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.employees (manager_id);
create index on public.employees (department_id);

-- Sensitive personal data, visible to the employee and HR only
create table public.employee_private (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  personal_email text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  pan_number text,
  aadhaar_last4 text,
  bank_name text,
  bank_account text,
  ifsc text,
  uan text,
  updated_at timestamptz not null default now()
);

create table public.employee_education (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  degree text not null,
  institution text not null,
  start_date date,
  end_date date,
  grade text,
  created_at timestamptz not null default now()
);

create table public.employee_experience (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  company text not null,
  designation text not null,
  start_date date,
  end_date date,
  description text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Shared: favourites, notifications, announcements, settings
-- ---------------------------------------------------------------------------
create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  module_key text not null,
  created_at timestamptz not null default now(),
  unique (employee_id, module_key)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (employee_id, created_at desc);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  pinned boolean not null default false,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.org_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so they can be used inside RLS policies)
-- ---------------------------------------------------------------------------
create or replace function public.auth_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.employees where user_id = auth.uid() limit 1
$$;

create or replace function public.auth_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.employees where user_id = auth.uid() limit 1
$$;

create or replace function public.is_hr()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'hr_admin' from public.employees where user_id = auth.uid() limit 1), false)
$$;

-- True when the signed-in user is the direct or indirect manager of `emp`
create or replace function public.is_manager_of(emp uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with recursive chain as (
    select e.id, e.manager_id, 1 as depth from public.employees e where e.id = emp
    union all
    select e.id, e.manager_id, c.depth + 1
    from public.employees e join chain c on e.id = c.manager_id
    where c.depth < 15
  )
  select exists (
    select 1 from chain
    where manager_id = public.auth_employee_id() and public.auth_employee_id() is not null
  )
$$;

-- Approver privilege: HR or someone up the management chain (never yourself)
create or replace function public.can_approve_for(emp uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_hr() or public.is_manager_of(emp)
$$;

create or replace function public.notify(emp uuid, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if emp is null then return; end if;
  insert into public.notifications (employee_id, title, body, link) values (emp, p_title, p_body, p_link);
end $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger employees_updated_at before update on public.employees
  for each row execute function public.set_updated_at();
create trigger employee_private_updated_at before update on public.employee_private
  for each row execute function public.set_updated_at();

-- Employees may edit their own profile, but only HR can change org fields
create or replace function public.guard_employee_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_hr() or auth.uid() is null then
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

create trigger employees_guard before update on public.employees
  for each row execute function public.guard_employee_update();

-- Link a new auth user to an existing employee record with the same email
create or replace function public.link_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.employees set user_id = new.id
  where lower(email) = lower(new.email) and user_id is null;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.link_auth_user();

-- ---------------------------------------------------------------------------
-- RLS for core tables
-- ---------------------------------------------------------------------------
alter table public.departments enable row level security;
alter table public.designations enable row level security;
alter table public.locations enable row level security;
alter table public.employees enable row level security;
alter table public.employee_private enable row level security;
alter table public.employee_education enable row level security;
alter table public.employee_experience enable row level security;
alter table public.favorites enable row level security;
alter table public.notifications enable row level security;
alter table public.announcements enable row level security;
alter table public.org_settings enable row level security;

-- Reference data: readable by all signed-in users, managed by HR
create policy "read departments" on public.departments for select to authenticated using (true);
create policy "hr manage departments" on public.departments for all to authenticated using (public.is_hr()) with check (public.is_hr());
create policy "read designations" on public.designations for select to authenticated using (true);
create policy "hr manage designations" on public.designations for all to authenticated using (public.is_hr()) with check (public.is_hr());
create policy "read locations" on public.locations for select to authenticated using (true);
create policy "hr manage locations" on public.locations for all to authenticated using (public.is_hr()) with check (public.is_hr());
create policy "read settings" on public.org_settings for select to authenticated using (true);
create policy "hr manage settings" on public.org_settings for all to authenticated using (public.is_hr()) with check (public.is_hr());

-- Employees: directory is visible to everyone in the org
create policy "read employees" on public.employees for select to authenticated using (true);
create policy "update own or hr" on public.employees for update to authenticated
  using (id = public.auth_employee_id() or public.is_hr())
  with check (id = public.auth_employee_id() or public.is_hr());
create policy "hr insert employees" on public.employees for insert to authenticated with check (public.is_hr());
create policy "hr delete employees" on public.employees for delete to authenticated using (public.is_hr());

create policy "own private or hr" on public.employee_private for all to authenticated
  using (employee_id = public.auth_employee_id() or public.is_hr())
  with check (employee_id = public.auth_employee_id() or public.is_hr());

create policy "read education" on public.employee_education for select to authenticated using (true);
create policy "manage own education" on public.employee_education for all to authenticated
  using (employee_id = public.auth_employee_id() or public.is_hr())
  with check (employee_id = public.auth_employee_id() or public.is_hr());
create policy "read experience" on public.employee_experience for select to authenticated using (true);
create policy "manage own experience" on public.employee_experience for all to authenticated
  using (employee_id = public.auth_employee_id() or public.is_hr())
  with check (employee_id = public.auth_employee_id() or public.is_hr());

create policy "own favorites" on public.favorites for all to authenticated
  using (employee_id = public.auth_employee_id())
  with check (employee_id = public.auth_employee_id());

create policy "own notifications" on public.notifications for select to authenticated
  using (employee_id = public.auth_employee_id());
create policy "update own notifications" on public.notifications for update to authenticated
  using (employee_id = public.auth_employee_id()) with check (employee_id = public.auth_employee_id());
create policy "delete own notifications" on public.notifications for delete to authenticated
  using (employee_id = public.auth_employee_id());

create policy "read announcements" on public.announcements for select to authenticated using (true);
create policy "hr manage announcements" on public.announcements for all to authenticated
  using (public.is_hr()) with check (public.is_hr());
