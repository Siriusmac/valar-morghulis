-- Deploy only with the v2 webapp. Old tabs/native clients must reload/upgrade.
-- No financial data is rewritten or deleted by this migration.
begin;

create function public.save_app_data_snapshot_v2(
  target_family_id uuid, personal_snapshot jsonb, family_snapshot jsonb,
  shared_records jsonb, owned_keys jsonb, expected_personal_revision bigint,
  expected_family_revision bigint, client_mutation_id uuid
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_optional_mfa();
  return public.save_app_data_snapshot(target_family_id, personal_snapshot,
    family_snapshot, shared_records, owned_keys, expected_personal_revision,
    expected_family_revision, client_mutation_id);
end;
$$;
revoke all on function public.save_app_data_snapshot_v2(uuid,jsonb,jsonb,jsonb,jsonb,bigint,bigint,uuid) from public, anon;
grant execute on function public.save_app_data_snapshot_v2(uuid,jsonb,jsonb,jsonb,jsonb,bigint,bigint,uuid) to authenticated;

-- Only the SECURITY DEFINER transaction may replace a snapshot or shared list.
revoke insert, update, delete on public.user_app_data, public.family_user_app_data from public, authenticated, anon;
revoke execute on function public.save_app_data_snapshot(uuid,jsonb,jsonb,jsonb,jsonb,bigint,bigint,uuid) from public, authenticated, anon;
revoke execute on function public.sync_family_shared_records(uuid,jsonb,jsonb) from public, authenticated, anon;

notify pgrst, 'reload schema';
commit;
