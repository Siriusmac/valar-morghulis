-- Recupera le richieste di acquisto storiche create prima che il rimborso
-- collegato fosse sincronizzato in modo affidabile. L'identita delle parti
-- resta vincolante; vengono normalizzati soltanto i metadati di collegamento.
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
  linkage_parties_match boolean := false;
  reimbursement_status text;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;

  select * into purchase from public.commissioned_purchases
  where id = target_purchase_id
  for update;

  if purchase.id is null then raise exception 'purchase_not_found'; end if;
  if purchase.recipient_id is distinct from current_user_id then
    raise exception 'purchase_recipient_required';
  end if;
  if purchase.status <> 'pending' then raise exception 'purchase_already_resolved'; end if;

  if purchase.family_id is not null then
    select * into reimbursement from public.family_shared_records
    where family_id = purchase.family_id
      and record_type = 'reimbursement'
      and record_id = purchase.reimbursement_id
    for update;

    linkage_parties_match := reimbursement.record_id is not null
      and reimbursement.created_by = purchase.payer_id
      and coalesce(reimbursement.data ->> 'authorId', '') = purchase.payer_id::text
      and coalesce(reimbursement.data ->> 'fromId', '') = purchase.payer_id::text
      and coalesce(reimbursement.data ->> 'toId', '') = current_user_id::text;
    reimbursement_status := coalesce(reimbursement.data ->> 'status', 'confirmed');

    if accept_purchase and not linkage_parties_match then
      raise exception 'reimbursement_purchase_mismatch';
    end if;
    if accept_purchase and reimbursement_status <> 'pending' then
      raise exception 'reimbursement_already_resolved';
    end if;
  end if;

  if accept_purchase then
    if nullif(target_recipient_movement_id, '') is null
      or nullif(target_category_id, '') is null
      or nullif(target_account_id, '') is null then
      raise exception 'purchase_catalog_required';
    end if;

    update public.commissioned_purchases
    set status = 'confirmed',
      recipient_movement_id = target_recipient_movement_id,
      recipient_category_id = target_category_id,
      recipient_account_id = target_account_id,
      resolved_at = now()
    where id = target_purchase_id;

    if purchase.family_id is not null then
      update public.family_shared_records
      set data = data - array['rejectedBy', 'rejectedAt'] || jsonb_build_object(
          'status', 'confirmed',
          'settlementMethod', 'purchase',
          'commissionedPurchaseId', purchase.id,
          'confirmedBy', current_user_id::text,
          'confirmedAt', now()
        ),
        updated_at = now()
      where family_id = purchase.family_id
        and record_type = 'reimbursement'
        and record_id = purchase.reimbursement_id
        and coalesce(data ->> 'status', 'confirmed') = 'pending';
    end if;
  else
    -- Il destinatario deve poter eliminare una richiesta bloccata. Se le parti
    -- non coincidono, il rimborso indicato non viene toccato.
    update public.commissioned_purchases
    set status = 'rejected', resolved_at = now()
    where id = target_purchase_id;

    if purchase.family_id is not null
      and linkage_parties_match
      and reimbursement_status = 'pending' then
      update public.family_shared_records
      set data = data - array['confirmedBy', 'confirmedAt'] || jsonb_build_object(
          'status', 'rejected',
          'settlementMethod', 'purchase',
          'commissionedPurchaseId', purchase.id,
          'rejectedBy', current_user_id::text,
          'rejectedAt', now()
        ),
        updated_at = now()
      where family_id = purchase.family_id
        and record_type = 'reimbursement'
        and record_id = purchase.reimbursement_id
        and coalesce(data ->> 'status', 'confirmed') = 'pending';
    end if;
  end if;
end;
$$;

revoke all on function public.respond_to_commissioned_purchase(text, boolean, text, text, text) from public;
grant execute on function public.respond_to_commissioned_purchase(text, boolean, text, text, text) to authenticated;
