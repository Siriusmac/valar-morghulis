-- Record familiari normalizzati: ogni membro legge gli elementi condivisi,
-- mentre lo snapshot personale continua a contenere soltanto i dati privati.
create table public.family_shared_records (
  family_id uuid not null references public.families(id) on delete cascade,
  record_type text not null check (record_type in (
    'movement', 'scheduled_payment', 'reimbursement', 'transfer',
    'category', 'beneficiary', 'tag'
  )),
  record_id text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (family_id, record_type, record_id)
);

create index family_shared_records_created_by_idx
  on public.family_shared_records (created_by, family_id);

create trigger family_shared_records_set_updated_at
before update on public.family_shared_records
for each row execute function public.set_updated_at();

alter table public.family_shared_records enable row level security;

create policy family_shared_records_read_members
on public.family_shared_records
for select
to authenticated
using ((select public.is_family_member(family_id)));

revoke all on public.family_shared_records from anon, authenticated;
grant select on public.family_shared_records to authenticated;

-- Crea una copia familiare che contiene soltanto le allocazioni condivise.
create or replace function public.shared_movement_record(
  movement jsonb,
  target_family_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  split_item jsonb;
  shared_parts jsonb := '[]'::jsonb;
  shared_splits jsonb := '[]'::jsonb;
  primary_part jsonb;
  primary_amount numeric;
  shared_amount numeric := 0;
  split_total numeric := 0;
  part_index integer := 0;
begin
  if exists (
    select 1
    from public.accounts account
    where account.family_id = target_family_id
      and account.scope = 'family'
      and account.id::text = movement ->> 'accountId'
  ) then
    return movement;
  end if;

  for split_item in
    select value from jsonb_array_elements(coalesce(movement -> 'splits', '[]'::jsonb))
  loop
    split_total := split_total + coalesce((split_item ->> 'amount')::numeric, 0);
  end loop;
  primary_amount := greatest(coalesce((movement ->> 'amount')::numeric, 0) - split_total, 0);

  if coalesce((movement ->> 'shared')::boolean, false) and primary_amount > 0 then
    shared_parts := shared_parts || jsonb_build_array(jsonb_build_object(
      'amount', primary_amount,
      'categoryId', movement ->> 'categoryId'
    ));
  end if;

  for split_item in
    select value from jsonb_array_elements(coalesce(movement -> 'splits', '[]'::jsonb))
  loop
    if coalesce((split_item ->> 'shared')::boolean, false)
      and coalesce((split_item ->> 'amount')::numeric, 0) > 0 then
      shared_parts := shared_parts || jsonb_build_array(jsonb_build_object(
        'amount', (split_item ->> 'amount')::numeric,
        'categoryId', split_item ->> 'categoryId'
      ));
    end if;
  end loop;

  if jsonb_array_length(shared_parts) = 0 then
    return null;
  end if;
  if movement -> 'splits' is null then
    return movement;
  end if;

  primary_part := shared_parts -> 0;
  for split_item in
    select value from jsonb_array_elements(shared_parts)
  loop
    shared_amount := shared_amount + coalesce((split_item ->> 'amount')::numeric, 0);
    if part_index > 0 then
      shared_splits := shared_splits || jsonb_build_array(jsonb_build_object(
        'id', (movement ->> 'id') || '-shared-' || part_index,
        'amount', (split_item ->> 'amount')::numeric,
        'categoryId', split_item ->> 'categoryId',
        'shared', true
      ));
    end if;
    part_index := part_index + 1;
  end loop;

  return (movement - 'sharedSettlementAmount') || jsonb_build_object(
    'amount', shared_amount,
    'categoryId', primary_part ->> 'categoryId',
    'shared', true,
    'splits', shared_splits,
    'affectsAccountBalance', false
  );
end;
$$;

revoke all on function public.shared_movement_record(jsonb, uuid) from public, anon, authenticated;

-- Un'unica funzione atomica sincronizza i record dell'autore e rimuove quelli
-- che sono diventati personali o sono stati eliminati.
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
      'category', 'beneficiary', 'tag'
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
    where excluded.record_type in ('category', 'beneficiary', 'tag')
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

-- Recupera i dati condivisi già presenti negli snapshot privati.
insert into public.family_shared_records (
  family_id, record_type, record_id, created_by, data
)
select source.family_id, 'movement', movement ->> 'id', source.user_id, shared.data
from public.family_user_app_data source
cross join lateral jsonb_array_elements(coalesce(source.data -> 'movements', '[]'::jsonb)) movement
cross join lateral (
  select public.shared_movement_record(movement, source.family_id) as data
) shared
where shared.data is not null
  and nullif(movement ->> 'id', '') is not null
on conflict (family_id, record_type, record_id)
do update set data = excluded.data, updated_at = now();

insert into public.family_shared_records (
  family_id, record_type, record_id, created_by, data
)
select source.family_id, 'scheduled_payment', payment ->> 'id', source.user_id, payment
from public.family_user_app_data source
cross join lateral jsonb_array_elements(coalesce(source.data -> 'scheduledPayments', '[]'::jsonb)) payment
where coalesce((payment ->> 'shared')::boolean, false)
  and nullif(payment ->> 'id', '') is not null
on conflict (family_id, record_type, record_id) do nothing;

insert into public.family_shared_records (
  family_id, record_type, record_id, created_by, data
)
select source.family_id, 'reimbursement', reimbursement ->> 'id', source.user_id, reimbursement
from public.family_user_app_data source
cross join lateral jsonb_array_elements(coalesce(source.data -> 'reimbursements', '[]'::jsonb)) reimbursement
where nullif(reimbursement ->> 'id', '') is not null
on conflict (family_id, record_type, record_id) do nothing;

insert into public.family_shared_records (
  family_id, record_type, record_id, created_by, data
)
select source.family_id, 'transfer', transfer ->> 'id', source.user_id, transfer
from public.family_user_app_data source
cross join lateral jsonb_array_elements(coalesce(source.data -> 'transfers', '[]'::jsonb)) transfer
where nullif(transfer ->> 'id', '') is not null
  and (
    exists (
      select 1 from public.accounts account
      where account.family_id = source.family_id
        and account.scope = 'family'
        and account.id::text = transfer ->> 'fromAccountId'
    )
    or exists (
      select 1 from public.accounts account
      where account.family_id = source.family_id
        and account.scope = 'family'
        and account.id::text = transfer ->> 'toAccountId'
    )
  )
on conflict (family_id, record_type, record_id) do nothing;

insert into public.family_shared_records (
  family_id, record_type, record_id, created_by, data
)
select latest.family_id, latest.record_type, latest.record_id, latest.user_id, latest.data
from (
  select distinct on (source.family_id, directory.record_type, item ->> 'id')
    source.family_id,
    directory.record_type,
    item ->> 'id' as record_id,
    source.user_id,
    (item - 'ownerId') || jsonb_build_object('scope', 'family') as data
  from public.family_user_app_data source
  cross join lateral (values
    ('category'::text, 'categories'::text),
    ('beneficiary'::text, 'beneficiaries'::text),
    ('tag'::text, 'tags'::text)
  ) directory(record_type, json_key)
  cross join lateral jsonb_array_elements(coalesce(source.data -> directory.json_key, '[]'::jsonb)) item
  where item ->> 'scope' = 'family'
    and nullif(item ->> 'id', '') is not null
  order by source.family_id, directory.record_type, item ->> 'id', source.updated_at desc
) latest
on conflict (family_id, record_type, record_id)
do update set data = excluded.data, updated_at = now();

-- Abilita gli aggiornamenti in tempo reale per i membri già collegati.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'family_shared_records'
  ) then
    alter publication supabase_realtime add table public.family_shared_records;
  end if;
end
$$;
