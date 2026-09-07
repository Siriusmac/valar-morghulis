-- Preparazione soltanto: nessun cron, invio o eliminazione viene attivato.
create table public.inactivity_policy (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  inactive_days integer not null default 180 check (inactive_days >= 120),
  grace_days integer not null default 30 check (grace_days >= 30)
);
insert into public.inactivity_policy (singleton) values (true);

create table public.inactivity_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'cancelled', 'delivery_unknown')),
  created_at timestamptz not null default now(),
  attempted_at timestamptz,
  sent_at timestamptz,
  review_after timestamptz,
  cancelled_at timestamptz
);
create unique index inactivity_notices_one_open on public.inactivity_notices(user_id)
  where status <> 'cancelled';
create index inactivity_notices_queue on public.inactivity_notices(created_at) where status = 'queued';

alter table public.inactivity_policy enable row level security;
alter table public.inactivity_notices enable row level security;
revoke all on public.inactivity_policy, public.inactivity_notices from public, anon, authenticated;

-- Anche un ritorno entro la finestra di throttling annulla subito il preavviso.
create or replace function public.record_user_activity()
returns void language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  insert into public.user_activity(user_id, last_seen_at) values (current_user_id, now())
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at
    where public.user_activity.last_seen_at < now() - interval '12 hours';
  update public.inactivity_notices set status = 'cancelled', cancelled_at = now()
    where user_id = current_user_id and status <> 'cancelled';
end;
$$;

-- Esclusione conservativa: un account collegato ad altre persone richiede una
-- valutazione dedicata delle conseguenze della cancellazione per entrambe le parti.
create function public.inactivity_candidates()
returns table (user_id uuid, activity_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.id, greatest(u.created_at, u.last_sign_in_at, a.last_seen_at)
  from auth.users u
  join public.profiles p on p.id = u.id
  left join public.user_activity a on a.user_id = u.id
  cross join public.inactivity_policy policy
  where policy.enabled and u.email_confirmed_at is not null and u.email is not null
    and p.onboarding_completed
    and greatest(u.created_at, u.last_sign_in_at, a.last_seen_at) < now() - make_interval(days => policy.inactive_days)
    and not exists (select 1 from public.platform_admins x where x.user_id = u.id)
    and not exists (select 1 from public.family_members x where x.user_id = u.id)
    and not exists (select 1 from public.contact_links x where x.user_id_a = u.id or x.user_id_b = u.id)
    and not exists (select 1 from public.commissioned_purchases x where x.payer_id = u.id or x.recipient_id = u.id);
$$;
revoke all on function public.inactivity_candidates() from public, anon, authenticated;

create function public.prepare_inactivity_notices()
returns integer language plpgsql security definer set search_path = '' as $$
declare inserted_count integer;
begin
  -- Un retry automatico dopo esito di rete incerto rischierebbe un doppio avviso.
  update public.inactivity_notices set status = 'delivery_unknown'
    where status = 'sending' and attempted_at < now() - interval '15 minutes';
  update public.inactivity_notices n set status = 'cancelled', cancelled_at = now()
    where n.status <> 'cancelled' and not exists (
      select 1 from public.inactivity_candidates() c where c.user_id = n.user_id and c.activity_at = n.activity_at
    );
  insert into public.inactivity_notices(user_id, activity_at)
    select c.user_id, c.activity_at from public.inactivity_candidates() c
    where not exists (select 1 from public.inactivity_notices n where n.user_id = c.user_id and n.status <> 'cancelled')
    order by c.activity_at limit 100
    on conflict do nothing;
  get diagnostics inserted_count = row_count;
  -- Conservazione minima dell'audit degli avvisi annullati, senza copie dell'email.
  delete from public.inactivity_notices where status = 'cancelled' and cancelled_at < now() - interval '90 days';
  return inserted_count;
end;
$$;
revoke all on function public.prepare_inactivity_notices() from public, anon, authenticated;
grant execute on function public.prepare_inactivity_notices() to service_role;

create function public.claim_inactivity_notice()
returns table (notice_id uuid, recipient text, review_after timestamptz)
language plpgsql security definer set search_path = '' as $$
declare target public.inactivity_notices; grace integer;
begin
  select policy.grace_days into grace from public.inactivity_policy policy where policy.enabled;
  if grace is null then return; end if;
  select n.* into target from public.inactivity_notices n
    join public.inactivity_candidates() c on c.user_id = n.user_id and c.activity_at = n.activity_at
    where n.status = 'queued' order by n.created_at for update of n skip locked limit 1;
  if target.id is null then return; end if;
  update public.inactivity_notices n set status = 'sending', attempted_at = now(),
    review_after = now() + make_interval(days => grace) where n.id = target.id;
  return query select n.id, u.email::text, n.review_after from public.inactivity_notices n
    join auth.users u on u.id = n.user_id where n.id = target.id;
end;
$$;
revoke all on function public.claim_inactivity_notice() from public, anon, authenticated;
grant execute on function public.claim_inactivity_notice() to service_role;

create function public.finish_inactivity_notice(target_id uuid, accepted boolean)
returns void language sql security definer set search_path = '' as $$
  update public.inactivity_notices set status = case when accepted then 'sent' else 'delivery_unknown' end,
    sent_at = case when accepted then now() else null end
  where id = target_id and status = 'sending';
$$;
revoke all on function public.finish_inactivity_notice(uuid, boolean) from public, anon, authenticated;
grant execute on function public.finish_inactivity_notice(uuid, boolean) to service_role;

create function public.platform_admin_inactivity_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'platform_admin_required'; end if;
  return jsonb_build_object(
    'policy', (select to_jsonb(p) from public.inactivity_policy p),
    'notices', coalesce((select jsonb_agg(to_jsonb(n)) from (
      select id, user_id, status, created_at, sent_at, review_after, cancelled_at
      from public.inactivity_notices order by created_at desc limit 100
    ) n), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.platform_admin_inactivity_overview() from public, anon;
grant execute on function public.platform_admin_inactivity_overview() to authenticated;

comment on table public.inactivity_notices is 'Preavvisi soltanto: sent indica accettazione del provider, non consegna. Nessuna cancellazione account automatica.';
