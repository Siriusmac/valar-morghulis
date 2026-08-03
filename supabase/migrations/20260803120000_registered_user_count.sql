create or replace function public.registered_user_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.profiles;
$$;

revoke all on function public.registered_user_count() from public;
revoke all on function public.registered_user_count() from anon;
grant execute on function public.registered_user_count() to authenticated;
