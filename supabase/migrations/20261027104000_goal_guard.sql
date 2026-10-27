-- Performance: goal-specific workflow guard.
--
-- The generic guard_workflow('draft,pending_approval,completed') blocked goal
-- owners from touching a goal once it was approved (so they could not record
-- progress or mark it completed) and from revising a rejected goal.
-- This guard keeps approver-only fields locked while allowing the owner to:
--   * create goals as draft / pending_approval
--   * edit draft, pending_approval and rejected goals (status draft / pending_approval)
--   * update progress on approved goals and mark them completed
-- Approvers (HR / management chain) are unrestricted, as before.

create or replace function public.guard_goal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.can_approve_for(new.employee_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft','pending_approval') then
      raise exception 'Status % can only be set by an approver', new.status;
    end if;
    if new.approver_remarks is not null or new.actioned_at is not null or new.progress <> 0 then
      raise exception 'New goals start without approval details or progress';
    end if;
    return new;
  end if;

  if new.employee_id is distinct from old.employee_id
     or new.created_by is distinct from old.created_by
     or new.approver_id is distinct from old.approver_id
     or new.approver_remarks is distinct from old.approver_remarks
     or new.actioned_at is distinct from old.actioned_at then
    raise exception 'Only an approver can change approval details';
  end if;

  if old.status in ('draft','pending_approval','rejected') then
    if new.status not in ('draft','pending_approval') then
      raise exception 'Status % can only be set by an approver', new.status;
    end if;
    if new.progress is distinct from old.progress then
      raise exception 'Progress can only be updated once the goal is approved';
    end if;
    return new;
  end if;

  if old.status = 'approved' then
    if new.status not in ('approved','completed')
       or new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.category is distinct from old.category
       or new.weightage is distinct from old.weightage
       or new.target is distinct from old.target
       or new.due_date is distinct from old.due_date
       or new.cycle_id is distinct from old.cycle_id
       or new.parent_goal_id is distinct from old.parent_goal_id then
      raise exception 'An approved goal can only have its progress updated or be marked completed';
    end if;
    return new;
  end if;

  raise exception 'This goal is already completed';
end $$;

drop trigger if exists goals_guard on public.goals;
create trigger goals_guard before insert or update on public.goals
  for each row when (new.employee_id is not null)
  execute function public.guard_goal();
