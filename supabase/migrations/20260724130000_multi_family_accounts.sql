-- Un utente può appartenere a più famiglie, mantenendo un ruolo distinto in ciascuna.
alter table public.family_members
  drop constraint if exists family_members_user_id_key;

create index if not exists family_members_user_id_idx
  on public.family_members (user_id);

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
  if exists (
    select 1
    from public.family_members
    where family_id = invitation.family_id
      and user_id = current_user_id
  ) then
    raise exception 'user_already_in_family';
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (invitation.family_id, current_user_id, invitation.role);

  update public.family_invitations
  set accepted_at = now()
  where id = invitation.id;

  return invitation.family_id;
end;
$$;

-- Mantiene coerente l'email mostrata nell'app dopo una modifica in Supabase Auth.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
    set email = lower(new.email)
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
after update of email on auth.users
for each row execute function public.sync_profile_email();
