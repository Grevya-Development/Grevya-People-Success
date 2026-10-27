-- Remote attendance: selfie + location check-in / check-out sessions.
-- Times always come from the database clock, never the browser.

create table public.remote_work_sessions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null default public.org_today(),
  check_in_at timestamptz not null default now(),
  check_in_photo text not null,
  check_in_lat double precision,
  check_in_lng double precision,
  check_in_accuracy double precision,
  check_in_ip text,
  check_in_device text,
  check_out_at timestamptz,
  check_out_photo text,
  check_out_lat double precision,
  check_out_lng double precision,
  check_out_accuracy double precision,
  check_out_ip text,
  check_out_device text,
  worked_minutes int generated always as (
    case when check_out_at is null then null
         else greatest(0, floor(extract(epoch from (check_out_at - check_in_at)) / 60))::int end
  ) stored,
  notes text,
  created_at timestamptz not null default now(),
  check (check_out_at is null or check_out_at >= check_in_at)
);
create index on public.remote_work_sessions (employee_id, work_date desc);
create unique index one_open_remote_session on public.remote_work_sessions (employee_id) where check_out_at is null;

-- Server-side clock + immutability of the check-in part
create or replace function public.guard_remote_session()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and not public.is_hr() then
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
  new.check_out_at := now();
  return new;
end $$;

create trigger remote_session_guard before insert or update on public.remote_work_sessions
  for each row execute function public.guard_remote_session();

-- Keep the main attendance register in sync (day marked WFH / remote)
create or replace function public.sync_remote_attendance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.attendance_records (employee_id, date, check_in, status, work_mode, source, notes)
    values (new.employee_id, new.work_date, new.check_in_at, 'wfh', 'remote', 'web', 'Remote check-in with photo')
    on conflict (employee_id, date) do nothing;
  elsif new.check_out_at is not null and old.check_out_at is null then
    update public.attendance_records
       set check_out = greatest(coalesce(check_out, new.check_out_at), new.check_out_at)
     where employee_id = new.employee_id and date = new.work_date and work_mode = 'remote';
  end if;
  return new;
end $$;

create trigger remote_session_sync after insert or update on public.remote_work_sessions
  for each row execute function public.sync_remote_attendance();

alter table public.remote_work_sessions enable row level security;

create policy "select remote sessions" on public.remote_work_sessions for select to authenticated
  using (employee_id = public.auth_employee_id() or public.can_approve_for(employee_id));
create policy "insert own remote session" on public.remote_work_sessions for insert to authenticated
  with check (employee_id = public.auth_employee_id());
create policy "update own remote session" on public.remote_work_sessions for update to authenticated
  using (employee_id = public.auth_employee_id() or public.is_hr())
  with check (employee_id = public.auth_employee_id() or public.is_hr());
create policy "hr delete remote session" on public.remote_work_sessions for delete to authenticated
  using (public.is_hr());

-- Private bucket for attendance selfies: <auth uid>/<date>/<file>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attendance-photos', 'attendance-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "upload own attendance photo" on storage.objects for insert to authenticated
  with check (bucket_id = 'attendance-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read own attendance photo" on storage.objects for select to authenticated
  using (bucket_id = 'attendance-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_hr()));
