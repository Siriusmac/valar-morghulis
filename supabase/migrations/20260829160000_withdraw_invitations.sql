create or replace function public.withdraw_family_invitation(target_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_family_id uuid;
begin
  select family_id into invitation_family_id
  from public.family_invitations
  where id = target_invitation_id
    and accepted_at is null
    and declined_at is null
  for update;

  if invitation_family_id is null then raise exception 'invitation_not_available'; end if;
  if not public.is_family_admin(invitation_family_id) then raise exception 'admin_required'; end if;

  delete from public.family_invitations where id = target_invitation_id;
end;
$$;

create or replace function public.withdraw_contact_invitation(target_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invitation_owner_id uuid;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;

  select invited_by into invitation_owner_id
  from public.contact_invitations
  where id = target_invitation_id
    and accepted_at is null
    and declined_at is null
  for update;

  if invitation_owner_id is null then raise exception 'invitation_not_available'; end if;
  if invitation_owner_id <> current_user_id then raise exception 'invitation_owner_required'; end if;

  -- Una richiesta senza più invito non avrebbe un destinatario. Il movimento
  -- del pagante resta invece conservato nella sua contabilità personale.
  delete from public.commissioned_purchases
  where invitation_id = target_invitation_id
    and recipient_id is null
    and status = 'pending';

  if exists (
    select 1 from public.commissioned_purchases
    where invitation_id = target_invitation_id
  ) then
    raise exception 'invitation_has_resolved_purchases';
  end if;

  delete from public.contact_invitations where id = target_invitation_id;
end;
$$;

revoke all on function public.withdraw_family_invitation(uuid) from public;
revoke all on function public.withdraw_contact_invitation(uuid) from public;
grant execute on function public.withdraw_family_invitation(uuid) to authenticated;
grant execute on function public.withdraw_contact_invitation(uuid) to authenticated;

comment on function public.withdraw_family_invitation(uuid) is
  'Revoca un invito familiare non risolto se l’utente corrente amministra la famiglia.';
comment on function public.withdraw_contact_invitation(uuid) is
  'Revoca un invito a un contatto e annulla le richieste pendenti ancora prive di destinatario.';
