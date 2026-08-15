-- I token APNs restano separati dai dati finanziari e sono accessibili ai
-- client soltanto attraverso funzioni vincolate all'utente autenticato.
create table public.push_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{64,400}$'),
  platform text not null check (platform in ('ios', 'macos')),
  environment text not null check (environment in ('development', 'production')),
  bundle_id text not null check (length(bundle_id) between 3 and 255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_device_tokens_user_idx on public.push_device_tokens (user_id);
alter table public.push_device_tokens enable row level security;
revoke all on public.push_device_tokens from anon, authenticated;

create or replace function public.register_my_push_device(
  device_token text,
  device_platform text,
  apns_environment text,
  app_bundle_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_token text := lower(btrim(device_token));
  registered_id uuid;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  if normalized_token !~ '^[0-9a-f]{64,400}$'
    or device_platform not in ('ios', 'macos')
    or apns_environment not in ('development', 'production')
    or length(btrim(app_bundle_id)) not between 3 and 255 then
    raise exception 'invalid_push_device';
  end if;

  insert into public.push_device_tokens (user_id, token, platform, environment, bundle_id)
  values (current_user_id, normalized_token, device_platform, apns_environment, btrim(app_bundle_id))
  on conflict (token) do update set
    user_id = current_user_id,
    platform = excluded.platform,
    environment = excluded.environment,
    bundle_id = excluded.bundle_id,
    updated_at = now()
  returning id into registered_id;
  return registered_id;
end;
$$;

revoke all on function public.register_my_push_device(text, text, text, text) from public;
grant execute on function public.register_my_push_device(text, text, text, text) to authenticated;

create or replace function public.unregister_my_push_device(device_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_device_tokens
  where user_id = (select auth.uid()) and token = lower(btrim(device_token));
$$;

revoke all on function public.unregister_my_push_device(text) from public;
grant execute on function public.unregister_my_push_device(text) to authenticated;

-- La chiave univoca per dispositivo rende l'invio sicuro rispetto ai retry dei
-- client. Le righe fallite vengono rimosse dalla funzione Edge e sono ritentabili.
create table public.reimbursement_push_deliveries (
  reimbursement_id text not null,
  family_id uuid not null references public.families(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  device_token_id uuid not null references public.push_device_tokens(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (family_id, reimbursement_id, device_token_id)
);

alter table public.reimbursement_push_deliveries enable row level security;
revoke all on public.reimbursement_push_deliveries from anon, authenticated;
