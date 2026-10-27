-- Attendance punches: times always come from the database clock.
--
-- The "punch in today" / "punch out today" RLS policies let an employee insert
-- or update their own row for today, but did not constrain the values, so
-- anyone could call the REST API directly and record e.g. a 09:00 check-in,
-- an arbitrary check-out, or status 'on_duty'. This guard normalises employee
-- writes: check-in / check-out are stamped with now() (check-in is write-once),
-- and the status can only be present / wfh.
--
-- Not affected: HR, server-side jobs (no auth uid) and approved
-- regularizations (written by apply_regularization with source
-- 'regularization', which employees cannot set themselves because of RLS).

create or replace function public.guard_attendance_punch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_hr() or new.source = 'regularization' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('present', 'wfh') then
      raise exception 'Invalid attendance status %', new.status;
    end if;
    if new.check_in is not null then
      new.check_in := now();
    end if;
    new.check_out := null;
    return new;
  end if;

  if new.employee_id is distinct from old.employee_id or new.date is distinct from old.date then
    raise exception 'Attendance records cannot be moved';
  end if;
  if old.check_in is not null and new.check_in is distinct from old.check_in then
    raise exception 'Check-in time cannot be changed';
  end if;
  if old.check_in is null and new.check_in is not null then
    new.check_in := now();
  end if;
  if new.check_out is distinct from old.check_out then
    if new.check_out is null then
      raise exception 'Check-out time cannot be cleared';
    end if;
    if new.check_in is null then
      raise exception 'Check in before checking out';
    end if;
    -- (a later remote session may move the check-out forward, but only to "now")
    new.check_out := now();
  end if;
  if new.status is distinct from old.status and new.status not in ('present', 'wfh') then
    raise exception 'Invalid attendance status %', new.status;
  end if;
  return new;
end $$;

drop trigger if exists attendance_punch_guard on public.attendance_records;
create trigger attendance_punch_guard before insert or update on public.attendance_records
  for each row execute function public.guard_attendance_punch();
