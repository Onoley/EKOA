create extension if not exists citext with schema extensions;

create type public.user_role as enum ('user', 'moderator', 'admin');
create type public.account_type as enum ('ordinary', 'verified');
create type public.account_status as enum (
  'pending_onboarding', 'active', 'suspended', 'deletion_requested', 'anonymized'
);
create type public.professional_activity as enum (
  'student', 'employee', 'self_employed', 'public_service', 'job_seeker',
  'retired', 'without_activity', 'other', 'prefer_not_to_say'
);
create type public.gender_value as enum (
  'woman', 'man', 'non_binary', 'other', 'prefer_not_to_say'
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text,
  username_normalized extensions.citext,
  birth_year smallint,
  department_code text,
  professional_activity public.professional_activity,
  gender public.gender_value,
  role public.user_role not null default 'user',
  account_type public.account_type not null default 'ordinary',
  account_status public.account_status not null default 'pending_onboarding',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username is null or username ~ '^[A-Za-z0-9_]{3,24}$'
  ),
  constraint profiles_username_pair check (
    (username is null and username_normalized is null)
    or (username is not null and username_normalized = lower(username))
  ),
  constraint profiles_birth_year check (
    birth_year is null or birth_year between extract(year from current_date)::integer - 120 and extract(year from current_date)::integer - 18
  ),
  constraint profiles_department_code check (
    department_code is null or department_code ~ '^(0[1-9]|1[0-9]|2[1-9]|[3-8][0-9]|9[0-5]|2A|2B|97[1-6])$'
  ),
  constraint profiles_onboarding_state check (
    (account_status = 'pending_onboarding' and onboarding_completed_at is null)
    or (
      account_status <> 'pending_onboarding'
      and username is not null
      and birth_year is not null
      and department_code is not null
      and professional_activity is not null
      and onboarding_completed_at is not null
    )
  )
);

create unique index profiles_username_normalized_key
  on public.profiles (username_normalized)
  where username_normalized is not null;
create index profiles_account_status_idx on public.profiles (account_status);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null unique check (char_length(name) between 2 and 80),
  description text not null default '',
  display_order smallint not null unique check (display_order > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.category_follows (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, category_id)
);
create index category_follows_category_id_idx on public.category_follows (category_id);

create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger categories_set_updated_at before update on public.categories
for each row execute function public.set_updated_at();

create function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create function public.is_active_user(target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where user_id = target_user_id and account_status = 'active'
  );
$$;

create function public.complete_onboarding(
  requested_username text,
  requested_birth_year smallint,
  requested_department_code text,
  requested_professional_activity public.professional_activity,
  requested_gender public.gender_value,
  requested_category_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_username text := lower(trim(requested_username));
  normalized_department text := upper(trim(requested_department_code));
  distinct_category_count integer;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if normalized_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'invalid_username' using errcode = 'P0001';
  end if;

  if requested_birth_year < extract(year from current_date)::integer - 120
     or requested_birth_year > extract(year from current_date)::integer - 18 then
    raise exception 'age_ineligible' using errcode = 'P0001';
  end if;

  if normalized_department !~ '^(0[1-9]|1[0-9]|2[1-9]|[3-8][0-9]|9[0-5]|2A|2B|97[1-6])$' then
    raise exception 'invalid_department' using errcode = 'P0001';
  end if;

  select count(distinct category_id) into distinct_category_count
  from unnest(requested_category_ids) as selected(category_id)
  join public.categories on categories.id = selected.category_id
  where categories.is_active;

  if distinct_category_count < 3
     or distinct_category_count <> cardinality(requested_category_ids) then
    raise exception 'invalid_categories' using errcode = 'P0001';
  end if;

  update public.profiles
  set username = trim(requested_username),
      username_normalized = normalized_username,
      birth_year = requested_birth_year,
      department_code = normalized_department,
      professional_activity = requested_professional_activity,
      gender = requested_gender,
      account_status = 'active',
      onboarding_completed_at = now()
  where user_id = current_user_id and account_status = 'pending_onboarding';

  if not found then
    raise exception 'onboarding_unavailable' using errcode = 'P0001';
  end if;

  insert into public.category_follows (user_id, category_id)
  select current_user_id, category_id from unnest(requested_category_ids) as selected(category_id);
exception
  when unique_violation then
    raise exception 'username_unavailable' using errcode = 'P0001';
end;
$$;

create view public.public_profiles
with (security_invoker = true)
as
select user_id, username, account_type, created_at
from public.profiles
where account_status = 'active';

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.category_follows enable row level security;

create policy "profiles_select_own"
on public.profiles for select to authenticated
using (user_id = auth.uid());

create policy "categories_select_active"
on public.categories for select to authenticated
using (is_active and public.is_active_user());

create policy "categories_select_during_onboarding"
on public.categories for select to authenticated
using (
  is_active and exists (
    select 1 from public.profiles
    where user_id = auth.uid() and account_status = 'pending_onboarding'
  )
);

create policy "category_follows_select_own"
on public.category_follows for select to authenticated
using (user_id = auth.uid() and public.is_active_user());

create policy "category_follows_insert_own"
on public.category_follows for insert to authenticated
with check (
  user_id = auth.uid()
  and public.is_active_user()
  and exists (select 1 from public.categories where id = category_id and is_active)
);

create policy "category_follows_delete_own"
on public.category_follows for delete to authenticated
using (user_id = auth.uid() and public.is_active_user());

revoke all on public.profiles, public.categories, public.category_follows from anon;
revoke all on public.profiles, public.categories, public.category_follows from authenticated;
grant select on public.profiles to authenticated;
grant select on public.categories to authenticated;
grant select, insert, delete on public.category_follows to authenticated;
grant select on public.public_profiles to authenticated;
revoke all on function public.complete_onboarding(text, smallint, text, public.professional_activity, public.gender_value, uuid[]) from public;
grant execute on function public.complete_onboarding(text, smallint, text, public.professional_activity, public.gender_value, uuid[]) to authenticated;
grant execute on function public.is_active_user(uuid) to authenticated;
