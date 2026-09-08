-- La rimozione di un membro e atomica e non elimina mai il suo account.
-- Ogni record finanziario conserva la composizione della famiglia valida al
-- momento della creazione, cosi le quote storiche non cambiano per errore.
create table public.family_member_removals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  removed_by uuid not null references public.profiles(id),
  preserve_history boolean not null,
  removed_at timestamptz not null default now()
);

create index family_member_removals_family_idx
  on public.family_member_removals (family_id, removed_at desc);

alter table public.family_member_removals enable row level security;
revoke all on public.family_member_removals from anon, authenticated;

create or replace function public.stamp_family_record_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_ids jsonb;
  member_names jsonb;
  force_recalculation boolean := coalesce(
    current_setting('skey.member_removal_recalculate', true), ''
  ) = 'on';
begin
  if new.record_type not in (
    'movement', 'scheduled_payment', 'reimbursement', 'transfer',
    'loan', 'loan_repayment'
  ) then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and not force_recalculation
    and jsonb_typeof(old.data -> 'familyMemberIds') = 'array'
    and jsonb_array_length(
      case when jsonb_typeof(old.data -> 'familyMemberIds') = 'array'
        then old.data -> 'familyMemberIds' else '[]'::jsonb end
    ) > 0 then
    new.data := new.data - array['familyMemberIds', 'familyMemberNames']
      || jsonb_build_object('familyMemberIds', old.data -> 'familyMemberIds')
      || case
        when jsonb_typeof(old.data -> 'familyMemberNames') = 'object'
          then jsonb_build_object('familyMemberNames', old.data -> 'familyMemberNames')
        else '{}'::jsonb
      end;
    return new;
  end if;

  select
    coalesce(jsonb_agg(member.user_id::text order by member.joined_at, member.user_id), '[]'::jsonb),
    coalesce(jsonb_object_agg(member.user_id::text, profile.full_name), '{}'::jsonb)
  into member_ids, member_names
  from public.family_members member
  join public.profiles profile on profile.id = member.user_id
  where member.family_id = new.family_id;

  new.data := new.data - array['familyMemberIds', 'familyMemberNames']
    || jsonb_build_object(
      'familyMemberIds', member_ids,
      'familyMemberNames', member_names
    );
  return new;
end;
$$;

revoke all on function public.stamp_family_record_membership() from public, anon, authenticated;

drop trigger if exists family_shared_records_stamp_membership
  on public.family_shared_records;
create trigger family_shared_records_stamp_membership
before insert or update on public.family_shared_records
for each row execute function public.stamp_family_record_membership();

-- Fotografa una volta anche i record gia presenti. Le successive modifiche
-- manterranno questa composizione salvo un ricalcolo amministrativo esplicito.
update public.family_shared_records
set data = data
where record_type in (
    'movement', 'scheduled_payment', 'reimbursement', 'transfer',
    'loan', 'loan_repayment'
  )
  and (
    jsonb_typeof(data -> 'familyMemberIds') is distinct from 'array'
    or jsonb_array_length(
      case when jsonb_typeof(data -> 'familyMemberIds') = 'array'
        then data -> 'familyMemberIds' else '[]'::jsonb end
    ) = 0
  );

create or replace function public.family_member_shared_balance(
  target_family_id uuid,
  target_user_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_ids jsonb;
  member_count integer;
  personal_share numeric;
  other_share numeric;
  result numeric := 0;
  item record;
  item_amount numeric;
  direction numeric;
  destination_is_family boolean;
  source_is_family boolean;
begin
  for item in
    select record_type, data
    from public.family_shared_records
    where family_id = target_family_id
      and record_type in ('movement', 'reimbursement', 'transfer', 'loan_repayment')
  loop
    member_ids := item.data -> 'familyMemberIds';
    if jsonb_typeof(member_ids) is distinct from 'array'
      or jsonb_array_length(
        case when jsonb_typeof(member_ids) = 'array'
          then member_ids else '[]'::jsonb end
      ) = 0 then
      select coalesce(jsonb_agg(member.user_id::text), '[]'::jsonb)
      into member_ids
      from public.family_members member
      where member.family_id = target_family_id;
    end if;

    member_count := jsonb_array_length(member_ids);
    if member_count < 2 or not (member_ids ? target_user_id::text) then
      continue;
    end if;
    personal_share := 1.0 / member_count;
    other_share := (member_count - 1.0) / member_count;

    if item.record_type = 'movement' then
      if exists (
        select 1 from public.accounts account
        where account.family_id = target_family_id
          and account.id::text = item.data ->> 'accountId'
          and account.scope = 'family'
      ) then
        continue;
      end if;
      item_amount := coalesce(
        nullif(item.data ->> 'sharedSettlementAmount', '')::numeric,
        (item.data ->> 'amount')::numeric,
        0
      );
      direction := case when item.data ->> 'type' = 'income' then -1 else 1 end;
      result := result + case
        when item.data ->> 'memberId' = target_user_id::text
          then item_amount * other_share * direction
        else -item_amount * personal_share * direction
      end;
    elsif item.record_type = 'reimbursement'
      and coalesce(item.data ->> 'status', 'confirmed') = 'confirmed' then
      select exists (
        select 1 from public.accounts account
        where account.family_id = target_family_id
          and account.id::text = item.data ->> 'toAccountId'
          and account.scope = 'family'
      ) into destination_is_family;
      item_amount := coalesce((item.data ->> 'amount')::numeric, 0);
      if destination_is_family then
        result := result + case
          when item.data ->> 'fromId' = target_user_id::text
            then item_amount * other_share
          else -item_amount * personal_share
        end;
      else
        if item.data ->> 'toId' = target_user_id::text then
          result := result - item_amount;
        end if;
        if item.data ->> 'fromId' = target_user_id::text then
          result := result + item_amount;
        end if;
      end if;
    elsif item.record_type = 'transfer' then
      select exists (
        select 1 from public.accounts account
        where account.family_id = target_family_id
          and account.id::text = item.data ->> 'fromAccountId'
          and account.scope = 'family'
      ) into source_is_family;
      select exists (
        select 1 from public.accounts account
        where account.family_id = target_family_id
          and account.id::text = item.data ->> 'toAccountId'
          and account.scope = 'family'
      ) into destination_is_family;
      item_amount := coalesce((item.data ->> 'amount')::numeric, 0);
      if source_is_family and not destination_is_family then
        result := result + case
          when item.data ->> 'authorId' = target_user_id::text
            then -item_amount * other_share
          else item_amount * personal_share
        end;
      elsif not source_is_family and destination_is_family then
        result := result + case
          when item.data ->> 'authorId' = target_user_id::text
            then item_amount * other_share
          else -item_amount * personal_share
        end;
      end if;
    elsif item.record_type = 'loan_repayment'
      and item.data ->> 'status' = 'confirmed'
      and item.data ->> 'method' = 'family_credit' then
      item_amount := coalesce((item.data ->> 'amount')::numeric, 0);
      if item.data ->> 'borrowerId' = target_user_id::text then
        result := result - item_amount;
      end if;
      if item.data ->> 'lenderId' = target_user_id::text then
        result := result + item_amount;
      end if;
    end if;
  end loop;
  return round(result, 2);
end;
$$;

revoke all on function public.family_member_shared_balance(uuid, uuid) from public;

create or replace function public.remove_family_member(
  target_family_id uuid,
  target_user_id uuid,
  preserve_history boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_role text;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;
  if preserve_history is null then
    raise exception 'member_removal_mode_required';
  end if;
  if not public.is_family_admin(target_family_id) then
    raise exception 'family_admin_required';
  end if;
  if target_user_id = current_user_id then
    raise exception 'cannot_remove_self';
  end if;

  perform 1 from public.families where id = target_family_id for update;
  select role into target_role
  from public.family_members
  where family_id = target_family_id and user_id = target_user_id
  for update;

  if target_role is null then
    raise exception 'family_member_not_found';
  end if;
  if target_role = 'admin' then
    raise exception 'cannot_remove_family_admin';
  end if;

  if preserve_history and (
    exists (
      select 1 from public.family_shared_records record
      where record.family_id = target_family_id
        and record.record_type in ('reimbursement', 'loan', 'loan_repayment')
        and record.data ->> 'status' = 'pending'
        and target_user_id::text in (
          record.data ->> 'fromId', record.data ->> 'toId',
          record.data ->> 'lenderId', record.data ->> 'borrowerId'
        )
    )
    or exists (
      select 1
      from public.family_shared_records loan
      where loan.family_id = target_family_id
        and loan.record_type = 'loan'
        and loan.data ->> 'status' = 'confirmed'
        and target_user_id::text in (loan.data ->> 'lenderId', loan.data ->> 'borrowerId')
        and coalesce((loan.data ->> 'amount')::numeric, 0) > coalesce((
          select sum((repayment.data ->> 'amount')::numeric)
          from public.family_shared_records repayment
          where repayment.family_id = target_family_id
            and repayment.record_type = 'loan_repayment'
            and repayment.data ->> 'loanId' = loan.record_id
            and repayment.data ->> 'status' = 'confirmed'
        ), 0)
    )
    or exists (
      select 1
      from public.family_reimbursement_change_requests request
      join public.family_shared_records reimbursement
        on reimbursement.family_id = request.family_id
        and reimbursement.record_type = 'reimbursement'
        and reimbursement.record_id = request.reimbursement_id
      where request.family_id = target_family_id
        and request.status = 'pending'
        and target_user_id::text in (
          reimbursement.data ->> 'fromId', reimbursement.data ->> 'toId'
        )
    )
    or exists (
      select 1 from public.commissioned_purchases purchase
      where purchase.family_id = target_family_id
        and target_user_id in (purchase.payer_id, purchase.recipient_id)
        and (
          purchase.status = 'pending'
          or purchase.reimbursement_status in ('not_issued', 'pending')
        )
    )
  ) then
    raise exception 'family_member_has_open_items';
  end if;

  insert into public.family_member_removals (
    family_id, user_id, removed_by, preserve_history
  ) values (
    target_family_id, target_user_id, current_user_id, preserve_history
  );

  if not preserve_history then
    delete from public.family_reimbursement_change_requests request
    using public.family_shared_records reimbursement
    where request.family_id = target_family_id
      and reimbursement.family_id = target_family_id
      and reimbursement.record_type = 'reimbursement'
      and reimbursement.record_id = request.reimbursement_id
      and (
        reimbursement.created_by = target_user_id
        or target_user_id::text in (
          reimbursement.data ->> 'fromId', reimbursement.data ->> 'toId'
        )
      );

    delete from public.family_shared_records record
    where record.family_id = target_family_id
      and record.record_type in (
        'movement', 'scheduled_payment', 'reimbursement', 'transfer',
        'loan', 'loan_repayment'
      )
      and (
        record.created_by = target_user_id
        or target_user_id::text in (
          record.data ->> 'authorId', record.data ->> 'memberId',
          record.data ->> 'paidByUserId', record.data ->> 'fromId',
          record.data ->> 'toId', record.data ->> 'lenderId',
          record.data ->> 'borrowerId'
        )
        or exists (
          select 1
          from public.commissioned_purchases purchase
          where purchase.family_id = target_family_id
            and target_user_id in (purchase.payer_id, purchase.recipient_id)
            and (
              record.data ->> 'commissionedPurchaseId' = purchase.id
              or exists (
                select 1
                from jsonb_array_elements(
                  case when jsonb_typeof(record.data -> 'splits') = 'array'
                    then record.data -> 'splits' else '[]'::jsonb end
                ) split
                where split ->> 'commissionedPurchaseId' = purchase.id
              )
            )
        )
      );

    delete from public.commissioned_purchases purchase
    where purchase.family_id = target_family_id
      and target_user_id in (purchase.payer_id, purchase.recipient_id);
  end if;

  delete from public.family_reimbursement_accounts
  where family_id = target_family_id and owner_id = target_user_id;

  delete from public.app_data_sync_mutations
  where family_id = target_family_id and user_id = target_user_id;

  delete from public.family_members
  where family_id = target_family_id and user_id = target_user_id;

  if not preserve_history then
    perform set_config('skey.member_removal_recalculate', 'on', true);
    update public.family_shared_records
    set data = data
    where family_id = target_family_id
      and record_type in (
        'movement', 'scheduled_payment', 'reimbursement', 'transfer',
        'loan', 'loan_repayment'
      );
  end if;
end;
$$;

revoke all on function public.remove_family_member(uuid, uuid, boolean) from public;
grant execute on function public.remove_family_member(uuid, uuid, boolean) to authenticated;
