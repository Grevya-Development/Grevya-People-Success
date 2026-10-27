-- Learning: learning paths, knowledge wiki, external training, training calendar.
--
--   learning_paths / learning_path_courses / learning_path_enrollments
--       HR curates ordered sets of courses; employees "start" a path (which
--       enrolls them in its courses), HR can assign a path in bulk.
--   wiki_articles / wiki_article_likes
--       Employee-written knowledge articles: draft -> submitted -> published | rejected.
--       HR moderates (and may publish its own articles directly).
--   external_trainings
--       Employee requests for outside courses / certifications / conferences:
--       pending -> approved | rejected (manager chain or HR) -> completed.
--   training_sessions / training_registrations
--       Instructor-led / webinar sessions with a seat limit.
--
-- Service-role connections (auth.uid() is null: seeds, admin scripts) bypass the guards.

-- ---------------------------------------------------------------------------
-- Learning paths
-- ---------------------------------------------------------------------------
create table public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  description text,
  category text not null default 'General' check (char_length(category) between 1 and 60),
  published boolean not null default false,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger learning_paths_updated_at before update on public.learning_paths
  for each row execute function public.set_updated_at();

create table public.learning_path_courses (
  path_id uuid not null references public.learning_paths(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  position int not null default 0,
  primary key (path_id, course_id)
);
create index learning_path_courses_course_idx on public.learning_path_courses(course_id);

create table public.learning_path_enrollments (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null references public.learning_paths(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  assigned_by uuid references public.employees(id) on delete set null,
  due_date date,
  started_at timestamptz not null default now(),
  unique (path_id, employee_id)
);
create index learning_path_enrollments_emp_idx on public.learning_path_enrollments(employee_id);

alter table public.learning_paths enable row level security;
alter table public.learning_path_courses enable row level security;
alter table public.learning_path_enrollments enable row level security;

create policy "read published paths" on public.learning_paths for select to authenticated
  using (published or public.is_hr());
create policy "hr manage paths" on public.learning_paths for all to authenticated
  using (public.is_hr()) with check (public.is_hr());

create policy "read path courses" on public.learning_path_courses for select to authenticated
  using (public.is_hr() or exists (select 1 from public.learning_paths p where p.id = path_id and p.published));
create policy "hr manage path courses" on public.learning_path_courses for all to authenticated
  using (public.is_hr()) with check (public.is_hr());

create policy "select path enrollments" on public.learning_path_enrollments for select to authenticated
  using (employee_id = public.auth_employee_id() or public.can_approve_for(employee_id));
create policy "start own path" on public.learning_path_enrollments for insert to authenticated
  with check (
    public.is_hr()
    or (employee_id = public.auth_employee_id() and assigned_by is null and due_date is null
        and exists (select 1 from public.learning_paths p where p.id = path_id and p.published))
  );
create policy "hr update path enrollments" on public.learning_path_enrollments for update to authenticated
  using (public.is_hr()) with check (public.is_hr());
create policy "leave own path" on public.learning_path_enrollments for delete to authenticated
  using (public.is_hr() or (employee_id = public.auth_employee_id() and assigned_by is null));

-- Course-assignment notifications can be muted for one transaction (bulk path assignment
-- sends one "path assigned" notification instead of one per course).
create or replace function public.notify_enrollment()
returns trigger language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if coalesce(current_setting('app.mute_enrollment_notify', true), '') = 'on' then
    return new;
  end if;
  if new.assigned_by is not null and new.assigned_by <> new.employee_id then
    select title into c from public.courses where id = new.course_id;
    perform public.notify(new.employee_id, 'Course assigned: ' || c, null, '/learning/my-courses');
  end if;
  return new;
end $$;

create or replace function public.notify_path_enrollment()
returns trigger language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if new.assigned_by is not null and new.assigned_by <> new.employee_id then
    select title into t from public.learning_paths where id = new.path_id;
    perform public.notify(new.employee_id, 'Learning path assigned: ' || t,
      case when new.due_date is not null then 'Due by ' || to_char(new.due_date, 'DD Mon YYYY') end,
      '/learning/paths/' || new.path_id);
  end if;
  return new;
end $$;
create trigger path_enrollment_notify after insert on public.learning_path_enrollments
  for each row execute function public.notify_path_enrollment();

-- HR: assign a path to a department (or everyone when p_department is null).
-- Creates path enrollments + course enrollments (published courses only), skipping existing ones.
create or replace function public.assign_learning_path(p_path uuid, p_department uuid, p_due date)
returns table (assigned int, skipped int)
language plpgsql security invoker set search_path = public as $$
declare
  me uuid := public.auth_employee_id();
  n_new int;
  n_all int;
begin
  if not public.is_hr() then
    raise exception 'Only HR can assign learning paths' using errcode = '42501';
  end if;
  if not exists (select 1 from public.learning_paths where id = p_path and published) then
    raise exception 'Publish the learning path before assigning it';
  end if;
  if p_due is not null and p_due < public.org_today() then
    raise exception 'Due date can''t be in the past';
  end if;

  perform set_config('app.mute_enrollment_notify', 'on', true);

  select count(*) into n_all from public.employees e
    where e.status <> 'exited' and (p_department is null or e.department_id = p_department);

  insert into public.learning_path_enrollments (path_id, employee_id, assigned_by, due_date)
    select p_path, e.id, me, p_due from public.employees e
    where e.status <> 'exited' and (p_department is null or e.department_id = p_department)
    on conflict (path_id, employee_id) do nothing;
  get diagnostics n_new = row_count;

  insert into public.course_enrollments (course_id, employee_id, assigned_by, due_date)
    select pc.course_id, e.id, me, p_due
    from public.employees e
    cross join public.learning_path_courses pc
    join public.courses c on c.id = pc.course_id and c.published
    where pc.path_id = p_path
      and e.status <> 'exited' and (p_department is null or e.department_id = p_department)
    on conflict (course_id, employee_id) do nothing;

  perform set_config('app.mute_enrollment_notify', 'off', true);
  return query select n_new, n_all - n_new;
end $$;
revoke execute on function public.assign_learning_path(uuid, uuid, date) from public, anon;
grant execute on function public.assign_learning_path(uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Knowledge wiki
-- ---------------------------------------------------------------------------
create table public.wiki_articles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.employees(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  category text not null default 'General' check (char_length(category) between 1 and 60),
  tags text[] not null default '{}',
  content text not null default '' check (char_length(content) <= 50000),
  status text not null default 'draft' check (status in ('draft','submitted','published','rejected')),
  review_remarks text,
  reviewed_by uuid references public.employees(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz,
  published_at timestamptz,
  view_count int not null default 0 check (view_count >= 0),
  like_count int not null default 0 check (like_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wiki_articles_status_idx on public.wiki_articles(status, published_at desc);
create index wiki_articles_author_idx on public.wiki_articles(author_id);
create trigger wiki_articles_updated_at before update on public.wiki_articles
  for each row execute function public.set_updated_at();

create table public.wiki_article_likes (
  article_id uuid not null references public.wiki_articles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (article_id, employee_id)
);

alter table public.wiki_articles enable row level security;
alter table public.wiki_article_likes enable row level security;

create policy "read wiki articles" on public.wiki_articles for select to authenticated
  using (status = 'published' or author_id = public.auth_employee_id() or public.is_hr());
create policy "write own wiki articles" on public.wiki_articles for insert to authenticated
  with check (author_id = public.auth_employee_id());
create policy "update wiki articles" on public.wiki_articles for update to authenticated
  using (author_id = public.auth_employee_id() or public.is_hr())
  with check (author_id = public.auth_employee_id() or public.is_hr());
create policy "delete wiki articles" on public.wiki_articles for delete to authenticated
  using (author_id = public.auth_employee_id() or public.is_hr());

create policy "read own likes" on public.wiki_article_likes for select to authenticated
  using (employee_id = public.auth_employee_id() or public.is_hr());
create policy "like published articles" on public.wiki_article_likes for insert to authenticated
  with check (employee_id = public.auth_employee_id()
    and exists (select 1 from public.wiki_articles a where a.id = article_id and a.status = 'published'));
create policy "unlike own" on public.wiki_article_likes for delete to authenticated
  using (employee_id = public.auth_employee_id());

-- Authors may only draft / submit; review fields and counters are system / HR owned.
create or replace function public.guard_wiki_article()
returns trigger language plpgsql security definer set search_path = public as $$
declare me uuid := public.auth_employee_id();
begin
  if coalesce(current_setting('app.wiki_counters', true), '') = 'on' then
    return new;  -- counter maintenance from wiki_record_view / like triggers
  end if;

  -- workflow timestamps (everyone, including HR)
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    new.submitted_at := now();
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := now();
  end if;
  if new.status in ('published','rejected') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.reviewed_by := me;
    new.reviewed_at := now();
  end if;

  if auth.uid() is null or public.is_hr() then
    if new.status = 'rejected' and coalesce(btrim(new.review_remarks), '') = '' then
      raise exception 'Remarks are required to reject an article';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.author_id is distinct from me then
      raise exception 'You can only write articles as yourself' using errcode = '42501';
    end if;
    if new.status not in ('draft','submitted') then
      raise exception 'Articles must be reviewed by HR before they are published' using errcode = '42501';
    end if;
    new.view_count := 0;
    new.like_count := 0;
    new.review_remarks := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.published_at := null;
    return new;
  end if;

  if new.author_id is distinct from old.author_id
     or new.view_count is distinct from old.view_count
     or new.like_count is distinct from old.like_count
     or new.review_remarks is distinct from old.review_remarks
     or new.created_at is distinct from old.created_at then
    raise exception 'You can''t change that field' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and new.status not in ('draft','submitted') then
    raise exception 'Articles must be reviewed by HR before they are published' using errcode = '42501';
  end if;
  if old.status = 'published' and new.status = 'published'
     and (new.title is distinct from old.title or new.content is distinct from old.content
          or new.category is distinct from old.category or new.tags is distinct from old.tags) then
    raise exception 'Edits to a published article need to be submitted for review' using errcode = '42501';
  end if;
  if new.status <> 'published' then
    new.published_at := null;
  end if;
  return new;
end $$;
create trigger wiki_articles_guard before insert or update on public.wiki_articles
  for each row execute function public.guard_wiki_article();

create or replace function public.notify_wiki_article()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor uuid := public.auth_employee_id();
  author_name text;
  hr record;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if new.status in ('published','rejected') and new.author_id is distinct from actor then
    perform public.notify(new.author_id,
      case when new.status = 'published' then 'Your article was published: ' else 'Your article was not approved: ' end || new.title,
      case when new.status = 'rejected' then new.review_remarks end,
      case when new.status = 'published' then '/learning/wiki/' || new.id else '/learning/wiki/mine' end);
  elsif new.status = 'submitted' then
    select full_name into author_name from public.employees where id = new.author_id;
    for hr in select id from public.employees where role = 'hr_admin' and status <> 'exited' and id is distinct from actor loop
      perform public.notify(hr.id, 'Wiki article awaiting review', author_name || ' submitted "' || new.title || '".', '/learning/admin?tab=wiki');
    end loop;
  end if;
  return new;
end $$;
create trigger wiki_articles_notify after insert or update on public.wiki_articles
  for each row execute function public.notify_wiki_article();

create or replace function public.wiki_like_counter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.wiki_counters', 'on', true);
  if tg_op = 'INSERT' then
    update public.wiki_articles set like_count = like_count + 1 where id = new.article_id;
  else
    update public.wiki_articles set like_count = greatest(like_count - 1, 0) where id = old.article_id;
  end if;
  perform set_config('app.wiki_counters', 'off', true);
  return null;
end $$;
create trigger wiki_likes_count after insert or delete on public.wiki_article_likes
  for each row execute function public.wiki_like_counter();

-- One view per call; the author's own views are not counted.
create or replace function public.wiki_record_view(p_article uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.auth_employee_id();
  n int;
begin
  if me is null then return null; end if;
  perform set_config('app.wiki_counters', 'on', true);
  update public.wiki_articles set view_count = view_count + 1
    where id = p_article and status = 'published' and author_id <> me
    returning view_count into n;
  perform set_config('app.wiki_counters', 'off', true);
  return n;
end $$;
revoke execute on function public.wiki_record_view(uuid) from public, anon;
grant execute on function public.wiki_record_view(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- External training
-- ---------------------------------------------------------------------------
create table public.external_trainings (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  provider text not null check (char_length(provider) between 1 and 120),
  training_type text not null check (training_type in ('course','certification','conference','workshop')),
  mode text not null default 'online' check (mode in ('online','in_person','hybrid')),
  start_date date not null,
  end_date date not null,
  cost numeric(12,2) not null default 0 check (cost >= 0 and cost <= 10000000),
  justification text not null check (char_length(justification) between 1 and 4000),
  link text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','completed','cancelled')),
  approver_id uuid references public.employees(id) on delete set null,
  approver_remarks text,
  decided_at timestamptz,
  certificate_path text,
  completion_notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index external_trainings_emp_idx on public.external_trainings(employee_id);
create index external_trainings_status_idx on public.external_trainings(status);
create trigger external_trainings_updated_at before update on public.external_trainings
  for each row execute function public.set_updated_at();

alter table public.external_trainings enable row level security;
create policy "select external trainings" on public.external_trainings for select to authenticated
  using (employee_id = public.auth_employee_id() or public.can_approve_for(employee_id));
create policy "insert own external training" on public.external_trainings for insert to authenticated
  with check (employee_id = public.auth_employee_id());
create policy "update external trainings" on public.external_trainings for update to authenticated
  using (employee_id = public.auth_employee_id() or public.can_approve_for(employee_id))
  with check (employee_id = public.auth_employee_id() or public.can_approve_for(employee_id));
create policy "hr delete external trainings" on public.external_trainings for delete to authenticated
  using (public.is_hr());

create or replace function public.guard_external_training()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.auth_employee_id();
  approver boolean;
begin
  if auth.uid() is null then
    return new;
  end if;
  -- can_approve_for() is false for your own row unless you are HR.
  approver := public.can_approve_for(new.employee_id);

  if tg_op = 'INSERT' then
    if new.status <> 'pending' and not approver then
      raise exception 'New requests start as pending' using errcode = '42501';
    end if;
    if not approver then
      new.approver_id := null;
      new.approver_remarks := null;
      new.decided_at := null;
      new.certificate_path := null;
      new.completed_at := null;
    end if;
    return new;
  end if;

  if new.employee_id is distinct from old.employee_id then
    raise exception 'You can''t move a request to someone else' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if new.status in ('approved','rejected') then
      if not approver then
        raise exception 'Only your manager or HR can approve or reject this request' using errcode = '42501';
      end if;
      if old.status <> 'pending' then
        raise exception 'This request has already been processed';
      end if;
      if new.status = 'rejected' and coalesce(btrim(new.approver_remarks), '') = '' then
        raise exception 'Remarks are required to reject a request';
      end if;
      new.approver_id := me;
      new.decided_at := now();
    elsif new.status = 'completed' then
      if old.status <> 'approved' then
        raise exception 'Only approved trainings can be marked completed';
      end if;
      if new.employee_id <> me and not public.is_hr() then
        raise exception 'Only the employee can mark this training completed' using errcode = '42501';
      end if;
      new.completed_at := now();
    elsif new.status = 'cancelled' then
      if old.status not in ('pending','approved') then
        raise exception 'This request can no longer be cancelled';
      end if;
    elsif new.status = 'pending' then
      raise exception 'A processed request can''t be reopened';
    end if;
  end if;

  if not approver then
    -- the employee: decision fields are read-only; details only while pending
    if new.approver_id is distinct from old.approver_id
       or new.approver_remarks is distinct from old.approver_remarks
       or new.decided_at is distinct from old.decided_at then
      raise exception 'Only your manager or HR can record a decision' using errcode = '42501';
    end if;
    if old.status <> 'pending' and (
         new.title is distinct from old.title or new.provider is distinct from old.provider
         or new.training_type is distinct from old.training_type or new.mode is distinct from old.mode
         or new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date
         or new.cost is distinct from old.cost or new.justification is distinct from old.justification
         or new.link is distinct from old.link) then
      raise exception 'This request has already been processed';
    end if;
    if new.certificate_path is distinct from old.certificate_path then
      if old.status not in ('approved','completed') or new.status not in ('approved','completed') then
        raise exception 'Certificates can be added once the training is approved';
      end if;
      if new.certificate_path is not null and new.certificate_path not like auth.uid()::text || '/%' then
        raise exception 'Invalid certificate file' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger external_trainings_guard before insert or update on public.external_trainings
  for each row execute function public.guard_external_training();

create or replace function public.notify_external_training()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor uuid := public.auth_employee_id();
  emp_name text;
  mgr uuid;
begin
  select full_name, manager_id into emp_name, mgr from public.employees where id = new.employee_id;
  if tg_op = 'INSERT' and new.status = 'pending' then
    if mgr is not null and mgr is distinct from actor then
      perform public.notify(mgr, 'External training awaiting your approval',
        emp_name || ' requested "' || new.title || '" (' || new.provider || ').', '/learning/external/approvals');
    end if;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status
        and new.status in ('approved','rejected') and new.employee_id is distinct from actor then
    perform public.notify(new.employee_id,
      'Your external training request was ' || new.status || ': ' || new.title,
      new.approver_remarks, '/learning/external');
  end if;
  return new;
end $$;
create trigger external_trainings_notify after insert or update on public.external_trainings
  for each row execute function public.notify_external_training();

-- ---------------------------------------------------------------------------
-- Training calendar
-- ---------------------------------------------------------------------------
create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  description text,
  trainer text not null check (char_length(trainer) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  mode text not null default 'virtual' check (mode in ('in_person','virtual')),
  location text,
  meeting_link text,
  capacity int not null check (capacity between 1 and 10000),
  course_id uuid references public.courses(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index training_sessions_starts_idx on public.training_sessions(starts_at);
create trigger training_sessions_updated_at before update on public.training_sessions
  for each row execute function public.set_updated_at();

create table public.training_registrations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  attended boolean,
  registered_at timestamptz not null default now(),
  unique (session_id, employee_id)
);
create index training_registrations_emp_idx on public.training_registrations(employee_id);

alter table public.training_sessions enable row level security;
alter table public.training_registrations enable row level security;

create policy "read training sessions" on public.training_sessions for select to authenticated using (true);
create policy "hr manage training sessions" on public.training_sessions for all to authenticated
  using (public.is_hr()) with check (public.is_hr());

create policy "select registrations" on public.training_registrations for select to authenticated
  using (employee_id = public.auth_employee_id() or public.can_approve_for(employee_id));
create policy "register self" on public.training_registrations for insert to authenticated
  with check (employee_id = public.auth_employee_id() or public.is_hr());
create policy "hr mark attendance" on public.training_registrations for update to authenticated
  using (public.is_hr()) with check (public.is_hr());
create policy "cancel own registration" on public.training_registrations for delete to authenticated
  using (public.is_hr() or (employee_id = public.auth_employee_id()
    and exists (select 1 from public.training_sessions s where s.id = session_id and s.starts_at > now())));

-- Seat limit: lock the session row so concurrent registrations queue up behind each other.
create or replace function public.guard_training_registration()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s record;
  taken int;
begin
  if tg_op = 'UPDATE' then
    if new.session_id is distinct from old.session_id or new.employee_id is distinct from old.employee_id then
      raise exception 'Registrations can''t be moved' using errcode = '42501';
    end if;
    return new;
  end if;

  select id, capacity, status, starts_at into s
    from public.training_sessions where id = new.session_id for update;
  if not found then
    raise exception 'Session not found';
  end if;
  if s.status <> 'scheduled' then
    raise exception 'This session has been cancelled';
  end if;
  if auth.uid() is not null and not public.is_hr() then
    new.attended := null;
    if s.starts_at <= now() then
      raise exception 'Registration is closed for this session';
    end if;
  end if;
  select count(*) into taken from public.training_registrations where session_id = new.session_id;
  if taken >= s.capacity then
    raise exception 'This session is full';
  end if;
  return new;
end $$;
create trigger training_registrations_guard before insert or update on public.training_registrations
  for each row execute function public.guard_training_registration();

-- Seat counts for every session (registrations themselves stay private).
create or replace function public.training_session_seats()
returns table (session_id uuid, registered int)
language sql stable security definer set search_path = public as $$
  select r.session_id, count(*)::int from public.training_registrations r group by r.session_id
$$;
revoke execute on function public.training_session_seats() from public, anon;
grant execute on function public.training_session_seats() to authenticated;

create or replace function public.notify_training_session()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    for r in select employee_id from public.training_registrations where session_id = new.id loop
      perform public.notify(r.employee_id, 'Training session cancelled: ' || new.title,
        to_char(new.starts_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') || ' IST', '/learning/calendar');
    end loop;
  elsif new.status = 'scheduled' and (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at) then
    for r in select employee_id from public.training_registrations where session_id = new.id loop
      perform public.notify(r.employee_id, 'Training session rescheduled: ' || new.title,
        'Now ' || to_char(new.starts_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') || ' IST', '/learning/calendar/' || new.id);
    end loop;
  end if;
  return new;
end $$;
create trigger training_sessions_notify after update on public.training_sessions
  for each row execute function public.notify_training_session();
