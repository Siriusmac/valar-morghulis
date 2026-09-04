-- Console globale separata dai ruoli amministrativi delle singole famiglie.
-- Dopo l'applicazione, il titolare del progetto assegna il proprio utente con:
-- insert into public.platform_admins (user_id) values ('UUID-DEL-PROPRIO-UTENTE');

create table public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.user_activity (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
alter table public.user_activity enable row level security;

revoke all on table public.platform_admins from public, anon, authenticated;
revoke all on table public.user_activity from public, anon, authenticated;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_platform_admin() from public;
revoke all on function public.is_platform_admin() from anon;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.record_user_activity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  insert into public.user_activity (user_id, last_seen_at)
  values (current_user_id, now())
  on conflict (user_id) do update
    set last_seen_at = excluded.last_seen_at
    where public.user_activity.last_seen_at < now() - interval '12 hours';
end;
$$;

revoke all on function public.record_user_activity() from public;
revoke all on function public.record_user_activity() from anon;
grant execute on function public.record_user_activity() to authenticated;

create or replace function public.platform_admin_user_overview()
returns table (
  user_id uuid,
  full_name text,
  email text,
  created_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  last_seen_at timestamptz,
  last_activity_at timestamptz,
  family_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform_admin_required';
  end if;

  return query
  select
    profile.id,
    profile.full_name,
    profile.email,
    auth_user.created_at,
    auth_user.email_confirmed_at,
    auth_user.last_sign_in_at,
    activity.last_seen_at,
    greatest(auth_user.last_sign_in_at, activity.last_seen_at),
    (select count(*) from public.family_members membership where membership.user_id = profile.id)
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  left join public.user_activity activity on activity.user_id = profile.id
  order by greatest(auth_user.last_sign_in_at, activity.last_seen_at) desc nulls last,
    auth_user.created_at desc;
end;
$$;

revoke all on function public.platform_admin_user_overview() from public;
revoke all on function public.platform_admin_user_overview() from anon;
grant execute on function public.platform_admin_user_overview() to authenticated;

-- Il vecchio totale globale non deve più essere consultabile dagli utenti comuni.
revoke execute on function public.registered_user_count() from authenticated;

comment on table public.platform_admins is 'Amministratori globali della piattaforma, distinti dagli amministratori delle famiglie.';
comment on table public.user_activity is 'Ultima apertura autenticata dell applicazione, aggiornata al massimo ogni dodici ore.';
comment on function public.platform_admin_user_overview() is 'Riepilogo minimo degli utenti riservato agli amministratori globali; non espone dati contabili.';
