-- Contact invitations never grant family access. Family admission now requires
-- recipient consent followed by an authenticated administrator's decision.
-- Existing memberships are not changed by this migration.
alter table public.family_invitations
  add column requested_at timestamptz,
  add column requested_by uuid references public.profiles(id) on delete cascade,
  add column reviewed_by uuid references public.profiles(id) on delete set null,
  add column reviewed_at timestamptz,
  add constraint family_invitation_request_pair
    check ((requested_at is null) = (requested_by is null));

drop policy invitations_insert_admin on public.family_invitations;
create policy invitations_insert_admin on public.family_invitations
for insert to authenticated with check (
  (select public.is_family_admin(family_id))
  and invited_by = (select auth.uid())
  and requested_at is null and requested_by is null
  and reviewed_at is null and reviewed_by is null
  and accepted_at is null and declined_at is null
);

create or replace function public.accept_family_invitation(invitation_token uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  invitation public.family_invitations%rowtype;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  select * into invitation from public.family_invitations
    where token = invitation_token for update;
  if invitation.id is null or invitation.accepted_at is not null
    or invitation.expires_at <= now() then
    raise exception 'invalid_or_expired_invitation';
  end if;
  if invitation.declined_at is not null then raise exception 'invitation_declined'; end if;
  if invitation.email <> current_email then raise exception 'invitation_email_mismatch'; end if;
  if exists (select 1 from public.family_members
    where family_id = invitation.family_id and user_id = current_user_id) then
    raise exception 'user_already_in_family';
  end if;
  if invitation.requested_by is not null and invitation.requested_by <> current_user_id then
    raise exception 'invitation_email_mismatch';
  end if;
  update public.family_invitations
    set requested_at = coalesce(requested_at, now()), requested_by = current_user_id
    where id = invitation.id;
  update public.profiles set onboarding_completed = true where id = current_user_id;
  -- Null deliberately prevents old clients from switching into a family
  -- before access has actually been granted. Repeated consent is idempotent.
  return null;
end;
$$;

create or replace function public.review_family_admission(
  target_invitation_id uuid, approve boolean
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  invitation public.family_invitations%rowtype;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  if approve is null then raise exception 'invalid_request'; end if;
  select * into invitation from public.family_invitations
    where id = target_invitation_id for update;
  if invitation.id is null then raise exception 'invitation_not_found'; end if;
  if not public.is_family_admin(invitation.family_id) then raise exception 'admin_required'; end if;
  if invitation.accepted_at is not null or invitation.declined_at is not null then
    raise exception 'invitation_already_resolved';
  end if;
  if invitation.requested_by is null then raise exception 'recipient_consent_required'; end if;
  if invitation.requested_by = current_user_id then raise exception 'cannot_approve_self'; end if;
  if approve then
    if invitation.expires_at <= now() then raise exception 'invalid_or_expired_invitation'; end if;
    -- Do not grant membership if the consenting account has changed email.
    if not exists (select 1 from auth.users where id = invitation.requested_by
      and lower(email) = invitation.email and email_confirmed_at is not null) then
      raise exception 'invitation_email_mismatch';
    end if;
    insert into public.family_members (family_id, user_id, role)
      values (invitation.family_id, invitation.requested_by, 'member');
  end if;
  update public.family_invitations set
    accepted_at = case when approve then now() else null end,
    declined_at = case when approve then null else now() end,
    reviewed_at = now(), reviewed_by = current_user_id
    where id = invitation.id;
end;
$$;

-- Resending an invitation invalidates any consent attached to its old token,
-- including resends from a previously deployed Edge Function.
create function public.reset_family_invitation_consent()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.token is distinct from old.token then
    new.requested_at := null;
    new.requested_by := null;
    new.reviewed_at := null;
    new.reviewed_by := null;
  end if;
  return new;
end;
$$;
create trigger reset_family_invitation_consent before update of token
  on public.family_invitations for each row
  execute function public.reset_family_invitation_consent();

revoke all on function public.reset_family_invitation_consent() from public;
revoke all on function public.accept_family_invitation(uuid) from public, anon;
revoke all on function public.review_family_admission(uuid, boolean) from public, anon;
grant execute on function public.accept_family_invitation(uuid) to authenticated;
grant execute on function public.review_family_admission(uuid, boolean) to authenticated;
