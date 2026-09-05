-- Separa la conferma di ricezione dell'acquisto dall'emissione e dalla
-- conferma del rimborso. I rimborsi tramite compensazione familiare restano
-- invariati e si chiudono con la catalogazione dell'acquisto.
alter table public.commissioned_purchases
  add column reimbursement_status text,
  add column reimbursement_source_account_id text,
  add column reimbursement_destination_account_id text,
  add column reimbursement_issued_at timestamptz,
  add column reimbursement_confirmed_at timestamptz,
  add column reimbursement_cancelled_at timestamptz,
  add constraint commissioned_purchase_reimbursement_status_check
    check (reimbursement_status is null or reimbursement_status in ('not_issued', 'pending', 'confirmed', 'cancelled'));

-- Prima di questa migrazione la conferma dell'acquisto emetteva implicitamente
-- il rimborso. Questi casi diventano quindi rimborsi emessi ma ancora da
-- confermare da parte di chi aveva anticipato la spesa.
update public.commissioned_purchases
set reimbursement_status = 'pending',
  reimbursement_source_account_id = recipient_account_id,
  reimbursement_issued_at = resolved_at
where reimbursement_id is null
  and status = 'confirmed';

create index commissioned_purchases_reimbursement_pending_idx
  on public.commissioned_purchases (payer_id, reimbursement_issued_at desc)
  where reimbursement_status = 'pending';

create or replace function public.respond_to_commissioned_purchase(
  target_purchase_id text,
  accept_purchase boolean,
  target_recipient_movement_id text default null,
  target_category_id text default null,
  target_account_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  purchase public.commissioned_purchases%rowtype;
  reimbursement public.family_shared_records%rowtype;
  linkage_parties_match boolean := false;
  reimbursement_record_status text;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;

  select * into purchase from public.commissioned_purchases
  where id = target_purchase_id
  for update;

  if purchase.id is null then raise exception 'purchase_not_found'; end if;
  if purchase.recipient_id is distinct from current_user_id then raise exception 'purchase_recipient_required'; end if;
  if purchase.status <> 'pending' then raise exception 'purchase_already_resolved'; end if;

  if purchase.family_id is not null then
    select * into reimbursement from public.family_shared_records
    where family_id = purchase.family_id
      and record_type = 'reimbursement'
      and record_id = purchase.reimbursement_id
    for update;

    linkage_parties_match := reimbursement.record_id is not null
      and reimbursement.created_by = purchase.payer_id
      and coalesce(reimbursement.data ->> 'authorId', '') = purchase.payer_id::text
      and coalesce(reimbursement.data ->> 'fromId', '') = purchase.payer_id::text
      and coalesce(reimbursement.data ->> 'toId', '') = current_user_id::text;
    reimbursement_record_status := coalesce(reimbursement.data ->> 'status', 'confirmed');

    if accept_purchase and not linkage_parties_match then raise exception 'reimbursement_purchase_mismatch'; end if;
    if accept_purchase and reimbursement_record_status <> 'pending' then raise exception 'reimbursement_already_resolved'; end if;
  end if;

  if accept_purchase then
    if nullif(target_recipient_movement_id, '') is null or nullif(target_category_id, '') is null then
      raise exception 'purchase_catalog_required';
    end if;
    if purchase.reimbursement_id is not null and nullif(target_account_id, '') is null then
      raise exception 'purchase_catalog_required';
    end if;

    update public.commissioned_purchases
    set status = 'confirmed',
      recipient_movement_id = target_recipient_movement_id,
      recipient_category_id = target_category_id,
      recipient_account_id = case when purchase.reimbursement_id is not null then target_account_id else null end,
      reimbursement_status = case when purchase.reimbursement_id is null then 'not_issued' else null end,
      resolved_at = now()
    where id = target_purchase_id;

    if purchase.family_id is not null then
      update public.family_shared_records
      set data = data - array['rejectedBy', 'rejectedAt'] || jsonb_build_object(
          'status', 'confirmed',
          'settlementMethod', 'purchase',
          'commissionedPurchaseId', purchase.id,
          'confirmedBy', current_user_id::text,
          'confirmedAt', now()
        ),
        updated_at = now()
      where family_id = purchase.family_id
        and record_type = 'reimbursement'
        and record_id = purchase.reimbursement_id
        and coalesce(data ->> 'status', 'confirmed') = 'pending';
    end if;
  else
    update public.commissioned_purchases
    set status = 'rejected', resolved_at = now()
    where id = target_purchase_id;

    if purchase.family_id is not null and linkage_parties_match and reimbursement_record_status = 'pending' then
      update public.family_shared_records
      set data = data - array['confirmedBy', 'confirmedAt'] || jsonb_build_object(
          'status', 'rejected',
          'settlementMethod', 'purchase',
          'commissionedPurchaseId', purchase.id,
          'rejectedBy', current_user_id::text,
          'rejectedAt', now()
        ),
        updated_at = now()
      where family_id = purchase.family_id
        and record_type = 'reimbursement'
        and record_id = purchase.reimbursement_id
        and coalesce(data ->> 'status', 'confirmed') = 'pending';
    end if;
  end if;
end;
$$;

create or replace function public.issue_commissioned_purchase_reimbursement(
  target_purchase_id text,
  target_source_account_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  purchase public.commissioned_purchases%rowtype;
  account_is_owned boolean := false;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  if nullif(target_source_account_id, '') is null then raise exception 'reimbursement_source_account_required'; end if;

  select * into purchase from public.commissioned_purchases
  where id = target_purchase_id
  for update;

  if purchase.id is null then raise exception 'purchase_not_found'; end if;
  if purchase.recipient_id is distinct from current_user_id then raise exception 'purchase_recipient_required'; end if;
  if purchase.reimbursement_id is not null then raise exception 'ordinary_purchase_required'; end if;
  if purchase.status <> 'confirmed' then raise exception 'purchase_confirmation_required'; end if;
  if purchase.reimbursement_status <> 'not_issued' then raise exception 'reimbursement_already_resolved'; end if;

  select exists (
    select 1
    from public.user_app_data app_data
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(app_data.data -> 'accounts') = 'array'
        then app_data.data -> 'accounts' else '[]'::jsonb end
    ) account
    where app_data.user_id = current_user_id
      and account ->> 'id' = target_source_account_id
      and account ->> 'ownerId' = current_user_id::text
      and account ->> 'scope' = 'personal'
  ) into account_is_owned;
  if not account_is_owned then raise exception 'reimbursement_account_not_owned'; end if;

  update public.commissioned_purchases
  set reimbursement_status = 'pending',
    reimbursement_source_account_id = target_source_account_id,
    recipient_account_id = target_source_account_id,
    reimbursement_issued_at = now(),
    reimbursement_destination_account_id = null,
    reimbursement_confirmed_at = null,
    reimbursement_cancelled_at = null
  where id = target_purchase_id;
end;
$$;

create or replace function public.respond_to_commissioned_purchase_reimbursement(
  target_purchase_id text,
  accept_reimbursement boolean,
  target_destination_account_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  purchase public.commissioned_purchases%rowtype;
  account_is_owned boolean := false;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;

  select * into purchase from public.commissioned_purchases
  where id = target_purchase_id
  for update;

  if purchase.id is null then raise exception 'purchase_not_found'; end if;
  if purchase.payer_id is distinct from current_user_id then raise exception 'purchase_payer_required'; end if;
  if purchase.reimbursement_id is not null then raise exception 'ordinary_purchase_required'; end if;
  if purchase.status <> 'confirmed' or purchase.reimbursement_status <> 'pending' then
    raise exception 'reimbursement_already_resolved';
  end if;

  if accept_reimbursement then
    if nullif(target_destination_account_id, '') is null then raise exception 'reimbursement_destination_account_required'; end if;
    select exists (
      select 1
      from public.user_app_data app_data
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(app_data.data -> 'accounts') = 'array'
          then app_data.data -> 'accounts' else '[]'::jsonb end
      ) account
      where app_data.user_id = current_user_id
        and account ->> 'id' = target_destination_account_id
        and account ->> 'ownerId' = current_user_id::text
        and account ->> 'scope' = 'personal'
    ) into account_is_owned;
    if not account_is_owned then raise exception 'reimbursement_account_not_owned'; end if;
    update public.commissioned_purchases
    set reimbursement_status = 'confirmed',
      reimbursement_destination_account_id = target_destination_account_id,
      reimbursement_confirmed_at = now(),
      reimbursement_cancelled_at = null
    where id = target_purchase_id;
  else
    update public.commissioned_purchases
    set reimbursement_status = 'cancelled',
      reimbursement_destination_account_id = null,
      reimbursement_confirmed_at = null,
      reimbursement_cancelled_at = now()
    where id = target_purchase_id;
  end if;
end;
$$;

revoke all on function public.issue_commissioned_purchase_reimbursement(text, text) from public;
revoke all on function public.respond_to_commissioned_purchase_reimbursement(text, boolean, text) from public;
grant execute on function public.issue_commissioned_purchase_reimbursement(text, text) to authenticated;
grant execute on function public.respond_to_commissioned_purchase_reimbursement(text, boolean, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'commissioned_purchases'
  ) then
    alter publication supabase_realtime add table public.commissioned_purchases;
  end if;
end;
$$;
