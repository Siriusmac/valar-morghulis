alter table public.accounts
add column if not exists monthly_spending_limit numeric(14, 2)
check (monthly_spending_limit is null or monthly_spending_limit > 0);

comment on column public.accounts.monthly_spending_limit is
  'Optional monthly expense limit for the shared account. Transfers are excluded.';
