begin;

-- Question publication is intentionally open for active members. The RPC keeps
-- structural and taxonomy invariants, but performs no content, duplicate,
-- similarity, or product-quota moderation.
create or replace function public.save_question_draft(
  requested_question_id uuid,
  requested_text text,
  requested_category_id uuid,
  requested_options text[],
  requested_tags text[],
  requested_min_age smallint,
  requested_max_age smallint,
  requested_previous_wave_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  draft_id uuid;
  series uuid;
  settings public.question_settings%rowtype;
  option_value text;
  pos integer := 0;
begin
  requested_options := coalesce(requested_options, array[]::text[]);
  requested_tags := coalesce(requested_tags, array[]::text[]);

  if current_user_id is null or not public.is_active_user(current_user_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select * into settings from public.question_settings where singleton;

  if requested_text is null
    or char_length(trim(requested_text)) not between 10 and settings.question_max_length then
    raise exception 'invalid_question' using errcode = 'P0001';
  end if;
  if cardinality(requested_options) not between 2 and 6
    or exists(
      select 1 from unnest(requested_options) value
      where value is null or char_length(trim(value)) not between 1 and settings.option_max_length
    ) then
    raise exception 'invalid_options' using errcode = 'P0001';
  end if;
  if (
    select count(distinct public.normalize_question_text(value))
    from unnest(requested_options) value
  ) <> cardinality(requested_options) then
    raise exception 'duplicate_options' using errcode = 'P0001';
  end if;
  if requested_min_age is not null and requested_min_age not between 18 and 120
    or requested_max_age is not null and requested_max_age not between 18 and 120
    or requested_min_age is not null and requested_max_age is not null and requested_min_age > requested_max_age then
    raise exception 'invalid_age_range' using errcode = 'P0001';
  end if;
  if not exists(
    select 1 from public.categories
    where id = requested_category_id and is_active
  ) then
    raise exception 'invalid_category' using errcode = 'P0001';
  end if;
  if cardinality(requested_tags) > 3
    or (
      select count(distinct lower(trim(value))) from unnest(requested_tags) value
    ) <> cardinality(requested_tags)
    or exists(
      select 1
      from unnest(requested_tags) requested(value)
      where requested.value is null
        or not exists(
          select 1
          from public.tags t
          join public.category_tags ct
            on ct.tag_id = t.id and ct.category_id = requested_category_id
          where t.is_active
            and (
              lower(t.name) = lower(trim(requested.value))
              or t.slug = lower(trim(requested.value))
            )
        )
    ) then
    raise exception 'invalid_tags' using errcode = 'P0001';
  end if;

  if requested_question_id is not null then
    select q.id, q.series_id
    into draft_id, series
    from public.questions q
    where q.id = requested_question_id
      and q.author_id = current_user_id
      and q.status = 'draft'
    for update;
    if draft_id is null then
      raise exception 'draft_unavailable' using errcode = 'P0001';
    end if;
  elsif requested_previous_wave_id is not null then
    select q.series_id
    into series
    from public.questions q
    where q.id = requested_previous_wave_id
      and q.author_id = current_user_id
      and q.status = 'published';
    if series is null then
      raise exception 'wave_unavailable' using errcode = 'P0001';
    end if;
  else
    insert into public.question_series(creator_id)
    values(current_user_id)
    returning id into series;
  end if;

  if draft_id is null then
    insert into public.questions(
      author_id, category_id, series_id, previous_wave_id, text, normalized_text,
      target_min_age, target_max_age
    )
    values(
      current_user_id, requested_category_id, series, requested_previous_wave_id,
      trim(requested_text), public.normalize_question_text(requested_text),
      requested_min_age, requested_max_age
    )
    returning id into draft_id;
  else
    update public.questions
    set category_id = requested_category_id,
        text = trim(requested_text),
        normalized_text = public.normalize_question_text(requested_text),
        target_min_age = requested_min_age,
        target_max_age = requested_max_age
    where id = draft_id;

    delete from public.question_options where question_id = draft_id;
    delete from public.question_tags where question_id = draft_id;
  end if;

  foreach option_value in array requested_options loop
    pos := pos + 1;
    insert into public.question_options(question_id, position, text, normalized_text)
    values(
      draft_id,
      pos,
      trim(option_value),
      public.normalize_question_text(option_value)
    );
  end loop;

  insert into public.question_tags(question_id, tag_id)
  select draft_id, t.id
  from public.tags t
  join public.category_tags ct
    on ct.tag_id = t.id and ct.category_id = requested_category_id
  join unnest(requested_tags) requested(value)
    on lower(t.name) = lower(trim(requested.value))
    or t.slug = lower(trim(requested.value))
  where t.is_active
  on conflict do nothing;

  return draft_id;
end;
$$;

create or replace function public.publish_question(
  requested_question_id uuid,
  confirmed_medium_similarity boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target public.questions%rowtype;
  settings public.question_settings%rowtype;
  option_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  select *
  into target
  from public.questions
  where id = requested_question_id
    and author_id = current_user_id
    and status = 'draft'
  for update;

  if target.id is null or not public.is_active_user(current_user_id) then
    raise exception 'draft_unavailable' using errcode = 'P0001';
  end if;

  select * into settings from public.question_settings where singleton;
  select count(*) into option_count
  from public.question_options
  where question_id = target.id;

  if char_length(target.text) not between 10 and settings.question_max_length
    or option_count not between 2 and 6
    or exists(
      select 1
      from public.question_options
      where question_id = target.id
        and char_length(text) not between 1 and settings.option_max_length
    )
    or (select count(*) from public.question_tags where question_id = target.id) > 3
    or not exists(
      select 1 from public.categories
      where id = target.category_id and is_active
    ) then
    raise exception 'invalid_question' using errcode = 'P0001';
  end if;

  update public.questions
  set status = 'published',
      moderation_status = 'clear',
      published_at = now(),
      duplicate_confirmed_at = null
  where id = target.id;
end;
$$;

create index if not exists reports_question_status_created_idx
  on public.reports(question_id, status, created_at, id)
  where question_id is not null;

drop function if exists public.get_moderation_queue(public.report_status, integer);
create function public.get_moderation_queue(
  requested_status public.report_status default 'pending',
  requested_limit integer default 50
)
returns table(
  report_id uuid,
  target_type public.report_target_type,
  target_id uuid,
  reason public.report_reason,
  details text,
  status public.report_status,
  created_at timestamptz,
  target_excerpt text,
  report_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  return query
  with filtered_reports as (
    select r.*
    from public.reports r
    where (
      requested_status in ('pending', 'reviewing')
      and r.status in ('pending', 'reviewing')
    ) or (
      requested_status not in ('pending', 'reviewing')
      and r.status = requested_status
    )
  ), question_groups as (
    select
      r.question_id,
      count(*)::bigint grouped_report_count
    from filtered_reports r
    where r.target_type = 'question' and r.question_id is not null
    group by r.question_id
    having count(distinct r.reporter_id) >= 3
      or requested_status not in ('pending', 'reviewing')
  ), question_rows as (
    select
      representative.id report_id,
      representative.target_type,
      representative.question_id target_id,
      representative.reason,
      representative.details,
      representative.status,
      representative.created_at,
      groups.grouped_report_count report_count
    from question_groups groups
    cross join lateral (
      select r.*
      from filtered_reports r
      where r.question_id = groups.question_id
      order by r.created_at, r.id
      limit 1
    ) representative
  ), comment_rows as (
    select
      r.id report_id,
      r.target_type,
      r.comment_id target_id,
      r.reason,
      r.details,
      r.status,
      r.created_at,
      1::bigint report_count
    from filtered_reports r
    where r.target_type = 'comment' and r.comment_id is not null
  ), queue as (
    select * from question_rows
    union all
    select * from comment_rows
  )
  select
    queue.report_id,
    queue.target_type,
    queue.target_id,
    queue.reason,
    queue.details,
    queue.status,
    queue.created_at,
    case
      when queue.target_type = 'question' then q.text
      else c.body
    end,
    queue.report_count
  from queue
  left join public.questions q
    on queue.target_type = 'question' and q.id = queue.target_id
  left join public.comments c
    on queue.target_type = 'comment' and c.id = queue.target_id
  order by queue.created_at
  limit least(greatest(requested_limit, 1), 100);
end;
$$;

create or replace function public.moderate_report(
  requested_report_id uuid,
  requested_action public.moderation_action_type,
  requested_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  item public.reports%rowtype;
  case_id uuid;
  old_state jsonb;
  new_state jsonb;
  target uuid;
  active_reporters integer := 0;
  affected_reports integer := 0;
begin
  if not public.is_moderator()
    or char_length(trim(requested_reason)) not between 5 and 500 then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select * into item
  from public.reports
  where id = requested_report_id
  for update;

  if item.id is null then
    raise exception 'report_unavailable' using errcode = 'P0001';
  end if;

  target := coalesce(item.question_id, item.comment_id);

  if item.target_type = 'question'
    and item.status in ('pending', 'reviewing') then
    perform 1
    from public.reports r
    where r.question_id = item.question_id
      and r.status in ('pending', 'reviewing')
    for update;

    select count(distinct r.reporter_id)
    into active_reporters
    from public.reports r
    where r.question_id = item.question_id
      and r.status in ('pending', 'reviewing');

    if active_reporters < 3 then
      raise exception 'report_threshold_not_met' using errcode = 'P0001';
    end if;
  end if;

  insert into public.moderation_cases(report_id, status, assigned_to)
  values(item.id, 'in_review', actor)
  on conflict(report_id) do update
    set status = 'in_review', assigned_to = actor
  returning id into case_id;

  if item.target_type = 'question' then
    select jsonb_build_object(
      'status', q.status,
      'moderation_status', q.moderation_status
    )
    into old_state
    from public.questions q
    where q.id = item.question_id
    for update;

    if requested_action = 'limit_question' then
      update public.questions
      set status = 'limited', moderation_status = 'flagged'
      where id = item.question_id;
    elsif requested_action = 'remove_question' then
      update public.questions
      set status = 'removed', moderation_status = 'rejected'
      where id = item.question_id;
    elsif requested_action = 'restore_question' then
      update public.questions
      set status = 'published', moderation_status = 'approved'
      where id = item.question_id;
    elsif requested_action <> 'no_action' then
      raise exception 'invalid_action' using errcode = 'P0001';
    end if;

    select jsonb_build_object(
      'status', q.status,
      'moderation_status', q.moderation_status
    )
    into new_state
    from public.questions q
    where q.id = item.question_id;
  else
    select jsonb_build_object('moderation_status', c.moderation_status)
    into old_state
    from public.comments c
    where c.id = item.comment_id
    for update;

    if requested_action = 'hide_comment' then
      update public.comments
      set moderation_status = 'hidden'
      where id = item.comment_id;
    elsif requested_action = 'remove_comment' then
      update public.comments
      set moderation_status = 'removed'
      where id = item.comment_id;
    elsif requested_action = 'restore_comment' then
      update public.comments
      set moderation_status = 'visible'
      where id = item.comment_id;
    elsif requested_action <> 'no_action' then
      raise exception 'invalid_action' using errcode = 'P0001';
    end if;

    select jsonb_build_object('moderation_status', c.moderation_status)
    into new_state
    from public.comments c
    where c.id = item.comment_id;
  end if;

  if item.target_type = 'question'
    and item.status in ('pending', 'reviewing') then
    update public.reports
    set status = case
          when requested_action = 'no_action' then 'dismissed'::public.report_status
          else 'resolved'::public.report_status
        end,
        updated_at = now()
    where question_id = item.question_id
      and status in ('pending', 'reviewing');
  elsif item.target_type = 'question' and requested_action = 'no_action' then
    update public.reports
    set status = 'dismissed', updated_at = now()
    where question_id = item.question_id and status = item.status;
  else
    update public.reports
    set status = case
          when requested_action = 'no_action' then 'dismissed'::public.report_status
          else 'resolved'::public.report_status
        end,
        updated_at = now()
    where id = item.id;
  end if;
  get diagnostics affected_reports = row_count;

  update public.moderation_cases
  set status = 'resolved',
      resolution = requested_action,
      resolved_at = now()
  where id = case_id;

  insert into public.moderation_actions(
    case_id, actor_id, action, target_type, target_id,
    previous_state, new_state, reason
  )
  values(
    case_id, actor, requested_action, item.target_type, target,
    old_state, new_state, trim(requested_reason)
  );

  insert into public.audit_log(actor_id, action, target_type, target_id, metadata)
  values(
    actor,
    'moderate_report',
    item.target_type::text,
    target,
    jsonb_build_object(
      'report_id', item.id,
      'report_count', affected_reports,
      'decision', requested_action
    )
  );
end;
$$;

-- A report is a private signal to the administrator, not an automatic ranking
-- penalty. Only an explicit moderation status changes global eligibility.
create or replace function public.discover_questions(
  requested_user_id uuid,
  requested_mode public.discovery_mode,
  requested_query text default null,
  requested_category_slug text default null,
  requested_snapshot timestamptz default now(),
  requested_offset integer default 0,
  requested_limit integer default 12
)
returns table(
  question_id uuid,
  question_text text,
  category_slug text,
  category_name text,
  author_username text,
  author_verified boolean,
  published_at timestamptz,
  tags jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select
      q.id,
      q.text,
      q.normalized_text,
      q.published_at,
      q.author_id,
      c.slug,
      c.name category_name,
      p.username,
      p.account_type = 'verified' author_verified,
      coalesce((
        select jsonb_agg(t.name order by t.name)
        from public.question_tags qt
        join public.tags t on t.id = qt.tag_id
        where qt.question_id = q.id
      ), '[]'::jsonb) tags,
      case
        when requested_mode = 'search' and nullif(trim(requested_query), '') is not null
        then ts_rank_cd(
          to_tsvector('french', q.text),
          websearch_to_tsquery('french', trim(requested_query))
        ) + case
          when q.normalized_text operator(extensions.%) public.normalize_question_text(requested_query)
          then extensions.similarity(
            q.normalized_text,
            public.normalize_question_text(requested_query)
          )
          else 0
        end
        else 0
      end relevance,
      (
        select count(*) from public.votes v
        where v.question_id = q.id
          and v.created_at >= requested_snapshot - interval '7 days'
      ) votes_7d,
      (
        select count(*) from public.question_upvotes u
        where u.question_id = q.id
          and u.created_at >= requested_snapshot - interval '7 days'
      ) upvotes_7d,
      (
        select count(*) from public.question_follows f
        where f.question_id = q.id
          and f.created_at >= requested_snapshot - interval '7 days'
      ) follows_7d
    from public.questions q
    join public.categories c on c.id = q.category_id
    join public.profiles p on p.user_id = q.author_id
    where public.is_active_user(requested_user_id)
      and q.status = 'published'
      and q.moderation_status in ('clear', 'approved')
      and q.published_at <= requested_snapshot
      and (requested_category_slug is null or c.slug = requested_category_slug)
      and (
        q.target_min_age is null
        or extract(year from current_date)::integer - (
          select birth_year from public.profiles where user_id = requested_user_id
        ) >= q.target_min_age
      )
      and (
        q.target_max_age is null
        or extract(year from current_date)::integer - (
          select birth_year from public.profiles where user_id = requested_user_id
        ) <= q.target_max_age
      )
      and not exists(
        select 1 from public.blocked_users b
        where b.blocker_id = requested_user_id and b.blocked_id = q.author_id
      )
      and (
        requested_mode <> 'search'
        or to_tsvector('french', q.text) @@ websearch_to_tsquery('french', trim(requested_query))
        or q.normalized_text operator(extensions.%) public.normalize_question_text(requested_query)
        or exists(
          select 1
          from public.question_tags qt
          join public.tags t on t.id = qt.tag_id
          where qt.question_id = q.id
            and lower(t.name) operator(extensions.%) lower(trim(requested_query))
        )
        or lower(c.name) operator(extensions.%) lower(trim(requested_query))
        or (
          p.account_type = 'verified'
          and lower(p.username) operator(extensions.%) lower(trim(requested_query))
        )
      )
  ), scored as (
    select
      *,
      (votes_7d + upvotes_7d * 2 + follows_7d * 1.5)
        / sqrt(greatest(extract(epoch from (requested_snapshot - published_at)) / 3600, 12))
        trending_score
    from eligible
  )
  select id, text, slug, category_name, username, author_verified, published_at, tags
  from scored
  order by
    case when requested_mode = 'search' then relevance end desc,
    case when requested_mode = 'trending' then trending_score end desc,
    published_at desc,
    id
  offset least(greatest(requested_offset, 0), 500)
  limit least(greatest(requested_limit, 1), 24);
$$;

revoke all on function public.save_question_draft(uuid, text, uuid, text[], text[], smallint, smallint, uuid) from public;
revoke all on function public.save_question_draft(uuid, text, uuid, text[], text[], smallint, smallint, uuid) from anon;
revoke all on function public.publish_question(uuid, boolean) from public;
revoke all on function public.publish_question(uuid, boolean) from anon;
revoke all on function public.get_moderation_queue(public.report_status, integer) from public;
revoke all on function public.get_moderation_queue(public.report_status, integer) from anon;
revoke all on function public.moderate_report(uuid, public.moderation_action_type, text) from public;
revoke all on function public.moderate_report(uuid, public.moderation_action_type, text) from anon;
revoke all on function public.discover_questions(uuid, public.discovery_mode, text, text, timestamptz, integer, integer) from public;
revoke all on function public.discover_questions(uuid, public.discovery_mode, text, text, timestamptz, integer, integer) from anon, authenticated;

grant execute on function public.save_question_draft(uuid, text, uuid, text[], text[], smallint, smallint, uuid) to authenticated;
grant execute on function public.publish_question(uuid, boolean) to authenticated;
grant execute on function public.get_moderation_queue(public.report_status, integer) to authenticated;
grant execute on function public.moderate_report(uuid, public.moderation_action_type, text) to authenticated;
grant execute on function public.discover_questions(uuid, public.discovery_mode, text, text, timestamptz, integer, integer) to service_role;

commit;
