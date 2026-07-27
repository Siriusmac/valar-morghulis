-- Ogni membro può pubblicare per una singola famiglia soltanto il nome e
-- l'identificatore opaco dei conti personali utilizzabili nei rimborsi.
create table if not exists public.family_reimbursement_accounts (
  family_id uuid not null references public.families(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  account_id text not null check (length(account_id) between 1 and 160),
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (family_id, owner_id, account_id)
);

create index if not exists family_reimbursement_accounts_family_owner_idx
  on public.family_reimbursement_accounts (family_id, owner_id);

alter table public.family_reimbursement_accounts enable row level security;

create policy "family members read reimbursement account names"
on public.family_reimbursement_accounts for select
to authenticated
using (public.is_family_member(family_id));

create policy "owners publish reimbursement account names"
on public.family_reimbursement_accounts for insert
to authenticated
with check (owner_id = (select auth.uid()) and public.is_family_member(family_id));

create policy "owners update reimbursement account names"
on public.family_reimbursement_accounts for update
to authenticated
using (owner_id = (select auth.uid()) and public.is_family_member(family_id))
with check (owner_id = (select auth.uid()) and public.is_family_member(family_id));

create policy "owners remove reimbursement account names"
on public.family_reimbursement_accounts for delete
to authenticated
using (owner_id = (select auth.uid()) and public.is_family_member(family_id));

revoke all on public.family_reimbursement_accounts from anon;
grant select, insert, update, delete on public.family_reimbursement_accounts to authenticated;

-- L'autore può modificare i propri dati descrittivi, ma lo stato deciso dalla
-- controparte viene sempre conservato lato server. I nuovi rimborsi sono
-- forzati nello stato pending anche se il client invia un valore diverso.
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
  existing_data jsonb;
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

    if item_type = 'reimbursement' then
      if (item_data ->> 'fromId')::uuid = (item_data ->> 'toId')::uuid
        or current_user_id not in ((item_data ->> 'fromId')::uuid, (item_data ->> 'toId')::uuid)
        or not exists (
          select 1 from public.family_members member
          where member.family_id = target_family_id
            and member.user_id = (item_data ->> 'fromId')::uuid
        )
        or not exists (
          select 1 from public.family_members member
          where member.family_id = target_family_id
            and member.user_id = (item_data ->> 'toId')::uuid
        )
        or coalesce((item_data ->> 'amount')::numeric, 0) <= 0 then
        raise exception 'invalid_family_reimbursement';
      end if;

      select stored.data into existing_data
      from public.family_shared_records stored
      where stored.family_id = target_family_id
        and stored.record_type = item_type
        and stored.record_id = item_id;

      item_data := item_data - array[
        'status', 'confirmedBy', 'confirmedAt', 'rejectedBy', 'rejectedAt'
      ];
      if existing_data is null then
        item_data := item_data || jsonb_build_object('status', 'pending');
      else
        item_data := item_data || jsonb_build_object(
          'status', coalesce(existing_data ->> 'status', 'confirmed')
        ) || jsonb_strip_nulls(jsonb_build_object(
          'confirmedBy', existing_data -> 'confirmedBy',
          'confirmedAt', existing_data -> 'confirmedAt',
          'rejectedBy', existing_data -> 'rejectedBy',
          'rejectedAt', existing_data -> 'rejectedAt'
        ));
      end if;
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

create or replace function public.respond_to_family_reimbursement(
  target_family_id uuid,
  target_reimbursement_id text,
  accept_reimbursement boolean,
  selected_account_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  reimbursement_data jsonb;
  reimbursement_author uuid;
  reimbursement_from uuid;
  reimbursement_to uuid;
begin
  if current_user_id is null or not public.is_family_member(target_family_id) then
    raise exception 'family_membership_required';
  end if;

  select data, created_by
  into reimbursement_data, reimbursement_author
  from public.family_shared_records
  where family_id = target_family_id
    and record_type = 'reimbursement'
    and record_id = target_reimbursement_id
  for update;

  if reimbursement_data is null then
    raise exception 'reimbursement_not_found';
  end if;
  reimbursement_from := nullif(reimbursement_data ->> 'fromId', '')::uuid;
  reimbursement_to := nullif(reimbursement_data ->> 'toId', '')::uuid;
  if current_user_id = reimbursement_author
    or (current_user_id is distinct from reimbursement_from
      and current_user_id is distinct from reimbursement_to) then
    raise exception 'reimbursement_counterparty_required';
  end if;
  if coalesce(reimbursement_data ->> 'status', 'confirmed') <> 'pending' then
    raise exception 'reimbursement_already_resolved';
  end if;

  if nullif(selected_account_id, '') is not null then
    if current_user_id = reimbursement_from then
      reimbursement_data := jsonb_set(reimbursement_data, '{fromAccountId}', to_jsonb(selected_account_id), true);
    else
      reimbursement_data := jsonb_set(reimbursement_data, '{toAccountId}', to_jsonb(selected_account_id), true);
    end if;
  end if;

  if accept_reimbursement then
    if nullif(reimbursement_data ->> 'fromAccountId', '') is null
      or nullif(reimbursement_data ->> 'toAccountId', '') is null then
      raise exception 'reimbursement_accounts_required';
    end if;
    reimbursement_data := reimbursement_data
      - array['rejectedBy', 'rejectedAt']
      || jsonb_build_object(
        'status', 'confirmed',
        'confirmedBy', current_user_id::text,
        'confirmedAt', now()
      );
  else
    reimbursement_data := reimbursement_data
      - array['confirmedBy', 'confirmedAt']
      || jsonb_build_object(
        'status', 'rejected',
        'rejectedBy', current_user_id::text,
        'rejectedAt', now()
      );
  end if;

  update public.family_shared_records
  set data = reimbursement_data, updated_at = now()
  where family_id = target_family_id
    and record_type = 'reimbursement'
    and record_id = target_reimbursement_id;
end;
$$;

revoke all on function public.respond_to_family_reimbursement(uuid, text, boolean, text) from public;
grant execute on function public.respond_to_family_reimbursement(uuid, text, boolean, text) to authenticated;
