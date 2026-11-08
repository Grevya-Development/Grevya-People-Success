-- Follow-ups from the QA pass.
--  1. Accounts flagged "choose your own password" before the flag moved to app_metadata only had the
--     user-editable user_metadata copy. Copy it to app_metadata so the forced change can't be skipped.
--  2. Usage cap for the AI assistant (/api/assistant): each AI answer can take several model calls,
--     so cap them per person. Over the cap the assistant falls back to its built-in quick answers.

update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"must_change_password": true}'::jsonb
 where raw_user_meta_data ->> 'must_change_password' = 'true'
   and coalesce(raw_app_meta_data ->> 'must_change_password', '') <> 'true';

create table if not exists public.assistant_usage (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists assistant_usage_employee_time on public.assistant_usage (employee_id, created_at desc);
alter table public.assistant_usage enable row level security;
revoke all on public.assistant_usage from anon, authenticated;

-- Records one AI answer for the signed-in employee if they are under both caps (30 an hour, 120 a day). Returns true when allowed.
create or replace function public.assistant_take_slot()
returns boolean language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.auth_employee_id();
  last_hour int;
  last_day int;
begin
  if me is null then return false; end if;
  -- One caller at a time per employee, so parallel requests can't all slip under the cap.
  perform pg_advisory_xact_lock(hashtext('assistant_usage:' || me::text));
  select count(*) filter (where created_at > now() - interval '1 hour'), count(*)
    into last_hour, last_day
    from public.assistant_usage
   where employee_id = me and created_at > now() - interval '1 day';
  if last_hour >= 30 or last_day >= 120 then return false; end if;
  insert into public.assistant_usage (employee_id) values (me);
  delete from public.assistant_usage where employee_id = me and created_at < now() - interval '2 days';
  return true;
end $$;
revoke execute on function public.assistant_take_slot() from public, anon;
grant execute on function public.assistant_take_slot() to authenticated;

-- 3. Disabling a login (Admin → Accounts bans the auth user) used to leave the person signed in until
--    their access token expired (up to an hour), because both apps verify tokens locally.
--    auth_login_disabled() lets the apps check the ban on each request, and revoke_user_sessions()
--    (service role only) ends their sessions so the token can't be refreshed.
create or replace function public.auth_login_disabled()
returns boolean language sql stable security definer set search_path = auth, public as $$
  select coalesce((select u.banned_until is not null and u.banned_until > now() from auth.users u where u.id = auth.uid()), false)
$$;
revoke execute on function public.auth_login_disabled() from public, anon;
grant execute on function public.auth_login_disabled() to authenticated;

create or replace function public.revoke_user_sessions(p_user uuid)
returns void language sql security definer set search_path = auth, public as $$
  delete from auth.sessions where user_id = p_user
$$;
revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
