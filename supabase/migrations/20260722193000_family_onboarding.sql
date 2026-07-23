create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 80),
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  created_by uuid not null references public.profiles(id),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id),
  unique (user_id)
);

create table public.family_invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  email text not null,
  token uuid not null default gen_random_uuid() unique,
  role text not null default 'member' check (role = 'member'),
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (email = lower(trim(email)))
);

create unique index family_invitations_pending_email_idx
  on public.family_invitations (family_id, email)
  where accepted_at is null;
create index family_invitations_family_id_idx on public.family_invitations (family_id);
create index family_invitations_invited_by_idx on public.family_invitations (invited_by);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  institution text not null default '',
  account_type text not null check (account_type in ('bank', 'credit', 'cash', 'paypal')),
  scope text not null check (scope in ('family', 'personal')),
  opening_balance numeric(14, 2) not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope = 'family' and owner_id is null)
    or (scope = 'personal' and owner_id is not null)
  )
);

create index accounts_family_id_idx on public.accounts (family_id);
create index accounts_owner_id_idx on public.accounts (owner_id) where owner_id is not null;
create index accounts_created_by_idx on public.accounts (created_by);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger families_set_updated_at before update on public.families
for each row execute function public.set_updated_at();
create trigger accounts_set_updated_at before update on public.accounts
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    lower(new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_family_member(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members
    where family_id = target_family_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_family_admin(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members
    where family_id = target_family_id
      and user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

create or replace function public.create_family_with_optional_account(
  family_name text,
  shared_account_name text default null,
  shared_account_institution text default null,
  shared_account_type text default 'bank',
  shared_account_opening_balance numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_family_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;
  if exists (select 1 from public.family_members where user_id = current_user_id) then
    raise exception 'user_already_has_family';
  end if;
  if length(trim(family_name)) < 2 then
    raise exception 'invalid_family_name';
  end if;

  insert into public.families (name, created_by)
  values (trim(family_name), current_user_id)
  returning id into new_family_id;

  insert into public.family_members (family_id, user_id, role)
  values (new_family_id, current_user_id, 'admin');

  if nullif(trim(shared_account_name), '') is not null then
    insert into public.accounts (
      family_id, name, institution, account_type, scope, opening_balance, created_by
    ) values (
      new_family_id,
      trim(shared_account_name),
      coalesce(trim(shared_account_institution), ''),
      shared_account_type,
      'family',
      coalesce(shared_account_opening_balance, 0),
      current_user_id
    );
  end if;

  return new_family_id;
end;
$$;

create or replace function public.accept_family_invitation(invitation_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  invitation public.family_invitations%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;
  if exists (select 1 from public.family_members where user_id = current_user_id) then
    raise exception 'user_already_has_family';
  end if;

  select * into invitation
  from public.family_invitations
  where token = invitation_token
  for update;

  if invitation.id is null or invitation.accepted_at is not null or invitation.expires_at <= now() then
    raise exception 'invalid_or_expired_invitation';
  end if;
  if invitation.email <> current_email then
    raise exception 'invitation_email_mismatch';
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (invitation.family_id, current_user_id, invitation.role);

  update public.family_invitations
  set accepted_at = now()
  where id = invitation.id;

  return invitation.family_id;
end;
$$;

create or replace function public.complete_family_onboarding(target_family_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_family_admin(target_family_id) then
    raise exception 'admin_required';
  end if;
  update public.families set onboarding_completed = true where id = target_family_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invitations enable row level security;
alter table public.accounts enable row level security;

create policy profiles_read_family on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.family_members mine
    join public.family_members theirs on theirs.family_id = mine.family_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
  )
);
create policy profiles_update_self on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy families_read_members on public.families for select to authenticated
using ((select public.is_family_member(id)));
create policy families_update_admin on public.families for update to authenticated
using ((select public.is_family_admin(id))) with check ((select public.is_family_admin(id)));

create policy family_members_read_family on public.family_members for select to authenticated
using ((select public.is_family_member(family_id)));

create policy invitations_read_admin on public.family_invitations for select to authenticated
using ((select public.is_family_admin(family_id)));
create policy invitations_insert_admin on public.family_invitations for insert to authenticated
with check (
  (select public.is_family_admin(family_id))
  and invited_by = (select auth.uid())
);
create policy invitations_delete_admin on public.family_invitations for delete to authenticated
using ((select public.is_family_admin(family_id)) and accepted_at is null);

create policy accounts_read_scope on public.accounts for select to authenticated
using (
  (scope = 'personal' and owner_id = (select auth.uid()))
  or (scope = 'family' and (select public.is_family_member(family_id)))
);
create policy accounts_insert_scope on public.accounts for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (scope = 'personal' and owner_id = (select auth.uid()) and (select public.is_family_member(family_id)))
    or (scope = 'family' and (select public.is_family_member(family_id)))
  )
);
create policy accounts_update_scope on public.accounts for update to authenticated
using (
  (scope = 'personal' and owner_id = (select auth.uid()))
  or (scope = 'family' and (select public.is_family_member(family_id)))
) with check (
  (scope = 'personal' and owner_id = (select auth.uid()))
  or (scope = 'family' and (select public.is_family_member(family_id)))
);

revoke all on public.profiles, public.families, public.family_members, public.family_invitations, public.accounts from anon;
grant select, update on public.profiles to authenticated;
grant select, update on public.families to authenticated;
grant select on public.family_members to authenticated;
grant select, insert, delete on public.family_invitations to authenticated;
grant select, insert, update on public.accounts to authenticated;

revoke all on function public.is_family_member(uuid) from public;
revoke all on function public.is_family_admin(uuid) from public;
revoke all on function public.create_family_with_optional_account(text, text, text, text, numeric) from public;
revoke all on function public.accept_family_invitation(uuid) from public;
revoke all on function public.complete_family_onboarding(uuid) from public;
grant execute on function public.is_family_member(uuid) to authenticated;
grant execute on function public.is_family_admin(uuid) to authenticated;
grant execute on function public.create_family_with_optional_account(text, text, text, text, numeric) to authenticated;
grant execute on function public.accept_family_invitation(uuid) to authenticated;
grant execute on function public.complete_family_onboarding(uuid) to authenticated;
