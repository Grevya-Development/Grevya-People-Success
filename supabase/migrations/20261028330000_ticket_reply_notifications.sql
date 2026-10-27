-- Notify the other side when someone replies on a helpdesk ticket.
create or replace function public.notify_ticket_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t record;
  author_name text;
begin
  select id, seq, subject, employee_id, assigned_to into t from public.helpdesk_tickets where id = new.ticket_id;
  select full_name into author_name from public.employees where id = new.author_id;
  if new.author_id is distinct from t.employee_id then
    perform public.notify(t.employee_id, 'New reply on ticket HD-' || t.seq, author_name || ': ' || left(new.body, 140), '/apps/helpdesk/' || t.id);
  end if;
  if t.assigned_to is not null and new.author_id is distinct from t.assigned_to then
    perform public.notify(t.assigned_to, 'New reply on ticket HD-' || t.seq, author_name || ': ' || left(new.body, 140), '/apps/helpdesk/' || t.id);
  end if;
  return new;
end $$;

drop trigger if exists ticket_comments_notify on public.ticket_comments;
create trigger ticket_comments_notify after insert on public.ticket_comments
  for each row execute function public.notify_ticket_comment();
