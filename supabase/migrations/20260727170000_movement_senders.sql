-- I mittenti delle entrate sono anagrafiche distinte dai beneficiari delle spese.
alter table public.family_shared_records
  drop constraint if exists family_shared_records_record_type_check;

alter table public.family_shared_records
  add constraint family_shared_records_record_type_check
  check (record_type in (
    'movement', 'scheduled_payment', 'reimbursement', 'transfer',
    'category', 'beneficiary', 'sender', 'directory_redirect', 'tag'
  ));

create or replace function public.sync_family_shared_records(
  target_family_id uuid,
  records jsonb,
  owned_keys jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  item jsonb;
  item_type text;
  item_id text;
  item_data jsonb;
  transaction_types constant text[] := array[
    'movement', 'scheduled_payment', 'reimbursement', 'transfer'
  ];
begin
  if current_user_id is null or not public.is_family_member(target_family_id) then
    raise exception 'family_membership_required';
  end if;
  if jsonb_typeof(coalesce(records, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(owned_keys, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_shared_records';
  end if;

  for item in
    select value from jsonb_array_elements(coalesce(records, '[]'::jsonb))
  loop
    item_type := item ->> 'type';
    item_id := item ->> 'id';
    item_data := item -> 'data';
    if item_type not in (
      'movement', 'scheduled_payment', 'reimbursement', 'transfer',
      'category', 'beneficiary', 'sender', 'directory_redirect', 'tag'
    ) or nullif(item_id, '') is null or jsonb_typeof(item_data) <> 'object' then
      raise exception 'invalid_shared_record';
    end if;
    if item_type = any(transaction_types)
      and item_data ->> 'authorId' <> current_user_id::text then
      raise exception 'shared_record_author_mismatch';
    end if;

    insert into public.family_shared_records (
      family_id, record_type, record_id, created_by, data
    ) values (
      target_family_id, item_type, item_id, current_user_id, item_data
    )
    on conflict (family_id, record_type, record_id)
    do update set data = excluded.data, updated_at = now()
    where excluded.record_type in ('category', 'beneficiary', 'sender', 'tag')
       or public.family_shared_records.created_by = current_user_id;
  end loop;

  delete from public.family_shared_records existing
  where existing.family_id = target_family_id
    and existing.created_by = current_user_id
    and existing.record_type = any(transaction_types)
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(owned_keys, '[]'::jsonb)) key
      where key ->> 'type' = existing.record_type
        and key ->> 'id' = existing.record_id
    );
end;
$$;

revoke all on function public.sync_family_shared_records(uuid, jsonb, jsonb) from public;
grant execute on function public.sync_family_shared_records(uuid, jsonb, jsonb) to authenticated;

-- La rimozione esplicita evita che un'anagrafica familiare cancellata venga
-- ricaricata dal record condiviso al successivo accesso.
create or replace function public.delete_family_directory_record(
  target_family_id uuid,
  target_record_type text,
  target_record_id text,
  replacement_record_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not public.is_family_member(target_family_id) then
    raise exception 'family_membership_required';
  end if;
  if target_record_type not in ('beneficiary', 'sender')
    or nullif(target_record_id, '') is null then
    raise exception 'invalid_directory_record';
  end if;
  if replacement_record_id = target_record_id then
    raise exception 'invalid_directory_replacement';
  end if;

  delete from public.family_shared_records
  where family_id = target_family_id
    and record_type = target_record_type
    and record_id = target_record_id;

  insert into public.family_shared_records (
    family_id, record_type, record_id, created_by, data
  ) values (
    target_family_id,
    'directory_redirect',
    target_record_type || ':' || target_record_id,
    (select auth.uid()),
    jsonb_build_object(
      'kind', target_record_type,
      'oldId', target_record_id,
      'replacementId', nullif(replacement_record_id, '')
    )
  )
  on conflict (family_id, record_type, record_id)
  do update set data = excluded.data, updated_at = now();
end;
$$;

revoke all on function public.delete_family_directory_record(uuid, text, text, text) from public;
grant execute on function public.delete_family_directory_record(uuid, text, text, text) to authenticated;
