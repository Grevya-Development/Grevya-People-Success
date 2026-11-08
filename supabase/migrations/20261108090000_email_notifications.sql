-- Email notifications for People Success (sent through Resend by the app).
-- Every row in public.notifications is queued for email. The database pings the app's
-- dispatch endpoint right after notifications are written (pg_net) and every minute (pg_cron);
-- the app claims a batch, sends it and records the result with retries.
-- Rows mirrored from the Service Desk (absolute http links) are skipped: the desk emails those itself.

alter table public.notifications
  add column if not exists email_status text not null default 'pending'
    check (email_status in ('pending','sending','sent','failed','skipped')),
  add column if not exists email_attempts int not null default 0,
  add column if not exists email_next_at timestamptz not null default now(),
  add column if not exists email_claimed_at timestamptz,
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_id text,
  add column if not exists email_error text;

-- Never email what happened before email was switched on.
update public.notifications set email_status = 'skipped', email_error = 'Created before email was enabled' where email_status = 'pending';
create index if not exists notifications_email_queue on public.notifications (email_next_at) where email_status = 'pending';

-- Employees can only flip read_at on their notifications; keep the email columns server-owned.
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Personal preference (email on by default).
create table if not exists public.email_preferences (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  email_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.email_preferences enable row level security;
drop policy if exists email_prefs_own on public.email_preferences;
create policy email_prefs_own on public.email_preferences for all to authenticated
  using (employee_id = public.auth_employee_id()) with check (employee_id = public.auth_employee_id());
grant select, insert, update, delete on public.email_preferences to authenticated;
grant all on public.email_preferences to service_role;

-- Server-only settings (no grants to signed-in users).
create table if not exists public.app_private_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_private_settings enable row level security;
revoke all on public.app_private_settings from authenticated, anon;
grant all on public.app_private_settings to service_role;
insert into public.app_private_settings (key, value) values
  ('email_dispatch_secret', encode(extensions.gen_random_bytes(24), 'hex')),
  ('email_dispatch_url', 'https://peoplesuccess.vercel.app/api/email/dispatch')
on conflict (key) do nothing;

-- Claim a batch to send (service role only).
create or replace function public.claim_email_batch(p_limit int default 50)
returns table (id uuid, employee_id uuid, email text, full_name text, title text, body text, link text, created_at timestamptz, attempts int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  update public.notifications set email_status = 'pending'
   where email_status = 'sending' and email_claimed_at < now() - interval '10 minutes';

  -- Mirrored from the Service Desk (it emails those itself).
  update public.notifications set email_status = 'skipped', email_error = 'Emailed by the Service Desk'
   where email_status = 'pending' and link ~* '^https?://';

  update public.notifications n
     set email_status = 'skipped',
         email_error = case when exists (select 1 from public.email_preferences p where p.employee_id = n.employee_id and not p.email_enabled)
                            then 'Email turned off by the person' else 'No active employee email' end
   where n.email_status = 'pending'
     and (exists (select 1 from public.email_preferences p where p.employee_id = n.employee_id and not p.email_enabled)
          or not exists (select 1 from public.employees e where e.id = n.employee_id and e.status <> 'exited' and coalesce(e.email, '') <> ''));

  return query
  with picked as (
    select n.id from public.notifications n
    where n.email_status = 'pending' and n.email_next_at <= now()
    order by n.created_at
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    for update skip locked
  )
  update public.notifications n
     set email_status = 'sending', email_attempts = n.email_attempts + 1, email_claimed_at = now()
    from picked, public.employees e
   where n.id = picked.id and e.id = n.employee_id
  returning n.id, n.employee_id, e.email, e.full_name, n.title, n.body, n.link, n.created_at, n.email_attempts;
end $$;
revoke execute on function public.claim_email_batch(int) from public, anon, authenticated;
grant execute on function public.claim_email_batch(int) to service_role;

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net not available (%); emails go out on the minute check', sqlerrm;
end $$;

-- Ask the app to send now. Never blocks or fails the notification insert.
create or replace function public.ping_email_dispatch()
returns void language plpgsql security definer set search_path = public as $$
declare
  url text;
  secret text;
begin
  select nullif(value, '') into url from public.app_private_settings where key = 'email_dispatch_url';
  if url is null then return; end if;
  if not exists (select 1 from public.notifications where email_status = 'pending' and email_next_at <= now()) then return; end if;
  select value into secret from public.app_private_settings where key = 'email_dispatch_secret';
  perform net.http_post(
    url := url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', coalesce(secret, '')),
    timeout_milliseconds := 10000
  );
exception when others then
  null;
end $$;
revoke execute on function public.ping_email_dispatch() from public, anon, authenticated;
grant execute on function public.ping_email_dispatch() to service_role;

create or replace function public.notifications_email_ping()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.ping_email_dispatch();
  return null;
end $$;
drop trigger if exists notifications_email_ping on public.notifications;
create trigger notifications_email_ping after insert on public.notifications
  for each statement execute function public.notifications_email_ping();

do $$
begin
  perform cron.schedule('people-success-email-dispatch', '* * * * *', 'select public.ping_email_dispatch()');
exception when others then
  raise notice 'pg_cron not available (%)', sqlerrm;
end $$;
