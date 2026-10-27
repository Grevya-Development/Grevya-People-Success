-- ---------------------------------------------------------------------------
-- A. Resignation form (PeopleStrong style): correspondence details + attachment
-- ---------------------------------------------------------------------------
alter table public.resignations
  add column correspondence_email text,
  add column correspondence_phone text,
  add column attachment_path text,
  add column attachment_name text;

alter table public.resignations
  add constraint resignations_correspondence_email_check
    check (correspondence_email is null or (char_length(correspondence_email) <= 254 and correspondence_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  add constraint resignations_correspondence_phone_check
    check (correspondence_phone is null or correspondence_phone ~ '^\+?[0-9 ()-]{6,20}$'),
  add constraint resignations_attachment_name_check
    check (attachment_name is null or char_length(attachment_name) <= 255);

-- The attachment must live in the resigning employee's own storage folder
-- (<auth uid>/...), so an employee cannot point the row at someone else's file
-- and have it signed for them or their approvers.
create or replace function public.guard_resignation_attachment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  if new.attachment_path is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.attachment_path is not distinct from old.attachment_path then
    return new;
  end if;
  select user_id into owner from public.employees where id = new.employee_id;
  if owner is null or split_part(new.attachment_path, '/', 1) <> owner::text then
    raise exception 'Attachment must be uploaded by the resigning employee';
  end if;
  return new;
end $$;

create trigger resignation_attachment_guard before insert or update of attachment_path on public.resignations
  for each row execute function public.guard_resignation_attachment();

-- ---------------------------------------------------------------------------
-- B. Policies as a document library
-- ---------------------------------------------------------------------------
alter table public.policies
  add column document_path text,
  add column document_name text,
  add column document_size bigint,
  add column document_type text;

alter table public.policies alter column content drop not null;

alter table public.policies
  add constraint policies_document_size_check check (document_size is null or (document_size >= 0 and document_size <= 20971520)),
  add constraint policies_document_name_check check (document_name is null or char_length(document_name) <= 255),
  add constraint policies_document_fields_check check (
    (document_path is null and document_name is null and document_size is null and document_type is null)
    or (document_path is not null and document_name is not null)
  ),
  add constraint policies_content_or_document_check check (
    nullif(btrim(coalesce(content, '')), '') is not null or document_path is not null
  );

-- Policy documents may be up to 20 MB (other uploads keep their 10 MB app-side cap).
update storage.buckets set file_size_limit = 20971520 where id = 'documents';
