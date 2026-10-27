-- Hardening: internal helper functions must not be callable from the browser.
-- Triggers (security definer, owned by postgres) keep using them.
revoke execute on function public.notify(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.link_auth_user() from public, anon, authenticated;

-- Read-only helpers: signed-in users only, never anonymous.
revoke execute on function public.auth_employee_id() from anon;
revoke execute on function public.auth_role() from anon;
revoke execute on function public.is_hr() from anon;
revoke execute on function public.is_manager_of(uuid) from anon;
revoke execute on function public.can_approve_for(uuid) from anon;
