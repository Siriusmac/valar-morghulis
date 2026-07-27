alter table public.family_invitations
  add column declined_at timestamptz;

alter table public.family_invitations
  add constraint family_invitations_single_resolution
  check (accepted_at is null or declined_at is null);

create or replace function public.accept_family_invitation(invitation_token uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  invitation public.family_invitations%rowtype;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;

  select * into invitation
  from public.family_invitations
  where token = invitation_token
  for update;

  if invitation.id is null or invitation.accepted_at is not null or invitation.expires_at <= now() then
    raise exception 'invalid_or_expired_invitation';
  end if;
  if invitation.declined_at is not null then raise exception 'invitation_declined'; end if;
  if invitation.email <> current_email then raise exception 'invitation_email_mismatch'; end if;
  if exists (
    select 1 from public.family_members
    where family_id = invitation.family_id and user_id = current_user_id
  ) then
    raise exception 'user_already_in_family';
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (invitation.family_id, current_user_id, invitation.role);

  update public.family_invitations
  set accepted_at = now()
  where id = invitation.id;
  update public.profiles set onboarding_completed = true where id = current_user_id;

  return invitation.family_id;
end;
$$;

create or replace function public.decline_family_invitation(invitation_token uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  invitation public.family_invitations%rowtype;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;

  select * into invitation
  from public.family_invitations
  where token = invitation_token
  for update;

  if invitation.id is null or invitation.accepted_at is not null or invitation.expires_at <= now() then
    raise exception 'invalid_or_expired_invitation';
  end if;
  if invitation.declined_at is not null then raise exception 'invitation_already_declined'; end if;
  if invitation.email <> current_email then raise exception 'invitation_email_mismatch'; end if;

  update public.family_invitations
  set declined_at = now()
  where id = invitation.id;
  update public.profiles set onboarding_completed = true where id = current_user_id;
end;
$$;

create or replace function public.delete_declined_family_invitation(target_invitation_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  invitation_family_id uuid;
begin
  select family_id into invitation_family_id
  from public.family_invitations
  where id = target_invitation_id
    and accepted_at is null
    and declined_at is not null;

  if invitation_family_id is null then raise exception 'declined_invitation_not_found'; end if;
  if not public.is_family_admin(invitation_family_id) then raise exception 'admin_required'; end if;

  delete from public.family_invitations where id = target_invitation_id;
end;
$$;

revoke all on function public.accept_family_invitation(uuid) from public;
revoke all on function public.decline_family_invitation(uuid) from public;
revoke all on function public.delete_declined_family_invitation(uuid) from public;
grant execute on function public.accept_family_invitation(uuid) to authenticated;
grant execute on function public.decline_family_invitation(uuid) to authenticated;
grant execute on function public.delete_declined_family_invitation(uuid) to authenticated;
