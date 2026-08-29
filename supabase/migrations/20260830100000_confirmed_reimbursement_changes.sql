-- Le rettifiche dei rimborsi confermati richiedono sempre l'approvazione
-- dell'altra parte. Il record originale resta efficace fino alla risposta e
-- ogni richiesta rimane nello storico per finalita di audit.
create table if not exists public.family_reimbursement_change_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  reimbursement_id text not null,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  change_kind text not null check (change_kind in ('update', 'delete')),
  proposed_amount numeric check (proposed_amount is null or proposed_amount > 0),
  proposed_date date,
  proposed_account_id text,
  original_data jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  requested_at timestamptz not null default now(),
  responded_by uuid references public.profiles(id) on delete set null,
  responded_at timestamptz
);

create unique index if not exists family_reimbursement_change_requests_pending_idx
  on public.family_reimbursement_change_requests (family_id, reimbursement_id)
  where status = 'pending';
create index if not exists family_reimbursement_change_requests_family_idx
  on public.family_reimbursement_change_requests (family_id, requested_at desc);

alter table public.family_reimbursement_change_requests enable row level security;

create policy "participants read reimbursement change requests"
on public.family_reimbursement_change_requests for select
to authenticated
using (
  public.is_family_member(family_id)
  and exists (
    select 1 from public.family_shared_records reimbursement
    where reimbursement.family_id = family_reimbursement_change_requests.family_id
      and reimbursement.record_type = 'reimbursement'
      and reimbursement.record_id = family_reimbursement_change_requests.reimbursement_id
      and (select auth.uid()) in (
        nullif(reimbursement.data ->> 'fromId', '')::uuid,
        nullif(reimbursement.data ->> 'toId', '')::uuid
      )
  )
);

revoke all on public.family_reimbursement_change_requests from anon, authenticated;
grant select on public.family_reimbursement_change_requests to authenticated;

-- La sincronizzazione ordinaria non puo modificare o eliminare un rimborso
-- gia risolto. Le rettifiche passano esclusivamente dalle RPC con approvazione
-- della controparte definite in questa migration.
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
  existing_status text;
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

      existing_status := coalesce(existing_data ->> 'status', 'confirmed');
      if existing_data is null then
        item_data := item_data - array[
          'status', 'confirmedBy', 'confirmedAt', 'rejectedBy', 'rejectedAt',
          'cancelledBy', 'cancelledAt'
        ] || jsonb_build_object('status', 'pending');
      elsif existing_status <> 'pending' then
        item_data := existing_data;
      else
        item_data := item_data - array[
          'status', 'confirmedBy', 'confirmedAt', 'rejectedBy', 'rejectedAt',
          'cancelledBy', 'cancelledAt'
        ] || jsonb_build_object('status', existing_status);
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
    and (
      existing.record_type <> 'reimbursement'
      or coalesce(existing.data ->> 'status', 'confirmed') = 'pending'
    )
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

create or replace function public.request_family_reimbursement_change(
  target_family_id uuid,
  target_reimbursement_id text,
  target_change_kind text,
  target_amount numeric default null,
  target_date date default null,
  target_selected_account_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  reimbursement_data jsonb;
  reimbursement_from uuid;
  reimbursement_to uuid;
  request_id uuid;
  account_is_owned boolean := false;
begin
  if current_user_id is null or not public.is_family_member(target_family_id) then
    raise exception 'family_membership_required';
  end if;
  if target_change_kind not in ('update', 'delete') then
    raise exception 'invalid_reimbursement_change';
  end if;

  select data into reimbursement_data
  from public.family_shared_records
  where family_id = target_family_id
    and record_type = 'reimbursement'
    and record_id = target_reimbursement_id
  for update;

  if reimbursement_data is null then raise exception 'reimbursement_not_found'; end if;
  reimbursement_from := nullif(reimbursement_data ->> 'fromId', '')::uuid;
  reimbursement_to := nullif(reimbursement_data ->> 'toId', '')::uuid;
  if current_user_id not in (reimbursement_from, reimbursement_to) then
    raise exception 'reimbursement_participant_required';
  end if;
  if coalesce(reimbursement_data ->> 'status', 'confirmed') <> 'confirmed' then
    raise exception 'confirmed_reimbursement_required';
  end if;
  if target_change_kind = 'update'
    and (coalesce(target_amount, 0) <= 0 or target_date is null) then
    raise exception 'invalid_reimbursement_change';
  end if;

  if nullif(target_selected_account_id, '') is not null then
    if coalesce(reimbursement_data ->> 'settlementMethod', 'money') = 'purchase' then
      raise exception 'purchase_reimbursement_has_no_account';
    end if;
    select exists (
      select 1
      from public.user_app_data app_data
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(app_data.data -> 'accounts') = 'array'
          then app_data.data -> 'accounts' else '[]'::jsonb end
      ) account
      where app_data.user_id = current_user_id
        and account ->> 'id' = target_selected_account_id
        and account ->> 'ownerId' = current_user_id::text
        and account ->> 'scope' = 'personal'
    ) or (
      current_user_id = reimbursement_to
      and exists (
        select 1 from public.accounts account
        where account.id = target_selected_account_id
          and account.family_id = target_family_id
          and account.scope = 'family'
      )
    ) into account_is_owned;
    if not account_is_owned then raise exception 'reimbursement_account_not_owned'; end if;
  end if;

  insert into public.family_reimbursement_change_requests (
    family_id, reimbursement_id, requested_by, change_kind,
    proposed_amount, proposed_date, proposed_account_id, original_data
  ) values (
    target_family_id, target_reimbursement_id, current_user_id, target_change_kind,
    case when target_change_kind = 'update' then target_amount else null end,
    case when target_change_kind = 'update' then target_date else null end,
    case when target_change_kind = 'update' then nullif(target_selected_account_id, '') else null end,
    reimbursement_data
  ) returning id into request_id;

  return request_id;
exception
  when unique_violation then raise exception 'reimbursement_change_pending';
end;
$$;

create or replace function public.respond_to_family_reimbursement_change(
  target_request_id uuid,
  accept_change boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  change_request public.family_reimbursement_change_requests%rowtype;
  reimbursement_data jsonb;
  reimbursement_from uuid;
  reimbursement_to uuid;
  commissioned_purchase_id text;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;

  select * into change_request
  from public.family_reimbursement_change_requests
  where id = target_request_id
  for update;

  if change_request.id is null then raise exception 'reimbursement_change_not_found'; end if;
  if change_request.status <> 'pending' then raise exception 'reimbursement_change_already_resolved'; end if;
  if not public.is_family_member(change_request.family_id) then
    raise exception 'family_membership_required';
  end if;

  select data into reimbursement_data
  from public.family_shared_records
  where family_id = change_request.family_id
    and record_type = 'reimbursement'
    and record_id = change_request.reimbursement_id
  for update;

  if reimbursement_data is null then raise exception 'reimbursement_not_found'; end if;
  reimbursement_from := nullif(reimbursement_data ->> 'fromId', '')::uuid;
  reimbursement_to := nullif(reimbursement_data ->> 'toId', '')::uuid;
  if current_user_id not in (reimbursement_from, reimbursement_to)
    or current_user_id = change_request.requested_by then
    raise exception 'reimbursement_change_counterparty_required';
  end if;
  if coalesce(reimbursement_data ->> 'status', 'confirmed') <> 'confirmed' then
    raise exception 'confirmed_reimbursement_required';
  end if;

  if accept_change then
    if change_request.change_kind = 'delete' then
      reimbursement_data := reimbursement_data || jsonb_build_object(
        'status', 'cancelled',
        'cancelledBy', current_user_id::text,
        'cancelledAt', now()
      );
      commissioned_purchase_id := nullif(reimbursement_data ->> 'commissionedPurchaseId', '');
      if commissioned_purchase_id is not null then
        update public.commissioned_purchases
        set status = 'rejected', resolved_at = now()
        where id = commissioned_purchase_id
          and family_id = change_request.family_id
          and reimbursement_id = change_request.reimbursement_id;
      end if;
    else
      reimbursement_data := jsonb_set(reimbursement_data, '{amount}', to_jsonb(change_request.proposed_amount), true);
      reimbursement_data := jsonb_set(reimbursement_data, '{date}', to_jsonb(change_request.proposed_date::text), true);
      if change_request.proposed_account_id is not null then
        if change_request.requested_by = reimbursement_from then
          reimbursement_data := jsonb_set(reimbursement_data, '{fromAccountId}', to_jsonb(change_request.proposed_account_id), true);
        else
          reimbursement_data := jsonb_set(reimbursement_data, '{toAccountId}', to_jsonb(change_request.proposed_account_id), true);
        end if;
      end if;
      commissioned_purchase_id := nullif(reimbursement_data ->> 'commissionedPurchaseId', '');
      if commissioned_purchase_id is not null then
        update public.commissioned_purchases
        set amount = change_request.proposed_amount,
          purchase_date = change_request.proposed_date
        where id = commissioned_purchase_id
          and family_id = change_request.family_id
          and reimbursement_id = change_request.reimbursement_id;
      end if;
    end if;

    update public.family_shared_records
    set data = reimbursement_data, updated_at = now()
    where family_id = change_request.family_id
      and record_type = 'reimbursement'
      and record_id = change_request.reimbursement_id;
  end if;

  update public.family_reimbursement_change_requests
  set status = case when accept_change then 'approved' else 'rejected' end,
    responded_by = current_user_id,
    responded_at = now()
  where id = target_request_id;
end;
$$;

-- Usa PL/pgSQL per una gestione esplicita di NOT FOUND, senza dipendere da
-- helper applicativi esterni.
create or replace function public.withdraw_family_reimbursement_change(target_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'authentication_required'; end if;
  update public.family_reimbursement_change_requests
  set status = 'withdrawn', responded_by = (select auth.uid()), responded_at = now()
  where id = target_request_id
    and requested_by = (select auth.uid())
    and status = 'pending';
  if not found then raise exception 'reimbursement_change_not_withdrawable'; end if;
end;
$$;

revoke all on function public.request_family_reimbursement_change(uuid, text, text, numeric, date, text) from public;
revoke all on function public.respond_to_family_reimbursement_change(uuid, boolean) from public;
revoke all on function public.withdraw_family_reimbursement_change(uuid) from public;
grant execute on function public.request_family_reimbursement_change(uuid, text, text, numeric, date, text) to authenticated;
grant execute on function public.respond_to_family_reimbursement_change(uuid, boolean) to authenticated;
grant execute on function public.withdraw_family_reimbursement_change(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'family_reimbursement_change_requests'
  ) then
    alter publication supabase_realtime add table public.family_reimbursement_change_requests;
  end if;
end;
$$;
