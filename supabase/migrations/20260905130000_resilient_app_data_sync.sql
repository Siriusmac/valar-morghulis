-- Rende atomico e verificabile il salvataggio degli snapshot della webapp.
-- Le revisioni vengono incrementate anche dai client precedenti che continuano
-- a usare gli upsert diretti, mantenendo compatibile il client Apple.
alter table public.user_app_data
  add column if not exists revision bigint not null default 0;

alter table public.family_user_app_data
  add column if not exists revision bigint not null default 0;

create or replace function public.bump_app_data_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;

drop trigger if exists user_app_data_bump_revision on public.user_app_data;
create trigger user_app_data_bump_revision
before update on public.user_app_data
for each row execute function public.bump_app_data_revision();

drop trigger if exists family_user_app_data_bump_revision on public.family_user_app_data;
create trigger family_user_app_data_bump_revision
before update on public.family_user_app_data
for each row execute function public.bump_app_data_revision();

create table if not exists public.app_data_sync_mutations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  mutation_id uuid not null,
  family_id uuid references public.families(id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, mutation_id)
);

create index if not exists app_data_sync_mutations_created_at_idx
  on public.app_data_sync_mutations (created_at);

alter table public.app_data_sync_mutations enable row level security;
revoke all on public.app_data_sync_mutations from anon, authenticated;

create or replace function public.save_app_data_snapshot(
  target_family_id uuid,
  personal_snapshot jsonb,
  family_snapshot jsonb,
  shared_records jsonb,
  owned_keys jsonb,
  expected_personal_revision bigint,
  expected_family_revision bigint,
  client_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_personal_revision bigint;
  current_family_revision bigint;
  next_personal_revision bigint;
  next_family_revision bigint;
  previous_result jsonb;
  sync_result jsonb;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  if client_mutation_id is null then raise exception 'sync_mutation_id_required'; end if;
  if expected_personal_revision is null or expected_family_revision is null then
    raise exception 'sync_revision_required';
  end if;
  if jsonb_typeof(coalesce(personal_snapshot, 'null'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(family_snapshot, 'null'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(shared_records, 'null'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(owned_keys, 'null'::jsonb)) <> 'array' then
    raise exception 'invalid_app_data_snapshot';
  end if;
  if target_family_id is not null and not public.is_family_member(target_family_id) then
    raise exception 'family_membership_required';
  end if;

  -- Due retry simultanei con lo stesso UUID attendono la medesima transazione:
  -- il secondo riceve il risultato già registrato invece di duplicare il write.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text || ':' || client_mutation_id::text, 0)
  );

  select mutation.result into previous_result
  from public.app_data_sync_mutations mutation
  where mutation.user_id = current_user_id
    and mutation.mutation_id = client_mutation_id;
  if previous_result is not null then return previous_result; end if;

  insert into public.user_app_data (user_id, data)
  values (current_user_id, '{}'::jsonb)
  on conflict (user_id) do nothing;

  select revision into current_personal_revision
  from public.user_app_data
  where user_id = current_user_id
  for update;

  if current_personal_revision <> expected_personal_revision then
    raise exception 'app_data_revision_conflict';
  end if;

  if target_family_id is not null then
    insert into public.family_user_app_data (family_id, user_id, data)
    values (target_family_id, current_user_id, '{}'::jsonb)
    on conflict (family_id, user_id) do nothing;

    select revision into current_family_revision
    from public.family_user_app_data
    where family_id = target_family_id and user_id = current_user_id
    for update;

    if current_family_revision <> expected_family_revision then
      raise exception 'app_data_revision_conflict';
    end if;
  end if;

  update public.user_app_data
  set data = personal_snapshot
  where user_id = current_user_id
  returning revision into next_personal_revision;

  if target_family_id is not null then
    update public.family_user_app_data
    set data = family_snapshot
    where family_id = target_family_id and user_id = current_user_id
    returning revision into next_family_revision;

    perform public.sync_family_shared_records(target_family_id, shared_records, owned_keys);
  end if;

  sync_result := jsonb_build_object(
    'personalRevision', next_personal_revision,
    'familyRevision', next_family_revision
  );

  insert into public.app_data_sync_mutations (user_id, mutation_id, family_id, result)
  values (current_user_id, client_mutation_id, target_family_id, sync_result);

  delete from public.app_data_sync_mutations
  where user_id = current_user_id
    and created_at < now() - interval '30 days';

  return sync_result;
end;
$$;

revoke all on function public.save_app_data_snapshot(uuid, jsonb, jsonb, jsonb, jsonb, bigint, bigint, uuid) from public;
grant execute on function public.save_app_data_snapshot(uuid, jsonb, jsonb, jsonb, jsonb, bigint, bigint, uuid) to authenticated;
