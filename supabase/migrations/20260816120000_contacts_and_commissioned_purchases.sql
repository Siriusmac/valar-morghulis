create table public.contact_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  invited_by uuid not null references public.profiles(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  declined_at timestamptz,
  check (accepted_at is null or declined_at is null)
);

create unique index contact_invitations_pending_idx
  on public.contact_invitations (invited_by, email)
  where accepted_at is null and declined_at is null;
create index contact_invitations_inviter_idx
  on public.contact_invitations (invited_by, created_at desc);
create index contact_invitations_email_idx on public.contact_invitations (email);

create table public.contact_links (
  user_id_a uuid not null references public.profiles(id) on delete cascade,
  user_id_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id_a, user_id_b),
  check (user_id_a < user_id_b)
);
create index contact_links_user_b_idx on public.contact_links (user_id_b, user_id_a);

create table public.commissioned_purchases (
  id text primary key,
  payer_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete set null,
  invitation_id uuid references public.contact_invitations(id) on delete set null,
  family_id uuid references public.families(id) on delete set null,
  reimbursement_id text,
  payer_movement_id text not null,
  amount numeric(14,2) not null check (amount > 0),
  purchase_date date not null,
  description text not null check (char_length(trim(description)) between 1 and 240),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  recipient_movement_id text,
  recipient_category_id text,
  recipient_account_id text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (recipient_id is not null or invitation_id is not null)
);
create index commissioned_purchases_payer_idx on public.commissioned_purchases (payer_id, created_at desc);
create index commissioned_purchases_recipient_idx on public.commissioned_purchases (recipient_id, created_at desc);
create index commissioned_purchases_invitation_idx on public.commissioned_purchases (invitation_id)
  where invitation_id is not null;
create index commissioned_purchases_pending_recipient_idx
  on public.commissioned_purchases (recipient_id, created_at desc) where status = 'pending';
create unique index commissioned_purchases_reimbursement_idx
  on public.commissioned_purchases (family_id, reimbursement_id)
  where family_id is not null and reimbursement_id is not null;
create unique index commissioned_purchases_payer_movement_idx
  on public.commissioned_purchases (payer_id, payer_movement_id);

alter table public.contact_invitations enable row level security;
alter table public.contact_links enable row level security;
alter table public.commissioned_purchases enable row level security;

create policy contact_invitations_read_own on public.contact_invitations
  for select to authenticated using (invited_by = (select auth.uid()));
create policy contact_invitations_insert_own on public.contact_invitations
  for insert to authenticated with check (invited_by = (select auth.uid()));
create policy contact_invitations_delete_own on public.contact_invitations
  for delete to authenticated using (invited_by = (select auth.uid()));

create policy contact_links_read_participant on public.contact_links
  for select to authenticated using ((select auth.uid()) in (user_id_a, user_id_b));

create policy commissioned_purchases_read_participant on public.commissioned_purchases
  for select to authenticated using (
    payer_id = (select auth.uid()) or recipient_id = (select auth.uid())
  );

create policy profiles_read_contacts on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.contact_links link
      where (link.user_id_a = (select auth.uid()) and link.user_id_b = profiles.id)
         or (link.user_id_b = (select auth.uid()) and link.user_id_a = profiles.id)
    )
  );

create or replace function public.accept_contact_invitation(invitation_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text;
  invitation public.contact_invitations%rowtype;
  first_user uuid;
  second_user uuid;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  select lower(email) into current_email from public.profiles where id = current_user_id;
  select * into invitation from public.contact_invitations
    where token = invitation_token for update;
  if invitation.id is null then raise exception 'invitation_not_found'; end if;
  if invitation.accepted_at is not null or invitation.declined_at is not null then
    raise exception 'invitation_already_resolved';
  end if;
  if invitation.expires_at <= now() then raise exception 'invitation_expired'; end if;
  if invitation.email <> current_email then raise exception 'invitation_email_mismatch'; end if;
  if invitation.invited_by = current_user_id then raise exception 'cannot_add_self'; end if;

  first_user := least(invitation.invited_by, current_user_id);
  second_user := greatest(invitation.invited_by, current_user_id);
  insert into public.contact_links (user_id_a, user_id_b)
    values (first_user, second_user) on conflict do nothing;
  update public.contact_invitations set accepted_at = now() where id = invitation.id;
  update public.commissioned_purchases
    set recipient_id = current_user_id
    where invitation_id = invitation.id and recipient_id is null;
  return invitation.invited_by;
end;
$$;

create or replace function public.decline_contact_invitation(invitation_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  select lower(email) into current_email from public.profiles where id = current_user_id;
  update public.contact_invitations
    set declined_at = now()
    where token = invitation_token and email = current_email
      and accepted_at is null and declined_at is null and expires_at > now();
  if not found then raise exception 'invitation_not_available'; end if;
end;
$$;

create or replace function public.remove_contact(target_contact_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.contact_links
  where user_id_a = least((select auth.uid()), target_contact_id)
    and user_id_b = greatest((select auth.uid()), target_contact_id);
$$;

create or replace function public.create_commissioned_purchase(
  purchase_id text,
  target_recipient_id uuid,
  target_invitation_id uuid,
  target_family_id uuid,
  target_reimbursement_id text,
  target_payer_movement_id text,
  purchase_amount numeric,
  target_purchase_date date,
  purchase_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  allowed boolean := false;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  if target_recipient_id = current_user_id then raise exception 'cannot_purchase_for_self'; end if;
  if (target_family_id is null) <> (target_reimbursement_id is null) then
    raise exception 'invalid_reimbursement_link';
  end if;
  if purchase_amount <= 0 or char_length(trim(purchase_description)) not between 1 and 240 then
    raise exception 'invalid_purchase';
  end if;

  if target_recipient_id is not null then
    allowed := exists (
      select 1 from public.contact_links link
      where link.user_id_a = least(current_user_id, target_recipient_id)
        and link.user_id_b = greatest(current_user_id, target_recipient_id)
    ) or exists (
      select 1 from public.family_members mine
      join public.family_members theirs on theirs.family_id = mine.family_id
      where mine.user_id = current_user_id and theirs.user_id = target_recipient_id
        and (target_family_id is null or mine.family_id = target_family_id)
    );
  elsif target_invitation_id is not null then
    allowed := exists (
      select 1 from public.contact_invitations invitation
      where invitation.id = target_invitation_id and invitation.invited_by = current_user_id
        and invitation.accepted_at is null and invitation.declined_at is null
        and invitation.expires_at > now()
    );
  end if;
  if not allowed then raise exception 'contact_or_family_member_required'; end if;

  insert into public.commissioned_purchases (
    id, payer_id, recipient_id, invitation_id, family_id, reimbursement_id,
    payer_movement_id, amount, purchase_date, description
  ) values (
    purchase_id, current_user_id, target_recipient_id, target_invitation_id,
    target_family_id, target_reimbursement_id, target_payer_movement_id,
    purchase_amount, target_purchase_date, trim(purchase_description)
  );
end;
$$;

create or replace function public.respond_to_commissioned_purchase(
  target_purchase_id text,
  accept_purchase boolean,
  target_recipient_movement_id text default null,
  target_category_id text default null,
  target_account_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  purchase public.commissioned_purchases%rowtype;
  reimbursement public.family_shared_records%rowtype;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  select * into purchase from public.commissioned_purchases
    where id = target_purchase_id for update;
  if purchase.id is null then raise exception 'purchase_not_found'; end if;
  if purchase.recipient_id is distinct from current_user_id then raise exception 'purchase_recipient_required'; end if;
  if purchase.status <> 'pending' then raise exception 'purchase_already_resolved'; end if;

  -- Una compensazione può risolvere soltanto il rimborso pending che l'ha
  -- generata, fra lo stesso pagante e lo stesso destinatario.
  if purchase.family_id is not null then
    select * into reimbursement from public.family_shared_records
      where family_id = purchase.family_id
        and record_type = 'reimbursement'
        and record_id = purchase.reimbursement_id
      for update;
    if reimbursement.record_id is null
      or reimbursement.created_by <> purchase.payer_id
      or reimbursement.data ->> 'authorId' <> purchase.payer_id::text
      or reimbursement.data ->> 'fromId' <> purchase.payer_id::text
      or reimbursement.data ->> 'toId' <> current_user_id::text
      or reimbursement.data ->> 'settlementMethod' <> 'purchase'
      or reimbursement.data ->> 'commissionedPurchaseId' <> purchase.id
      or coalesce(reimbursement.data ->> 'status', 'confirmed') <> 'pending' then
      raise exception 'reimbursement_purchase_mismatch';
    end if;
  end if;

  if accept_purchase then
    if nullif(target_recipient_movement_id, '') is null
      or nullif(target_category_id, '') is null
      or nullif(target_account_id, '') is null then
      raise exception 'purchase_catalog_required';
    end if;
    update public.commissioned_purchases set
      status = 'confirmed', recipient_movement_id = target_recipient_movement_id,
      recipient_category_id = target_category_id, recipient_account_id = target_account_id,
      resolved_at = now()
    where id = target_purchase_id;

    if purchase.family_id is not null and purchase.reimbursement_id is not null then
      update public.family_shared_records set
        data = data - array['rejectedBy', 'rejectedAt'] || jsonb_build_object(
          'status', 'confirmed', 'settlementMethod', 'purchase',
          'commissionedPurchaseId', purchase.id,
          'confirmedBy', current_user_id::text, 'confirmedAt', now()
        ),
        updated_at = now()
      where family_id = purchase.family_id and record_type = 'reimbursement'
        and record_id = purchase.reimbursement_id
        and coalesce(data ->> 'status', 'confirmed') = 'pending';
    end if;
  else
    update public.commissioned_purchases set status = 'rejected', resolved_at = now()
      where id = target_purchase_id;
    if purchase.family_id is not null and purchase.reimbursement_id is not null then
      update public.family_shared_records set
        data = data - array['confirmedBy', 'confirmedAt'] || jsonb_build_object(
          'status', 'rejected', 'settlementMethod', 'purchase',
          'commissionedPurchaseId', purchase.id,
          'rejectedBy', current_user_id::text, 'rejectedAt', now()
        ),
        updated_at = now()
      where family_id = purchase.family_id and record_type = 'reimbursement'
        and record_id = purchase.reimbursement_id
        and coalesce(data ->> 'status', 'confirmed') = 'pending';
    end if;
  end if;
end;
$$;

revoke all on public.contact_invitations, public.contact_links, public.commissioned_purchases from anon;
grant select, insert, delete on public.contact_invitations to authenticated;
grant select on public.contact_links, public.commissioned_purchases to authenticated;
revoke all on function public.accept_contact_invitation(uuid) from public;
revoke all on function public.decline_contact_invitation(uuid) from public;
revoke all on function public.remove_contact(uuid) from public;
revoke all on function public.create_commissioned_purchase(text, uuid, uuid, uuid, text, text, numeric, date, text) from public;
revoke all on function public.respond_to_commissioned_purchase(text, boolean, text, text, text) from public;
grant execute on function public.accept_contact_invitation(uuid) to authenticated;
grant execute on function public.decline_contact_invitation(uuid) to authenticated;
grant execute on function public.remove_contact(uuid) to authenticated;
grant execute on function public.create_commissioned_purchase(text, uuid, uuid, uuid, text, text, numeric, date, text) to authenticated;
grant execute on function public.respond_to_commissioned_purchase(text, boolean, text, text, text) to authenticated;
