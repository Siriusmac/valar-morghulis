-- La tabella accounts usa UUID, mentre gli identificativi dei conti personali
-- restano testo nei record applicativi. Il confronto esplicito evita che la
-- validazione di una rettifica fallisca prima di verificare la proprieta.
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
        where account.id::text = target_selected_account_id
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

revoke all on function public.request_family_reimbursement_change(uuid, text, text, numeric, date, text) from public;
grant execute on function public.request_family_reimbursement_change(uuid, text, text, numeric, date, text) to authenticated;
