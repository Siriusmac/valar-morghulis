alter table public.accounts
add column if not exists opening_balance_date date not null default current_date;

comment on column public.accounts.opening_balance_date is
  'Date on which opening_balance was observed; older movements may be statistics-only.';
