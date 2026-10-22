-- Optional enrollment, mandatory AAL2 only for users who have verified factors.
-- Do not activate enrollment in the web client before deploying and testing this.
begin;

create or replace function public.optional_mfa_satisfied()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
    coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors factor
      where factor.user_id = auth.uid() and factor.status = 'verified'
    )
  );
$$;
revoke all on function public.optional_mfa_satisfied() from public, anon;
grant execute on function public.optional_mfa_satisfied() to authenticated, service_role;

create or replace function public.require_optional_mfa()
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  -- Existing RLS/RPC auth checks continue protecting anonymous requests.
  -- Server jobs keep their service role; never use it for a user request before
  -- checking the user's bearer token with require_optional_mfa.
  if coalesce(auth.jwt()->>'role', '') = 'authenticated'
     and not public.optional_mfa_satisfied() then
    raise sqlstate 'PT403' using message = 'mfa_verification_required';
  end if;
end;
$$;
revoke all on function public.require_optional_mfa() from public;
grant execute on function public.require_optional_mfa() to anon, authenticated, service_role;

-- RLS also covers Realtime; restrictive policies compose with existing tenant rules.
do $$
declare target record;
begin
  for target in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
  loop
    execute format('create policy skey_optional_mfa on public.%I as restrictive for all to authenticated using ((select public.optional_mfa_satisfied())) with check ((select public.optional_mfa_satisfied()))', target.relname);
  end loop;
end;
$$;

-- Protect Data API RPCs too, including SECURITY DEFINER functions bypassing RLS.
-- Refuse to overwrite another pre-request hook: integrate it explicitly first.
do $$
begin
  if exists (
    select 1 from pg_db_role_setting settings cross join lateral unnest(settings.setconfig) entry
    where (settings.setrole = 0 or settings.setrole = (select oid from pg_roles where rolname = 'authenticator'))
      and split_part(entry, '=', 1) = 'pgrst.db_pre_request'
      and split_part(entry, '=', 2) not in ('', 'public.require_optional_mfa')
  ) then
    raise exception 'existing_pre_request_hook_requires_manual_integration';
  end if;
end;
$$;
alter role authenticator set pgrst.db_pre_request = 'public.require_optional_mfa';
notify pgrst, 'reload config';

commit;
