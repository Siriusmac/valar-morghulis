-- Prestiti familiari e restituzioni restano record contabili distinti dai
-- rimborsi. Ogni passaggio diventa efficace soltanto dopo la conferma della
-- controparte e gli importi parziali non possono superare il residuo.
alter table public.family_shared_records
  drop constraint if exists family_shared_records_record_type_check;

alter table public.family_shared_records
  add constraint family_shared_records_record_type_check
  check (record_type in (
    'movement', 'scheduled_payment', 'reimbursement', 'transfer',
    'loan', 'loan_repayment',
    'category', 'beneficiary', 'sender', 'directory_redirect', 'tag'
  ));

create or replace function public.family_member_shared_balance(
  target_family_id uuid,
  target_user_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_count integer;
  personal_share numeric;
  other_share numeric;
  result numeric := 0;
  item record;
  item_amount numeric;
  direction numeric;
  destination_is_family boolean;
  source_is_family boolean;
begin
  select count(*) into member_count from public.family_members
  where family_id = target_family_id;
  if member_count < 2 then return 0; end if;
  personal_share := 1.0 / member_count;
  other_share := (member_count - 1.0) / member_count;

  for item in select record_type, data from public.family_shared_records
    where family_id = target_family_id
      and record_type in ('movement', 'reimbursement', 'transfer', 'loan_repayment')
  loop
    if item.record_type = 'movement' then
      if exists (select 1 from public.accounts account
        where account.family_id = target_family_id and account.id::text = item.data ->> 'accountId'
          and account.scope = 'family') then continue; end if;
      item_amount := coalesce(nullif(item.data ->> 'sharedSettlementAmount', '')::numeric, (item.data ->> 'amount')::numeric, 0);
      direction := case when item.data ->> 'type' = 'income' then -1 else 1 end;
      result := result + case when item.data ->> 'memberId' = target_user_id::text
        then item_amount * other_share * direction else -item_amount * personal_share * direction end;
    elsif item.record_type = 'reimbursement' and coalesce(item.data ->> 'status', 'confirmed') = 'confirmed' then
      select exists (select 1 from public.accounts account
        where account.family_id = target_family_id and account.id::text = item.data ->> 'toAccountId'
          and account.scope = 'family') into destination_is_family;
      item_amount := coalesce((item.data ->> 'amount')::numeric, 0);
      if destination_is_family then
        result := result + case when item.data ->> 'fromId' = target_user_id::text
          then item_amount * other_share else -item_amount * personal_share end;
      else
        if item.data ->> 'toId' = target_user_id::text then result := result - item_amount; end if;
        if item.data ->> 'fromId' = target_user_id::text then result := result + item_amount; end if;
      end if;
    elsif item.record_type = 'transfer' then
      select exists (select 1 from public.accounts account
        where account.family_id = target_family_id and account.id::text = item.data ->> 'fromAccountId'
          and account.scope = 'family') into source_is_family;
      select exists (select 1 from public.accounts account
        where account.family_id = target_family_id and account.id::text = item.data ->> 'toAccountId'
          and account.scope = 'family') into destination_is_family;
      if source_is_family and not destination_is_family then
        item_amount := coalesce((item.data ->> 'amount')::numeric, 0);
        result := result + case when item.data ->> 'authorId' = target_user_id::text
          then -item_amount * other_share else item_amount * personal_share end;
      end if;
    elsif item.record_type = 'loan_repayment'
      and item.data ->> 'status' = 'confirmed' and item.data ->> 'method' = 'family_credit' then
      item_amount := coalesce((item.data ->> 'amount')::numeric, 0);
      if item.data ->> 'borrowerId' = target_user_id::text then result := result - item_amount; end if;
      if item.data ->> 'lenderId' = target_user_id::text then result := result + item_amount; end if;
    end if;
  end loop;
  return round(result, 2);
end;
$$;

create or replace function public.create_family_loan(
  target_family_id uuid,
  target_loan_id text,
  target_borrower_id uuid,
  target_amount numeric,
  target_date date,
  target_description text,
  target_lender_account_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  account_is_owned boolean := false;
begin
  if current_user_id is null or not public.is_family_member(target_family_id) then
    raise exception 'family_membership_required';
  end if;
  if nullif(target_loan_id, '') is null or target_borrower_id = current_user_id
    or coalesce(target_amount, 0) <= 0 or target_date is null
    or nullif(target_description, '') is null or nullif(target_lender_account_id, '') is null
    or not exists (
      select 1 from public.family_members member
      where member.family_id = target_family_id and member.user_id = target_borrower_id
    ) then
    raise exception 'invalid_family_loan';
  end if;

  select exists (
    select 1 from public.user_app_data app_data
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(app_data.data -> 'accounts') = 'array'
        then app_data.data -> 'accounts' else '[]'::jsonb end
    ) account
    where app_data.user_id = current_user_id
      and account ->> 'id' = target_lender_account_id
      and account ->> 'ownerId' = current_user_id::text
      and account ->> 'scope' = 'personal'
  ) into account_is_owned;
  if not account_is_owned then raise exception 'loan_account_not_owned'; end if;

  insert into public.family_shared_records (family_id, record_type, record_id, created_by, data)
  values (target_family_id, 'loan', target_loan_id, current_user_id, jsonb_build_object(
    'id', target_loan_id,
    'lenderId', current_user_id::text,
    'borrowerId', target_borrower_id::text,
    'amount', target_amount,
    'date', target_date,
    'description', trim(target_description),
    'authorId', current_user_id::text,
    'lenderAccountId', target_lender_account_id,
    'status', 'pending'
  ));
exception
  when unique_violation then raise exception 'loan_already_exists';
end;
$$;

create or replace function public.respond_to_family_loan(
  target_family_id uuid,
  target_loan_id text,
  accept_loan boolean,
  selected_account_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  loan_data jsonb;
  account_is_owned boolean := false;
begin
  if current_user_id is null or not public.is_family_member(target_family_id) then
    raise exception 'family_membership_required';
  end if;
  select data into loan_data from public.family_shared_records
  where family_id = target_family_id and record_type = 'loan' and record_id = target_loan_id
  for update;
  if loan_data is null then raise exception 'loan_not_found'; end if;
  if loan_data ->> 'borrowerId' <> current_user_id::text then raise exception 'loan_borrower_required'; end if;
  if loan_data ->> 'status' <> 'pending' then raise exception 'loan_already_resolved'; end if;

  if accept_loan then
    if nullif(selected_account_id, '') is null then raise exception 'loan_destination_account_required'; end if;
    select exists (
      select 1 from public.user_app_data app_data
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(app_data.data -> 'accounts') = 'array'
          then app_data.data -> 'accounts' else '[]'::jsonb end
      ) account
      where app_data.user_id = current_user_id
        and account ->> 'id' = selected_account_id
        and account ->> 'ownerId' = current_user_id::text
        and account ->> 'scope' = 'personal'
    ) into account_is_owned;
    if not account_is_owned then raise exception 'loan_account_not_owned'; end if;
    loan_data := loan_data || jsonb_build_object(
      'borrowerAccountId', selected_account_id,
      'status', 'confirmed', 'confirmedBy', current_user_id::text, 'confirmedAt', now()
    );
  else
    loan_data := loan_data || jsonb_build_object(
      'status', 'rejected', 'rejectedBy', current_user_id::text, 'rejectedAt', now()
    );
  end if;
  update public.family_shared_records set data = loan_data, updated_at = now()
  where family_id = target_family_id and record_type = 'loan' and record_id = target_loan_id;
end;
$$;

create or replace function public.create_family_loan_repayment(
  target_family_id uuid,
  target_repayment_id text,
  target_loan_id text,
  target_amount numeric,
  target_date date,
  target_description text,
  target_method text,
  target_from_account_id text default null,
  target_payer_movement_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  loan_data jsonb;
  already_committed numeric := 0;
  family_credit_reserved numeric := 0;
  account_is_owned boolean := false;
begin
  if current_user_id is null or not public.is_family_member(target_family_id) then
    raise exception 'family_membership_required';
  end if;
  select data into loan_data from public.family_shared_records
  where family_id = target_family_id and record_type = 'loan' and record_id = target_loan_id
  for update;
  if loan_data is null then raise exception 'loan_not_found'; end if;
  if loan_data ->> 'status' <> 'confirmed' then raise exception 'confirmed_loan_required'; end if;
  if loan_data ->> 'borrowerId' <> current_user_id::text then raise exception 'loan_borrower_required'; end if;
  if target_method not in ('money', 'purchase', 'family_credit') or coalesce(target_amount, 0) <= 0
    or target_date is null or nullif(target_repayment_id, '') is null then
    raise exception 'invalid_loan_repayment';
  end if;

  select coalesce(sum((repayment.data ->> 'amount')::numeric), 0) into already_committed
  from public.family_shared_records repayment
  where repayment.family_id = target_family_id
    and repayment.record_type = 'loan_repayment'
    and repayment.data ->> 'loanId' = target_loan_id
    and repayment.data ->> 'status' in ('pending', 'confirmed');
  if already_committed + target_amount > (loan_data ->> 'amount')::numeric then
    raise exception 'loan_repayment_exceeds_outstanding';
  end if;

  if target_method in ('money', 'purchase') then
    if nullif(target_from_account_id, '') is null then raise exception 'loan_source_account_required'; end if;
    select exists (
      select 1 from public.user_app_data app_data
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(app_data.data -> 'accounts') = 'array'
          then app_data.data -> 'accounts' else '[]'::jsonb end
      ) account
      where app_data.user_id = current_user_id
        and account ->> 'id' = target_from_account_id
        and account ->> 'ownerId' = current_user_id::text
        and account ->> 'scope' = 'personal'
    ) into account_is_owned;
    if not account_is_owned then raise exception 'loan_account_not_owned'; end if;
  end if;
  if target_method = 'purchase' and nullif(target_payer_movement_id, '') is null then
    raise exception 'loan_purchase_movement_required';
  end if;
  if target_method = 'family_credit' then
    select coalesce(sum((repayment.data ->> 'amount')::numeric), 0) into family_credit_reserved
    from public.family_shared_records repayment
    where repayment.family_id = target_family_id
      and repayment.record_type = 'loan_repayment'
      and repayment.data ->> 'borrowerId' = current_user_id::text
      and repayment.data ->> 'lenderId' = loan_data ->> 'lenderId'
      and repayment.data ->> 'method' = 'family_credit'
      and repayment.data ->> 'status' = 'pending';
    if target_amount + family_credit_reserved > public.family_member_shared_balance(target_family_id, current_user_id)
      or target_amount + family_credit_reserved > -public.family_member_shared_balance(target_family_id, (loan_data ->> 'lenderId')::uuid) then
      raise exception 'insufficient_family_credit';
    end if;
  end if;

  insert into public.family_shared_records (family_id, record_type, record_id, created_by, data)
  values (target_family_id, 'loan_repayment', target_repayment_id, current_user_id, jsonb_strip_nulls(jsonb_build_object(
    'id', target_repayment_id, 'loanId', target_loan_id,
    'lenderId', loan_data ->> 'lenderId', 'borrowerId', current_user_id::text,
    'amount', target_amount, 'date', target_date,
    'description', coalesce(nullif(trim(target_description), ''), 'Restituzione prestito'),
    'authorId', current_user_id::text, 'method', target_method,
    'fromAccountId', target_from_account_id, 'payerMovementId', target_payer_movement_id,
    'status', 'pending'
  )));
exception
  when unique_violation then raise exception 'loan_repayment_already_exists';
end;
$$;

create or replace function public.respond_to_family_loan_repayment(
  target_family_id uuid,
  target_repayment_id text,
  accept_repayment boolean,
  selected_account_id text default null,
  selected_category_id text default null,
  target_recipient_movement_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  repayment_data jsonb;
  repayment_method text;
  account_is_owned boolean := false;
begin
  if current_user_id is null or not public.is_family_member(target_family_id) then
    raise exception 'family_membership_required';
  end if;
  select data into repayment_data from public.family_shared_records
  where family_id = target_family_id and record_type = 'loan_repayment' and record_id = target_repayment_id
  for update;
  if repayment_data is null then raise exception 'loan_repayment_not_found'; end if;
  if repayment_data ->> 'lenderId' <> current_user_id::text then raise exception 'loan_lender_required'; end if;
  if repayment_data ->> 'status' <> 'pending' then raise exception 'loan_repayment_already_resolved'; end if;
  repayment_method := repayment_data ->> 'method';

  if accept_repayment and repayment_method = 'money' then
    if nullif(selected_account_id, '') is null then raise exception 'loan_destination_account_required'; end if;
    select exists (
      select 1 from public.user_app_data app_data
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(app_data.data -> 'accounts') = 'array'
          then app_data.data -> 'accounts' else '[]'::jsonb end
      ) account
      where app_data.user_id = current_user_id
        and account ->> 'id' = selected_account_id
        and account ->> 'ownerId' = current_user_id::text
        and account ->> 'scope' = 'personal'
    ) into account_is_owned;
    if not account_is_owned then raise exception 'loan_account_not_owned'; end if;
    repayment_data := repayment_data || jsonb_build_object('toAccountId', selected_account_id);
  end if;
  if accept_repayment and repayment_method = 'purchase' then
    if nullif(selected_category_id, '') is null or nullif(target_recipient_movement_id, '') is null then
      raise exception 'loan_purchase_catalog_required';
    end if;
    repayment_data := repayment_data || jsonb_build_object(
      'categoryId', selected_category_id, 'recipientMovementId', target_recipient_movement_id
    );
  end if;

  repayment_data := repayment_data || case when accept_repayment then jsonb_build_object(
    'status', 'confirmed', 'confirmedBy', current_user_id::text, 'confirmedAt', now()
  ) else jsonb_build_object(
    'status', 'rejected', 'rejectedBy', current_user_id::text, 'rejectedAt', now()
  ) end;
  update public.family_shared_records set data = repayment_data, updated_at = now()
  where family_id = target_family_id and record_type = 'loan_repayment' and record_id = target_repayment_id;
end;
$$;

revoke all on function public.create_family_loan(uuid, text, uuid, numeric, date, text, text) from public;
revoke all on function public.family_member_shared_balance(uuid, uuid) from public;
revoke all on function public.respond_to_family_loan(uuid, text, boolean, text) from public;
revoke all on function public.create_family_loan_repayment(uuid, text, text, numeric, date, text, text, text, text) from public;
revoke all on function public.respond_to_family_loan_repayment(uuid, text, boolean, text, text, text) from public;
grant execute on function public.create_family_loan(uuid, text, uuid, numeric, date, text, text) to authenticated;
grant execute on function public.respond_to_family_loan(uuid, text, boolean, text) to authenticated;
grant execute on function public.create_family_loan_repayment(uuid, text, text, numeric, date, text, text, text, text) to authenticated;
grant execute on function public.respond_to_family_loan_repayment(uuid, text, boolean, text, text, text) to authenticated;
