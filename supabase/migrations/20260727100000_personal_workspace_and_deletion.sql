create table public.user_app_data (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_app_data_set_updated_at before update on public.user_app_data
for each row execute function public.set_updated_at();

alter table public.user_app_data enable row level security;
create policy user_app_data_read_own on public.user_app_data for select to authenticated
using (user_id = (select auth.uid()));
create policy user_app_data_insert_own on public.user_app_data for insert to authenticated
with check (user_id = (select auth.uid()));
create policy user_app_data_update_own on public.user_app_data for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.user_app_data from anon;
grant select, insert, update on public.user_app_data to authenticated;

alter table public.profiles add column onboarding_completed boolean not null default false;
update public.profiles profile set onboarding_completed = true
where exists (select 1 from public.family_members member where member.user_id = profile.id);

create or replace function public.complete_personal_onboarding()
returns void language sql security definer set search_path = ''
as $$
  update public.profiles set onboarding_completed = true where id = (select auth.uid());
$$;
revoke all on function public.complete_personal_onboarding() from public;
grant execute on function public.complete_personal_onboarding() to authenticated;

with latest as (
  select distinct on (source.user_id) source.user_id, source.family_id, source.data
  from public.family_user_app_data source
  order by source.user_id, source.updated_at desc
)
insert into public.user_app_data (user_id, data)
select latest.user_id, latest.data || jsonb_build_object(
  'accounts', coalesce((
    select jsonb_agg(item) from jsonb_array_elements(coalesce(latest.data -> 'accounts', '[]'::jsonb)) item
    where item ->> 'scope' = 'personal' and item ->> 'ownerId' = latest.user_id::text
  ), '[]'::jsonb),
  'categories', coalesce((
    select jsonb_agg(item) from jsonb_array_elements(coalesce(latest.data -> 'categories', '[]'::jsonb)) item
    where item ->> 'scope' = 'personal' and item ->> 'ownerId' = latest.user_id::text
  ), '[]'::jsonb),
  'beneficiaries', coalesce((
    select jsonb_agg(item) from jsonb_array_elements(coalesce(latest.data -> 'beneficiaries', '[]'::jsonb)) item
    where item ->> 'scope' = 'personal' and item ->> 'ownerId' = latest.user_id::text
  ), '[]'::jsonb),
  'tags', coalesce((
    select jsonb_agg(item) from jsonb_array_elements(coalesce(latest.data -> 'tags', '[]'::jsonb)) item
    where item ->> 'scope' = 'personal' and item ->> 'ownerId' = latest.user_id::text
  ), '[]'::jsonb),
  'movements', coalesce((
    select jsonb_agg(item) from jsonb_array_elements(coalesce(latest.data -> 'movements', '[]'::jsonb)) item
    where item ->> 'authorId' = latest.user_id::text
      and not coalesce((item ->> 'shared')::boolean, false)
      and not exists (
        select 1 from jsonb_array_elements(coalesce(item -> 'splits', '[]'::jsonb)) split
        where coalesce((split ->> 'shared')::boolean, false)
      )
  ), '[]'::jsonb),
  'scheduledPayments', coalesce((
    select jsonb_agg(item) from jsonb_array_elements(coalesce(latest.data -> 'scheduledPayments', '[]'::jsonb)) item
    where item ->> 'authorId' = latest.user_id::text and not coalesce((item ->> 'shared')::boolean, false)
  ), '[]'::jsonb),
  'transfers', coalesce((
    select jsonb_agg(item) from jsonb_array_elements(coalesce(latest.data -> 'transfers', '[]'::jsonb)) item
    where item ->> 'authorId' = latest.user_id::text
      and not exists (
        select 1 from public.accounts account
        where account.family_id = latest.family_id and account.scope = 'family'
          and account.id::text in (item ->> 'fromAccountId', item ->> 'toAccountId')
      )
  ), '[]'::jsonb),
  'reimbursements', '[]'::jsonb
)
from latest
on conflict (user_id) do nothing;

create or replace function public.create_family_with_optional_account(
  family_name text,
  shared_account_name text default null,
  shared_account_institution text default null,
  shared_account_type text default 'bank',
  shared_account_opening_balance numeric default 0
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_family_id uuid;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  if length(trim(family_name)) < 2 then raise exception 'invalid_family_name'; end if;
  insert into public.families (name, created_by) values (trim(family_name), current_user_id)
  returning id into new_family_id;
  insert into public.family_members (family_id, user_id, role) values (new_family_id, current_user_id, 'admin');
  update public.profiles set onboarding_completed = true where id = current_user_id;
  if nullif(trim(shared_account_name), '') is not null then
    insert into public.accounts (family_id, name, institution, account_type, scope, opening_balance, created_by)
    values (new_family_id, trim(shared_account_name), coalesce(trim(shared_account_institution), ''),
      shared_account_type, 'family', coalesce(shared_account_opening_balance, 0), current_user_id);
  end if;
  return new_family_id;
end;
$$;

create or replace function public.accept_family_invitation(invitation_token uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  invitation public.family_invitations%rowtype;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  select * into invitation from public.family_invitations where token = invitation_token for update;
  if invitation.id is null or invitation.accepted_at is not null or invitation.expires_at <= now() then
    raise exception 'invalid_or_expired_invitation';
  end if;
  if invitation.email <> current_email then raise exception 'invitation_email_mismatch'; end if;
  if exists (select 1 from public.family_members where family_id = invitation.family_id and user_id = current_user_id) then
    raise exception 'user_already_in_family';
  end if;
  insert into public.family_members (family_id, user_id, role)
  values (invitation.family_id, current_user_id, invitation.role);
  update public.family_invitations set accepted_at = now() where id = invitation.id;
  update public.profiles set onboarding_completed = true where id = current_user_id;
  return invitation.family_id;
end;
$$;

create or replace function public.jsonb_upsert_by_id(items jsonb, item jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_agg(value), '[]'::jsonb) || jsonb_build_array(item)
  from jsonb_array_elements(coalesce(items, '[]'::jsonb))
  where value ->> 'id' is distinct from item ->> 'id';
$$;
revoke all on function public.jsonb_upsert_by_id(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.archive_family_authored_data(target_family_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  member_row record;
  shared_row record;
  personal jsonb;
  family_private jsonb;
  item jsonb;
  directory_item jsonb;
  cash_account_id text;
  family_account_ids text[];
begin
  select coalesce(array_agg(id::text), array[]::text[]) into family_account_ids
  from public.accounts where family_id = target_family_id and scope = 'family';
  for member_row in select user_id from public.family_members where family_id = target_family_id loop
    select data into personal from public.user_app_data where user_id = member_row.user_id;
    personal := coalesce(personal, jsonb_build_object(
      'version', 3, 'accounts', '[]'::jsonb, 'categories', '[]'::jsonb,
      'beneficiaries', '[]'::jsonb, 'tags', '[]'::jsonb, 'tagReportIds', '[]'::jsonb,
      'movements', '[]'::jsonb, 'scheduledPayments', '[]'::jsonb,
      'transfers', '[]'::jsonb, 'reimbursements', '[]'::jsonb
    ));
    cash_account_id := (
      select value ->> 'id' from jsonb_array_elements(coalesce(personal -> 'accounts', '[]'::jsonb))
      where value ->> 'ownerId' = member_row.user_id::text
      order by case when value ->> 'type' = 'cash' then 0 else 1 end limit 1
    );
    if cash_account_id is null then
      cash_account_id := member_row.user_id::text || '-cash';
      personal := jsonb_set(personal, '{accounts}', public.jsonb_upsert_by_id(
        personal -> 'accounts', jsonb_build_object(
          'id', cash_account_id, 'ownerId', member_row.user_id::text, 'name', 'Contanti',
          'institution', 'Portafoglio', 'type', 'cash', 'scope', 'personal', 'openingBalance', 0
        )));
    end if;
    for shared_row in
      select record_type, data from public.family_shared_records
      where family_id = target_family_id and created_by = member_row.user_id
        and record_type in ('movement', 'scheduled_payment')
    loop
      item := shared_row.data || jsonb_build_object(
        'authorId', member_row.user_id::text, 'memberId', member_row.user_id::text, 'shared', false
      );
      if item ->> 'accountId' = any(family_account_ids) then
        item := item || jsonb_build_object('accountId', cash_account_id, 'affectsAccountBalance', false);
      end if;
      if item -> 'splits' is not null then
        item := jsonb_set(item, '{splits}', coalesce((
          select jsonb_agg(value || jsonb_build_object('shared', false))
          from jsonb_array_elements(item -> 'splits')
        ), '[]'::jsonb));
      end if;
      if shared_row.record_type = 'movement' then
        personal := jsonb_set(personal, '{movements}', public.jsonb_upsert_by_id(personal -> 'movements', item));
      else
        personal := jsonb_set(personal, '{scheduledPayments}', public.jsonb_upsert_by_id(personal -> 'scheduledPayments', item));
      end if;
    end loop;
    select data into family_private from public.family_user_app_data
    where family_id = target_family_id and user_id = member_row.user_id;
    for item in
      select value from jsonb_array_elements(coalesce(family_private -> 'movements', '[]'::jsonb))
    loop
      item := item || jsonb_build_object(
        'authorId', member_row.user_id::text, 'memberId', member_row.user_id::text, 'shared', false
      );
      if item ->> 'accountId' = any(family_account_ids) then
        item := item || jsonb_build_object('accountId', cash_account_id, 'affectsAccountBalance', false);
      end if;
      if item -> 'splits' is not null then
        item := jsonb_set(item, '{splits}', coalesce((
          select jsonb_agg(value || jsonb_build_object('shared', false))
          from jsonb_array_elements(item -> 'splits')
        ), '[]'::jsonb));
      end if;
      personal := jsonb_set(personal, '{movements}', public.jsonb_upsert_by_id(personal -> 'movements', item));
    end loop;
    for item in
      select value from jsonb_array_elements(coalesce(family_private -> 'scheduledPayments', '[]'::jsonb))
    loop
      item := item || jsonb_build_object(
        'authorId', member_row.user_id::text, 'memberId', member_row.user_id::text, 'shared', false
      );
      if item ->> 'accountId' = any(family_account_ids) then
        item := item || jsonb_build_object('accountId', cash_account_id, 'affectsAccountBalance', false);
      end if;
      personal := jsonb_set(personal, '{scheduledPayments}', public.jsonb_upsert_by_id(personal -> 'scheduledPayments', item));
    end loop;
    for shared_row in
      select record_type, data from public.family_shared_records
      where family_id = target_family_id and record_type in ('category', 'beneficiary', 'tag')
    loop
      directory_item := shared_row.data || jsonb_build_object('scope', 'personal', 'ownerId', member_row.user_id::text);
      if shared_row.record_type = 'category' then
        personal := jsonb_set(personal, '{categories}', public.jsonb_upsert_by_id(personal -> 'categories', directory_item));
      elsif shared_row.record_type = 'beneficiary' then
        personal := jsonb_set(personal, '{beneficiaries}', public.jsonb_upsert_by_id(personal -> 'beneficiaries', directory_item));
      else
        personal := jsonb_set(personal, '{tags}', public.jsonb_upsert_by_id(personal -> 'tags', directory_item));
      end if;
    end loop;
    insert into public.user_app_data (user_id, data) values (member_row.user_id, personal)
    on conflict (user_id) do update set data = excluded.data, updated_at = now();
  end loop;
end;
$$;
revoke all on function public.archive_family_authored_data(uuid) from public, anon, authenticated;

create or replace function public.delete_family(target_family_id uuid, preserve_authored_data boolean default false)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_family_admin(target_family_id) then raise exception 'admin_required'; end if;
  if preserve_authored_data then perform public.archive_family_authored_data(target_family_id); end if;
  delete from public.families where id = target_family_id;
end;
$$;
revoke all on function public.delete_family(uuid, boolean) from public;
grant execute on function public.delete_family(uuid, boolean) to authenticated;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  family_row record;
  successor_id uuid;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  delete from public.family_invitations where invited_by = current_user_id;
  for family_row in select id from public.families where created_by = current_user_id loop
    select user_id into successor_id from public.family_members
    where family_id = family_row.id and user_id <> current_user_id
    order by case when role = 'admin' then 0 else 1 end, joined_at limit 1;
    if successor_id is null then
      delete from public.families where id = family_row.id;
    else
      update public.family_members set role = 'admin'
      where family_id = family_row.id and user_id = successor_id;
      update public.families set created_by = successor_id where id = family_row.id;
      update public.accounts set created_by = successor_id
      where family_id = family_row.id and scope = 'family' and created_by = current_user_id;
    end if;
  end loop;
  update public.accounts account set created_by = family.created_by
  from public.families family
  where account.family_id = family.id and account.scope = 'family' and account.created_by = current_user_id;
  delete from auth.users where id = current_user_id;
end;
$$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
