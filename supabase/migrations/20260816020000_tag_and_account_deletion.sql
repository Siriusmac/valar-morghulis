-- Completa la parità delle directory consentendo il redirect dei tag e abilita
-- l'eliminazione dei conti familiari soltanto agli amministratori.
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
  if target_record_type not in ('category', 'beneficiary', 'sender', 'tag')
    or nullif(target_record_id, '') is null then
    raise exception 'invalid_directory_record';
  end if;
  if target_record_type = 'tag' and replacement_record_id is not null then
    raise exception 'invalid_directory_replacement';
  end if;
  if replacement_record_id = target_record_id then
    raise exception 'invalid_directory_replacement';
  end if;
  if replacement_record_id is not null and not exists (
    select 1
    from public.family_shared_records
    where family_id = target_family_id
      and record_type = target_record_type
      and record_id = replacement_record_id
  ) then
    raise exception 'directory_replacement_not_found';
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

drop policy if exists accounts_delete_scope on public.accounts;
create policy accounts_delete_scope on public.accounts for delete to authenticated
using (
  (scope = 'personal' and owner_id = (select auth.uid()))
  or (scope = 'family' and (select public.is_family_admin(family_id)))
);

grant delete on public.accounts to authenticated;
