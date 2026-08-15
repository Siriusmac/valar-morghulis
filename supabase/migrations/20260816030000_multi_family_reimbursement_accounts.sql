-- Aggiorna atomicamente le famiglie nelle quali un conto personale è
-- pubblicato come possibile destinazione di un rimborso.
create or replace function public.set_reimbursement_account_families(
  target_account_id text,
  target_display_name text,
  target_family_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_family_ids uuid[] := coalesce(target_family_ids, '{}'::uuid[]);
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;
  if nullif(btrim(target_account_id), '') is null
    or length(target_account_id) > 160
    or nullif(btrim(target_display_name), '') is null
    or length(btrim(target_display_name)) > 80 then
    raise exception 'invalid_reimbursement_account';
  end if;
  if not exists (
    select 1
    from public.user_app_data app_data
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(app_data.data -> 'accounts') = 'array'
          then app_data.data -> 'accounts'
        else '[]'::jsonb
      end
    ) account
    where app_data.user_id = current_user_id
      and account ->> 'id' = target_account_id
      and account ->> 'ownerId' = current_user_id::text
      and account ->> 'scope' = 'personal'
  ) then
    raise exception 'personal_account_not_owned';
  end if;
  if cardinality(selected_family_ids) > 100 then
    raise exception 'too_many_families';
  end if;
  if exists (
    select 1
    from unnest(selected_family_ids) selected(family_id)
    where not public.is_family_member(selected.family_id)
  ) then
    raise exception 'family_membership_required';
  end if;

  delete from public.family_reimbursement_accounts published
  where published.owner_id = current_user_id
    and published.account_id = target_account_id
    and not (published.family_id = any(selected_family_ids));

  insert into public.family_reimbursement_accounts (
    family_id, owner_id, account_id, display_name
  )
  select distinct
    selected.family_id,
    current_user_id,
    target_account_id,
    btrim(target_display_name)
  from unnest(selected_family_ids) selected(family_id)
  on conflict (family_id, owner_id, account_id)
  do update set display_name = excluded.display_name, updated_at = now();
end;
$$;

revoke all on function public.set_reimbursement_account_families(text, text, uuid[]) from public;
grant execute on function public.set_reimbursement_account_families(text, text, uuid[]) to authenticated;
