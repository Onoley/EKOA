create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create type public.question_status as enum ('draft', 'published', 'limited', 'under_review', 'removed', 'archived');
create type public.question_moderation_status as enum ('clear', 'flagged', 'approved', 'rejected');

create table public.question_settings (
  singleton boolean primary key default true check (singleton),
  question_max_length smallint not null default 180 check (question_max_length between 40 and 500),
  option_max_length smallint not null default 80 check (option_max_length between 10 and 200),
  ordinary_rolling_limit smallint not null default 3 check (ordinary_rolling_limit > 0),
  rolling_days smallint not null default 7 check (rolling_days > 0),
  active_limit smallint not null default 10 check (active_limit > 0),
  hourly_publish_limit smallint not null default 10 check (hourly_publish_limit > 0),
  high_similarity real not null default 0.90 check (high_similarity between 0 and 1),
  medium_similarity real not null default 0.65 check (medium_similarity between 0 and 1),
  updated_at timestamptz not null default now()
);
insert into public.question_settings default values;

create table public.question_forbidden_terms (
  id uuid primary key default gen_random_uuid(),
  term text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.question_forbidden_terms(term) values
  ('connard'), ('connasse'), ('salope'), ('va te tuer');

create table public.question_series (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(user_id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  series_id uuid not null references public.question_series(id) on delete restrict,
  previous_wave_id uuid references public.questions(id) on delete restrict,
  text text not null,
  normalized_text text not null,
  normalization_version smallint not null default 1,
  target_min_age smallint check (target_min_age between 18 and 120),
  target_max_age smallint check (target_max_age between 18 and 120),
  status public.question_status not null default 'draft',
  moderation_status public.question_moderation_status not null default 'clear',
  published_at timestamptz,
  duplicate_confirmed_at timestamptz,
  vote_count integer not null default 0 check (vote_count >= 0),
  upvote_count integer not null default 0 check (upvote_count >= 0),
  follow_count integer not null default 0 check (follow_count >= 0),
  report_count integer not null default 0 check (report_count >= 0),
  impression_count integer not null default 0 check (impression_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_age_range check (
    target_min_age is null or target_max_age is null or target_min_age <= target_max_age
  ),
  constraint questions_publication_state check (
    (status = 'draft' and published_at is null) or (status <> 'draft' and published_at is not null)
  )
);
create index questions_author_status_idx on public.questions(author_id, status, published_at desc);
create index questions_category_status_idx on public.questions(category_id, status, published_at desc);
create index questions_normalized_trgm_idx on public.questions using gin (normalized_text extensions.gin_trgm_ops);

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  position smallint not null check (position between 1 and 6),
  text text not null,
  normalized_text text not null,
  vote_count integer not null default 0 check (vote_count >= 0),
  created_at timestamptz not null default now(),
  unique (question_id, position),
  unique (question_id, normalized_text)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name extensions.citext not null unique,
  created_at timestamptz not null default now()
);

create table public.question_tags (
  question_id uuid not null references public.questions(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, tag_id)
);

create table public.question_duplicate_reviews (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  similar_question_id uuid not null references public.questions(id) on delete restrict,
  similarity real not null check (similarity between 0 and 1),
  confirmed_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(question_id, similar_question_id)
);

create trigger questions_set_updated_at before update on public.questions
for each row execute function public.set_updated_at();

create function public.normalize_question_text(input text)
returns text language sql immutable strict set search_path = '' as $$
  select trim(regexp_replace(
    regexp_replace(lower(extensions.unaccent(translate(input, '’', ''''))), '[[:punct:]]+', ' ', 'g'),
    '\s+', ' ', 'g'
  ));
$$;

create function public.find_similar_questions(
  requested_text text,
  requested_category_id uuid,
  requested_options text[],
  excluded_question_id uuid default null
)
returns table(question_id uuid, question_text text, category_name text, similarity real, is_exact boolean)
language sql stable security definer set search_path = '' as $$
  with requested as (
    select public.normalize_question_text(requested_text) normalized,
      array(select distinct public.normalize_question_text(value) from unnest(requested_options) value) options
  ), candidates as (
    select q.id, q.text, c.name,
      extensions.similarity(q.normalized_text, requested.normalized) text_score,
      case when q.category_id = requested_category_id then 1 else 0 end category_score,
      (select count(*)::real / greatest(cardinality(requested.options), count(*), 1)
       from public.question_options qo where qo.question_id = q.id and qo.normalized_text = any(requested.options)) option_score,
      q.normalized_text = requested.normalized exact
    from public.questions q join public.categories c on c.id = q.category_id cross join requested
    where q.status = 'published' and q.id is distinct from excluded_question_id
      and extensions.similarity(q.normalized_text, requested.normalized) >= 0.35
  )
  select id, text, name, least(1, text_score * 0.75 + category_score * 0.10 + option_score * 0.15)::real, exact
  from candidates order by exact desc, 4 desc, id limit 5;
$$;

create function public.save_question_draft(
  requested_question_id uuid,
  requested_text text,
  requested_category_id uuid,
  requested_options text[],
  requested_tags text[],
  requested_min_age smallint,
  requested_max_age smallint,
  requested_previous_wave_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  draft_id uuid;
  series uuid;
  settings public.question_settings%rowtype;
  option_value text;
  tag_value text;
  pos integer := 0;
begin
  if current_user_id is null or not public.is_active_user(current_user_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select * into settings from public.question_settings where singleton;
  if char_length(trim(requested_text)) < 10 or char_length(trim(requested_text)) > settings.question_max_length then
    raise exception 'invalid_question' using errcode = 'P0001';
  end if;
  if cardinality(requested_options) not between 2 and 6 then raise exception 'invalid_options' using errcode = 'P0001'; end if;
  if cardinality(requested_tags) > 3 then raise exception 'invalid_tags' using errcode = 'P0001'; end if;
  if requested_min_age is not null and requested_max_age is not null and requested_min_age > requested_max_age then
    raise exception 'invalid_age_range' using errcode = 'P0001';
  end if;
  if not exists(select 1 from public.categories where id = requested_category_id and is_active) then
    raise exception 'invalid_category' using errcode = 'P0001';
  end if;
  if requested_text ~* '(https?://|www\.|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}|\+?[0-9][0-9 .-]{7,}|@[a-z0-9_]{2,})' then
    raise exception 'contact_details' using errcode = 'P0001';
  end if;
  if exists(select 1 from public.question_forbidden_terms
    where is_active and public.normalize_question_text(requested_text) ~ ('(^| )' || public.normalize_question_text(term) || '( |$)')) then
    raise exception 'forbidden_content' using errcode = 'P0001';
  end if;
  if exists(select 1 from unnest(requested_options) value where char_length(trim(value)) < 1 or char_length(trim(value)) > settings.option_max_length) then
    raise exception 'invalid_options' using errcode = 'P0001';
  end if;
  if exists(select 1 from unnest(requested_options) value where value ~* '(https?://|www\.|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}|\+?[0-9][0-9 .-]{7,}|@[a-z0-9_]{2,})') then
    raise exception 'contact_details' using errcode = 'P0001';
  end if;
  if exists(select 1 from unnest(requested_options) value join public.question_forbidden_terms term
    on term.is_active and public.normalize_question_text(value) ~ ('(^| )' || public.normalize_question_text(term.term) || '( |$)')) then
    raise exception 'forbidden_content' using errcode = 'P0001';
  end if;
  if exists(select 1 from unnest(requested_tags) value where char_length(trim(value)) not between 1 and 30 or value !~ '^[[:alnum:]À-ÿ -]+$') then
    raise exception 'invalid_tags' using errcode = 'P0001';
  end if;
  if (select count(distinct public.normalize_question_text(value)) from unnest(requested_options) value) <> cardinality(requested_options) then
    raise exception 'duplicate_options' using errcode = 'P0001';
  end if;

  if requested_question_id is not null then
    select id, series_id into draft_id, series from public.questions
    where id = requested_question_id and author_id = current_user_id and status = 'draft' for update;
    if draft_id is null then raise exception 'draft_unavailable' using errcode = 'P0001'; end if;
  elsif requested_previous_wave_id is not null then
    select series_id into series from public.questions where id = requested_previous_wave_id
      and author_id = current_user_id and status = 'published';
    if series is null then raise exception 'wave_unavailable' using errcode = 'P0001'; end if;
  else
    insert into public.question_series(creator_id) values(current_user_id) returning id into series;
  end if;

  if draft_id is null then
    insert into public.questions(author_id, category_id, series_id, previous_wave_id, text, normalized_text,
      target_min_age, target_max_age)
    values(current_user_id, requested_category_id, series, requested_previous_wave_id, trim(requested_text),
      public.normalize_question_text(requested_text), requested_min_age, requested_max_age) returning id into draft_id;
  else
    update public.questions set category_id=requested_category_id, text=trim(requested_text),
      normalized_text=public.normalize_question_text(requested_text), target_min_age=requested_min_age,
      target_max_age=requested_max_age where id=draft_id;
    delete from public.question_options where question_id=draft_id;
    delete from public.question_tags where question_id=draft_id;
  end if;

  foreach option_value in array requested_options loop
    pos := pos + 1;
    insert into public.question_options(question_id, position, text, normalized_text)
    values(draft_id, pos, trim(option_value), public.normalize_question_text(option_value));
  end loop;
  foreach tag_value in array requested_tags loop
    if trim(tag_value) <> '' then
      insert into public.tags(name, normalized_name) values(trim(tag_value), lower(trim(tag_value)))
      on conflict(normalized_name) do nothing;
      insert into public.question_tags(question_id, tag_id)
      select draft_id, id from public.tags where normalized_name=lower(trim(tag_value)) on conflict do nothing;
    end if;
  end loop;
  return draft_id;
end;
$$;

create function public.publish_question(requested_question_id uuid, confirmed_medium_similarity boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  target public.questions%rowtype;
  settings public.question_settings%rowtype;
  profile_type public.account_type;
  option_values text[];
  similar_question record;
  active_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  select * into target from public.questions where id=requested_question_id and author_id=current_user_id and status='draft' for update;
  if target.id is null or not public.is_active_user(current_user_id) then raise exception 'draft_unavailable' using errcode='P0001'; end if;
  select * into settings from public.question_settings where singleton;
  select account_type into profile_type from public.profiles where user_id=current_user_id;
  select array_agg(text order by position) into option_values from public.question_options where question_id=target.id;

  if char_length(target.text) not between 10 and settings.question_max_length
    or cardinality(option_values) not between 2 and 6
    or exists(select 1 from public.question_options where question_id=target.id and char_length(text) not between 1 and settings.option_max_length)
    or (select count(*) from public.question_tags where question_id=target.id) > 3
    or not exists(select 1 from public.categories where id=target.category_id and is_active) then
    raise exception 'invalid_question' using errcode='P0001';
  end if;
  if target.text ~* '(https?://|www\.|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}|\+?[0-9][0-9 .-]{7,}|@[a-z0-9_]{2,})'
    or exists(select 1 from public.question_options where question_id=target.id and text ~* '(https?://|www\.|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}|\+?[0-9][0-9 .-]{7,}|@[a-z0-9_]{2,})') then
    raise exception 'contact_details' using errcode='P0001';
  end if;
  if exists(select 1 from public.question_forbidden_terms where is_active
    and public.normalize_question_text(target.text) ~ ('(^| )' || public.normalize_question_text(term) || '( |$)'))
    or exists(select 1 from public.question_options qo join public.question_forbidden_terms term
      on term.is_active and public.normalize_question_text(qo.text) ~ ('(^| )' || public.normalize_question_text(term.term) || '( |$)')
      where qo.question_id=target.id) then
    raise exception 'forbidden_content' using errcode='P0001';
  end if;

  if (select count(*) from public.questions where author_id=current_user_id and status in ('published','limited','under_review')) >= settings.active_limit then
    raise exception 'active_limit' using errcode='P0001';
  end if;
  if (select count(*) from public.questions where author_id=current_user_id and published_at >= now() - interval '1 hour') >= settings.hourly_publish_limit then
    raise exception 'rate_limit' using errcode='P0001';
  end if;
  if profile_type='ordinary' and (select count(*) from public.questions where author_id=current_user_id and published_at >= now() - make_interval(days => settings.rolling_days)) >= settings.ordinary_rolling_limit then
    raise exception 'rolling_limit' using errcode='P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target.normalized_text, 1));
  for similar_question in select * from public.find_similar_questions(target.text, target.category_id, option_values, target.id) loop
    if similar_question.is_exact and target.previous_wave_id is null then raise exception 'exact_duplicate' using errcode='P0001'; end if;
    if similar_question.similarity >= settings.high_similarity and target.previous_wave_id is null then raise exception 'high_similarity' using errcode='P0001'; end if;
    if similar_question.similarity >= settings.medium_similarity and not confirmed_medium_similarity then raise exception 'similarity_confirmation_required' using errcode='P0001'; end if;
    if similar_question.similarity >= settings.medium_similarity then
      insert into public.question_duplicate_reviews(question_id, similar_question_id, similarity, confirmed_by)
      values(target.id, similar_question.question_id, similar_question.similarity, current_user_id) on conflict do nothing;
    end if;
  end loop;
  update public.questions set status='published', published_at=now(),
    duplicate_confirmed_at=case when confirmed_medium_similarity then now() else null end where id=target.id;
end;
$$;

alter table public.question_settings enable row level security;
alter table public.question_forbidden_terms enable row level security;
alter table public.question_series enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.tags enable row level security;
alter table public.question_tags enable row level security;
alter table public.question_duplicate_reviews enable row level security;

create policy questions_select_visible on public.questions for select to authenticated using (
  (author_id=auth.uid()) or (status='published' and public.is_active_user())
);
create policy options_select_visible on public.question_options for select to authenticated using (
  exists(select 1 from public.questions q where q.id=question_id and (q.author_id=auth.uid() or (q.status='published' and public.is_active_user())))
);
create policy tags_select_active on public.tags for select to authenticated using (public.is_active_user());
create policy question_tags_select_visible on public.question_tags for select to authenticated using (
  exists(select 1 from public.questions q where q.id=question_id and (q.author_id=auth.uid() or (q.status='published' and public.is_active_user())))
);
create policy series_select_own on public.question_series for select to authenticated using (creator_id=auth.uid());
create policy duplicate_reviews_select_own on public.question_duplicate_reviews for select to authenticated using (confirmed_by=auth.uid());

revoke all on public.question_settings, public.question_forbidden_terms, public.question_series, public.questions, public.question_options,
  public.tags, public.question_tags, public.question_duplicate_reviews from anon, authenticated;
grant select on public.question_series, public.questions, public.question_options, public.tags, public.question_tags,
  public.question_duplicate_reviews to authenticated;
revoke all on function public.save_question_draft(uuid,text,uuid,text[],text[],smallint,smallint,uuid) from public;
revoke all on function public.publish_question(uuid,boolean) from public;
revoke all on function public.find_similar_questions(text,uuid,text[],uuid) from public;
grant execute on function public.save_question_draft(uuid,text,uuid,text[],text[],smallint,smallint,uuid) to authenticated;
grant execute on function public.publish_question(uuid,boolean) to authenticated;
grant execute on function public.find_similar_questions(text,uuid,text[],uuid) to authenticated;
