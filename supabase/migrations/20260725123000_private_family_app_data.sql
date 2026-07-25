-- Snapshot operativo privato per utente e famiglia.
-- Consente di conservare conti personali, movimenti e configurazioni tra
-- aggiornamenti e dispositivi senza esporli agli altri membri.
create table public.family_user_app_data (
  family_id uuid not null,
  user_id uuid not null,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (family_id, user_id),
  foreign key (family_id, user_id)
    references public.family_members(family_id, user_id)
    on delete cascade
);

create index family_user_app_data_user_id_idx
  on public.family_user_app_data (user_id, family_id);

create trigger family_user_app_data_set_updated_at
before update on public.family_user_app_data
for each row execute function public.set_updated_at();

alter table public.family_user_app_data enable row level security;

create policy family_user_app_data_read_own
on public.family_user_app_data
for select
to authenticated
using (user_id = (select auth.uid()));

create policy family_user_app_data_insert_own
on public.family_user_app_data
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (select public.is_family_member(family_id))
);

create policy family_user_app_data_update_own
on public.family_user_app_data
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (select public.is_family_member(family_id))
);

revoke all on public.family_user_app_data from anon;
grant select, insert, update on public.family_user_app_data to authenticated;
