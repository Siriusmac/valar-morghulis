-- Elimina un conto familiare in modo atomico scegliendo se conservare,
-- eliminare o ricondurre a un altro conto tutte le operazioni collegate.
create or replace function public.jsonb_references_account(record_data jsonb, account_id text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(record_data ->> 'accountId' = account_id, false)
    or coalesce(record_data ->> 'welfareAccountId' = account_id, false)
    or coalesce(record_data ->> 'fromAccountId' = account_id, false)
    or coalesce(record_data ->> 'toAccountId' = account_id, false)
    or coalesce(record_data ->> 'lenderAccountId' = account_id, false)
    or coalesce(record_data ->> 'borrowerAccountId' = account_id, false);
$$;

create or replace function public.jsonb_replace_account_reference(record_data jsonb, account_id text, replacement_id text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  result jsonb := record_data;
  field_name text;
begin
  foreach field_name in array array['accountId', 'welfareAccountId', 'fromAccountId', 'toAccountId', 'lenderAccountId', 'borrowerAccountId'] loop
    if result ->> field_name = account_id then
      result := jsonb_set(result, array[field_name], to_jsonb(replacement_id), true);
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public.jsonb_transform_account_snapshot(snapshot_data jsonb, account_id text, movement_strategy text, replacement_id text default null)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  result jsonb := coalesce(snapshot_data, '{}'::jsonb);
  collection_name text;
  item jsonb;
  transformed jsonb;
  defaults jsonb := coalesce(snapshot_data -> 'defaultMovementAccountIds', '{}'::jsonb);
  default_key text;
  default_value text;
begin
  foreach collection_name in array array['movements', 'scheduledPayments', 'transfers', 'reimbursements', 'loans', 'loanRepayments'] loop
    transformed := '[]'::jsonb;
    for item in select value from jsonb_array_elements(coalesce(result -> collection_name, '[]'::jsonb)) loop
      if public.jsonb_references_account(item, account_id) then
        if movement_strategy = 'delete' then
          continue;
        elsif movement_strategy = 'reassign' then
          item := public.jsonb_replace_account_reference(item, account_id, replacement_id);
        end if;
      end if;
      transformed := transformed || jsonb_build_array(item);
    end loop;
    result := jsonb_set(result, array[collection_name], transformed, true);
  end loop;

  result := jsonb_set(result, '{accounts}', coalesce((
    select jsonb_agg(value)
    from jsonb_array_elements(coalesce(result -> 'accounts', '[]'::jsonb))
    where value ->> 'id' <> account_id
  ), '[]'::jsonb), true);

  for default_key, default_value in select key, value from jsonb_each_text(defaults) loop
    if default_value = account_id then
      if movement_strategy = 'reassign' then
        defaults := jsonb_set(defaults, array[default_key], to_jsonb(replacement_id), true);
      else
        defaults := defaults - default_key;
      end if;
    end if;
  end loop;
  return jsonb_set(result, '{defaultMovementAccountIds}', defaults, true);
end;
$$;

create or replace function public.delete_family_account(
  target_account_id uuid,
  movement_strategy text,
  replacement_account_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_family_id uuid;
  account_id_text text := target_account_id::text;
  replacement_id_text text := replacement_account_id::text;
begin
  select family_id into target_family_id
  from public.accounts
  where id = target_account_id and scope = 'family'
  for update;

  if target_family_id is null then raise exception 'family_account_not_found'; end if;
  if (select auth.uid()) is null or not public.is_family_admin(target_family_id) then
    raise exception 'family_admin_required';
  end if;
  if movement_strategy not in ('keep', 'delete', 'reassign') then
    raise exception 'invalid_account_movement_strategy';
  end if;

  if movement_strategy <> 'keep' and exists (
    select 1 from public.family_shared_records
    where family_id = target_family_id
      and public.jsonb_references_account(data, account_id_text)
      and (
        record_type in ('reimbursement', 'loan', 'loan_repayment')
        or (record_type in ('movement', 'scheduled_payment') and nullif(data ->> 'commissionedPurchaseId', '') is not null)
      )
  ) then
    raise exception 'account_has_reciprocal_operations';
  end if;

  if movement_strategy = 'reassign' then
    if replacement_account_id is null or replacement_account_id = target_account_id
      or not exists (
        select 1 from public.accounts
        where id = replacement_account_id and family_id = target_family_id and scope = 'family'
      ) then
      raise exception 'account_replacement_required';
    end if;
    if exists (
      select 1 from public.family_shared_records
      where family_id = target_family_id and record_type = 'transfer'
        and ((data ->> 'fromAccountId' = account_id_text and data ->> 'toAccountId' = replacement_id_text)
          or (data ->> 'toAccountId' = account_id_text and data ->> 'fromAccountId' = replacement_id_text))
    ) then
      raise exception 'account_replacement_creates_invalid_transfer';
    end if;
  end if;

  if movement_strategy = 'delete' then
    delete from public.family_shared_records
    where family_id = target_family_id
      and record_type in ('movement', 'scheduled_payment', 'transfer')
      and public.jsonb_references_account(data, account_id_text);
  elsif movement_strategy = 'reassign' then
    update public.family_shared_records
    set data = public.jsonb_replace_account_reference(data, account_id_text, replacement_id_text), updated_at = now()
    where family_id = target_family_id
      and record_type in ('movement', 'scheduled_payment', 'transfer', 'reimbursement', 'loan', 'loan_repayment')
      and public.jsonb_references_account(data, account_id_text);
  end if;

  update public.family_user_app_data
  set data = public.jsonb_transform_account_snapshot(data, account_id_text, movement_strategy, replacement_id_text)
  where family_id = target_family_id;

  delete from public.accounts where id = target_account_id and family_id = target_family_id;
end;
$$;

revoke all on function public.jsonb_references_account(jsonb, text) from public;
revoke all on function public.jsonb_replace_account_reference(jsonb, text, text) from public;
revoke all on function public.jsonb_transform_account_snapshot(jsonb, text, text, text) from public;
revoke all on function public.delete_family_account(uuid, text, uuid) from public;
grant execute on function public.delete_family_account(uuid, text, uuid) to authenticated;
