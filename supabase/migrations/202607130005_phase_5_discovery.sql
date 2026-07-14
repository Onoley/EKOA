create type public.discovery_mode as enum ('search', 'recent', 'trending');

create index questions_text_fts_idx on public.questions using gin (to_tsvector('french', text));
create index tags_name_trgm_idx on public.tags using gin (lower(name) extensions.gin_trgm_ops);
create index categories_name_trgm_idx on public.categories using gin (lower(name) extensions.gin_trgm_ops);
create index profiles_username_trgm_idx on public.profiles using gin (lower(username) extensions.gin_trgm_ops) where username is not null;
create index question_tags_tag_question_idx on public.question_tags(tag_id, question_id);
create index votes_question_created_idx on public.votes(question_id, created_at desc);
create index question_upvotes_question_created_idx on public.question_upvotes(question_id, created_at desc);
create index question_follows_question_created_idx on public.question_follows(question_id, created_at desc);

create function public.discover_questions(
  requested_user_id uuid,
  requested_mode public.discovery_mode,
  requested_query text default null,
  requested_category_slug text default null,
  requested_snapshot timestamptz default now(),
  requested_offset integer default 0,
  requested_limit integer default 12
)
returns table(
  question_id uuid, question_text text, category_slug text, category_name text,
  author_username text, author_verified boolean, published_at timestamptz, tags jsonb
)
language sql stable security definer set search_path='' as $$
  with eligible as (
    select q.id,q.text,q.normalized_text,q.published_at,q.report_count,q.author_id,
      c.slug,c.name category_name,p.username,p.account_type='verified' author_verified,
      coalesce((select jsonb_agg(t.name order by t.name) from public.question_tags qt join public.tags t on t.id=qt.tag_id where qt.question_id=q.id),'[]'::jsonb) tags,
      case when requested_mode='search' and nullif(trim(requested_query),'') is not null
        then ts_rank_cd(to_tsvector('french',q.text),websearch_to_tsquery('french',trim(requested_query)))
          + case when q.normalized_text operator(extensions.%) public.normalize_question_text(requested_query) then extensions.similarity(q.normalized_text,public.normalize_question_text(requested_query)) else 0 end
        else 0 end relevance,
      (select count(*) from public.votes v where v.question_id=q.id and v.created_at>=requested_snapshot-interval '7 days') votes_7d,
      (select count(*) from public.question_upvotes u where u.question_id=q.id and u.created_at>=requested_snapshot-interval '7 days') upvotes_7d,
      (select count(*) from public.question_follows f where f.question_id=q.id and f.created_at>=requested_snapshot-interval '7 days') follows_7d
    from public.questions q
    join public.categories c on c.id=q.category_id
    join public.profiles p on p.user_id=q.author_id
    where public.is_active_user(requested_user_id)
      and q.status='published' and q.moderation_status in ('clear','approved') and q.published_at<=requested_snapshot
      and (requested_category_slug is null or c.slug=requested_category_slug)
      and (q.target_min_age is null or extract(year from current_date)::integer-(select birth_year from public.profiles where user_id=requested_user_id)>=q.target_min_age)
      and (q.target_max_age is null or extract(year from current_date)::integer-(select birth_year from public.profiles where user_id=requested_user_id)<=q.target_max_age)
      and not exists(select 1 from public.blocked_users b where b.blocker_id=requested_user_id and b.blocked_id=q.author_id)
      and (requested_mode<>'search' or (
        to_tsvector('french',q.text) @@ websearch_to_tsquery('french',trim(requested_query))
        or q.normalized_text operator(extensions.%) public.normalize_question_text(requested_query)
        or exists(select 1 from public.question_tags qt join public.tags t on t.id=qt.tag_id where qt.question_id=q.id and lower(t.name) operator(extensions.%) lower(trim(requested_query)))
        or lower(c.name) operator(extensions.%) lower(trim(requested_query))
        or (p.account_type='verified' and lower(p.username) operator(extensions.%) lower(trim(requested_query)))
      ))
  ), scored as (
    select *, (votes_7d + upvotes_7d*2 + follows_7d*1.5) /
      sqrt(greatest(extract(epoch from (requested_snapshot-published_at))/3600,12)) - report_count*3 trending_score
    from eligible
  )
  select id,text,slug,category_name,username,author_verified,published_at,tags from scored
  order by
    case when requested_mode='search' then relevance end desc,
    case when requested_mode='trending' then trending_score end desc,
    published_at desc,id
  offset least(greatest(requested_offset,0),500)
  limit least(greatest(requested_limit,1),24);
$$;

revoke all on function public.discover_questions(uuid,public.discovery_mode,text,text,timestamptz,integer,integer) from public;
grant execute on function public.discover_questions(uuid,public.discovery_mode,text,text,timestamptz,integer,integer) to service_role;
