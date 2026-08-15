-- Nelle famiglie con più di due membri l'autore dei nuovi rimborsi deve essere
-- il pagatore. Sugli aggiornamenti il controllo viene ripetuto soltanto se
-- cambia una delle parti: conferme e rifiuti di eventuali record storici
-- restano quindi possibili.
create or replace function public.validate_multi_member_reimbursement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  family_member_count integer;
begin
  if new.record_type <> 'reimbursement' then return new; end if;

  if tg_op = 'UPDATE'
    and new.created_by is not distinct from old.created_by
    and new.data ->> 'fromId' is not distinct from old.data ->> 'fromId'
    and new.data ->> 'toId' is not distinct from old.data ->> 'toId' then
    return new;
  end if;

  select count(*) into family_member_count
  from public.family_members
  where family_id = new.family_id;

  if family_member_count > 2
    and new.created_by::text is distinct from new.data ->> 'fromId' then
    raise exception 'multi_member_reimbursement_author_must_be_payer';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_multi_member_reimbursement_trigger
  on public.family_shared_records;
create trigger validate_multi_member_reimbursement_trigger
before insert or update on public.family_shared_records
for each row execute function public.validate_multi_member_reimbursement();

revoke all on function public.validate_multi_member_reimbursement() from public;
