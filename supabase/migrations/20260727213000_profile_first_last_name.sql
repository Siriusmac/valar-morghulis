-- Mantiene nome e cognome separati per supportare correttamente anche nomi composti.
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

update public.profiles
set
  first_name = coalesce(
    nullif(trim(first_name), ''),
    split_part(trim(full_name), ' ', 1)
  ),
  last_name = coalesce(
    nullif(trim(last_name), ''),
    case
      when position(' ' in trim(full_name)) > 0
        then nullif(trim(substring(trim(full_name) from position(' ' in trim(full_name)) + 1)), '')
      else null
    end
  );

alter table public.profiles
  drop constraint if exists profiles_first_name_length_check,
  drop constraint if exists profiles_last_name_length_check;

alter table public.profiles
  add constraint profiles_first_name_length_check
    check (first_name is null or length(trim(first_name)) between 1 and 60),
  add constraint profiles_last_name_length_check
    check (last_name is null or length(trim(last_name)) between 1 and 60);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  given_name text := nullif(trim(new.raw_user_meta_data ->> 'first_name'), '');
  family_name text := nullif(trim(new.raw_user_meta_data ->> 'last_name'), '');
  display_name text := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
begin
  display_name := coalesce(
    display_name,
    nullif(trim(concat_ws(' ', given_name, family_name)), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, first_name, last_name, full_name, email)
  values (
    new.id,
    coalesce(given_name, split_part(display_name, ' ', 1)),
    coalesce(
      family_name,
      case
        when position(' ' in display_name) > 0
          then nullif(trim(substring(display_name from position(' ' in display_name) + 1)), '')
        else null
      end
    ),
    display_name,
    lower(new.email)
  );
  return new;
end;
$$;
