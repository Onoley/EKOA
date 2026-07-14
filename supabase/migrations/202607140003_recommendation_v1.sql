-- Recommendation V1: stable sessions, bounded reservations and explainable ranking decisions.
-- A fast skip is derived from an existing skip plus a dwell event below 1,500 ms;
-- no duplicate client event type is introduced.

create table public.user_question_controls (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  hidden_at timestamptz,
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(user_id,question_id),
  constraint user_question_controls_action check(hidden_at is not null or archived_at is not null)
);
create index user_question_controls_user_idx on public.user_question_controls(user_id,updated_at desc);

create table public.feed_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  feed public.feed_type not null,
  category_slug text,
  ranking_version text not null check(ranking_version ~ '^v[0-9]+$'),
  experiment_variant text not null default 'control' check(char_length(experiment_variant) between 1 and 40),
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  constraint feed_sessions_expiration check(expires_at>started_at)
);
create index feed_sessions_user_activity_idx on public.feed_sessions(user_id,last_activity_at desc) where ended_at is null;

create table public.feed_reservations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.feed_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  position integer not null check(position>=0),
  source_pool text not null check(source_pool in('explicit','learned','neighbor','exploration','editorial','sponsored')),
  final_score numeric(6,2) not null check(final_score between 0 and 100),
  score_components jsonb not null check(jsonb_typeof(score_components)='object'),
  applied_constraints jsonb not null default '[]'::jsonb check(jsonb_typeof(applied_constraints)='array'),
  relaxed_constraints jsonb not null default '[]'::jsonb check(jsonb_typeof(relaxed_constraints)='array'),
  ranking_version text not null check(ranking_version ~ '^v[0-9]+$'),
  experiment_variant text not null default 'control',
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique(session_id,question_id),
  unique(session_id,position)
);
create index feed_reservations_session_position_idx on public.feed_reservations(session_id,position);
create index feed_reservations_user_question_idx on public.feed_reservations(user_id,question_id,reserved_at desc);
create index feed_reservations_expiration_idx on public.feed_reservations(expires_at);

alter table public.feed_impressions
  add column session_id uuid references public.feed_sessions(id) on delete set null,
  add column source_pool text,
  add column ranking_score numeric(6,2),
  add column ranking_version text,
  add column score_components jsonb,
  add column experiment_variant text;
create index feed_impressions_user_question_shown_idx on public.feed_impressions(user_id,question_id,shown_at desc);

create function public.attach_feed_ranking_decision()
returns trigger language plpgsql security definer set search_path='' as $$
declare decision public.feed_reservations%rowtype;
begin
  select * into decision from public.feed_reservations
  where session_id=new.request_id and user_id=new.user_id and question_id=new.question_id;
  if decision.id is not null then
    new.session_id:=decision.session_id;
    new.source_pool:=decision.source_pool;
    new.ranking_score:=decision.final_score;
    new.ranking_version:=decision.ranking_version;
    new.score_components:=decision.score_components;
    new.experiment_variant:=decision.experiment_variant;
  end if;
  return new;
end;$$;
create trigger feed_impressions_attach_ranking before insert on public.feed_impressions
for each row execute function public.attach_feed_ranking_decision();

alter table public.user_question_controls enable row level security;
alter table public.feed_sessions enable row level security;
alter table public.feed_reservations enable row level security;
revoke all on public.user_question_controls,public.feed_sessions,public.feed_reservations from anon,authenticated;

create function public.get_recommendation_candidates_v1(
  requested_user_id uuid,
  requested_feed public.feed_type,
  requested_category_slug text,
  requested_session_id uuid,
  requested_snapshot timestamptz,
  requested_limit integer default 300
)
returns table(
  question_id uuid,question_text text,author_id uuid,author_username text,author_verified boolean,
  category_id uuid,category_slug text,category_name text,universe_id uuid,universe_slug text,published_at timestamptz,
  options jsonb,tags jsonb,sensitivity text,question_format text,editorial_type text,publication_priority integer,target_min_age integer,target_max_age integer,is_active boolean,moderation_eligible boolean,sponsor_eligible boolean,
  vote_count integer,upvote_count integer,comment_count bigint,report_count integer,impression_count integer,fast_skip_count bigint,
  followed_category boolean,followed_author boolean,initially_followed boolean,last_shown_at timestamptz,
  sponsored_by text,source_pool text
)
language sql stable security definer set search_path='' as $$
  with actor as (
    select p.user_id,p.birth_year from public.profiles p
    where p.user_id=requested_user_id and p.account_status='active'
  ), base as (
    select q.*,c.slug category_slug,c.name category_name,c.universe_id,u.slug universe_slug,
      p.username,p.account_type='verified' author_verified,
      exists(select 1 from public.category_follows cf where cf.user_id=requested_user_id and cf.category_id=q.category_id) followed_category,
      exists(select 1 from public.verified_account_follows vf where vf.follower_id=requested_user_id and vf.followed_id=q.author_id) followed_author,
      exists(select 1 from public.question_follows qf where qf.user_id=requested_user_id and qf.question_id=q.id) initially_followed,
      (select max(fi.shown_at) from public.feed_impressions fi where fi.user_id=requested_user_id and fi.question_id=q.id) last_shown,
      sc.id sponsor_campaign_id,so.legal_name sponsored_name
    from public.questions q
    join public.categories c on c.id=q.category_id and c.is_active
    join public.universes u on u.id=c.universe_id and u.is_active
    join public.profiles p on p.user_id=q.author_id and p.account_status='active'
    cross join actor a
    left join public.sponsor_campaigns sc on sc.question_id=q.id and sc.status='active' and requested_snapshot between sc.starts_at and sc.ends_at
    left join public.sponsor_organisations so on so.id=sc.sponsor_id
    where q.status='published' and q.moderation_status in('clear','approved') and q.published_at<=requested_snapshot
      and (requested_category_slug is null or c.slug=requested_category_slug)
      and not exists(select 1 from public.votes v where v.user_id=requested_user_id and v.question_id=q.id)
      and not exists(select 1 from public.user_question_controls uqc where uqc.user_id=requested_user_id and uqc.question_id=q.id)
      and not exists(select 1 from public.reports r where r.reporter_id=requested_user_id and r.question_id=q.id and r.status in('pending','reviewing'))
      and not exists(select 1 from public.blocked_users bu where bu.blocker_id=requested_user_id and bu.blocked_id=q.author_id)
      and not exists(select 1 from public.feed_reservations fr where fr.session_id=requested_session_id and fr.question_id=q.id)
      and (q.target_min_age is null or extract(year from current_date)::integer-a.birth_year>=q.target_min_age)
      and (q.target_max_age is null or extract(year from current_date)::integer-a.birth_year<=q.target_max_age)
      and not exists(select 1 from public.sponsor_campaigns inactive where inactive.question_id=q.id and not(inactive.status='active' and requested_snapshot between inactive.starts_at and inactive.ends_at))
      and (requested_feed='for_you' or exists(select 1 from public.category_follows cf where cf.user_id=requested_user_id and cf.category_id=q.category_id)
        or exists(select 1 from public.verified_account_follows vf where vf.follower_id=requested_user_id and vf.followed_id=q.author_id))
  ), pooled as (
    select b.*,
      case when sponsor_campaign_id is not null then 'sponsored'
        when followed_category or followed_author then 'explicit'
        when exists(select 1 from public.interaction_events ie join public.questions iq on iq.id=ie.question_id where ie.user_id=requested_user_id and iq.category_id=b.category_id and ie.event_type in('answer','upvote','comment') and ie.occurred_at>requested_snapshot-interval '90 days') then 'learned'
        when exists(select 1 from public.category_follows cf join public.categories fc on fc.id=cf.category_id where cf.user_id=requested_user_id and fc.universe_id=b.universe_id) then 'neighbor'
        when b.impression_count<50 then 'exploration' else 'editorial' end source
    from base b
  ), ranked_pools as (
    select pooled.*,row_number() over(partition by source order by publication_priority desc,impression_count asc,published_at desc,id) pool_rank
    from pooled
  )
  select b.id,b.text,b.author_id,b.username,b.author_verified,b.category_id,b.category_slug,b.category_name,b.universe_id,b.universe_slug,b.published_at,
    (select jsonb_agg(jsonb_build_object('id',qo.id,'text',qo.text) order by qo.position) from public.question_options qo where qo.question_id=b.id),
    coalesce((select jsonb_agg(t.slug order by t.slug) from public.question_tags qt join public.tags t on t.id=qt.tag_id where qt.question_id=b.id and t.is_active),'[]'::jsonb),
    coalesce(b.sensitivity::text,'low'),coalesce(b.question_format::text,'opinion'),coalesce(b.editorial_type::text,'evergreen'),b.publication_priority,b.target_min_age::integer,b.target_max_age::integer,true,true,true,
    b.vote_count,b.upvote_count,(select count(*) from public.comments cm where cm.question_id=b.id and cm.moderation_status='visible'),b.report_count,b.impression_count,
    (select count(*) from public.interaction_events ie where ie.question_id=b.id and ie.event_type='skip' and exists(select 1 from public.interaction_events dwell where dwell.impression_id=ie.impression_id and dwell.event_type='dwell' and dwell.dwell_ms<1500)),
    b.followed_category,b.followed_author,b.initially_followed,b.last_shown,b.sponsored_name,b.source
  from ranked_pools b
  where b.pool_rank<=case b.source when 'explicit' then 90 when 'learned' then 60 when 'neighbor' then 50 when 'exploration' then 60 when 'editorial' then 30 else 10 end
  order by case b.source when 'explicit' then 1 when 'learned' then 2 when 'neighbor' then 3 when 'exploration' then 4 when 'editorial' then 5 else 6 end,
    b.publication_priority desc,b.impression_count asc,b.published_at desc,b.id
  limit least(greatest(requested_limit,1),500);
$$;

create function public.reserve_feed_items_v1(requested_user_id uuid,requested_session_id uuid,requested_items jsonb,requested_ttl_minutes integer default 30)
returns table(question_id uuid,position integer)
language plpgsql security definer set search_path='' as $$
declare session_row public.feed_sessions%rowtype;item jsonb;next_position integer;
begin
  if auth.role()<>'service_role' or jsonb_typeof(requested_items)<>'array' or jsonb_array_length(requested_items)>20 or requested_ttl_minutes not between 5 and 120 then raise exception 'invalid_reservation' using errcode='P0001';end if;
  select * into session_row from public.feed_sessions where id=requested_session_id and user_id=requested_user_id and ended_at is null and expires_at>now() for update;
  if session_row.id is null then raise exception 'session_unavailable' using errcode='P0001';end if;
  select coalesce(max(fr.position)+1,0) into next_position from public.feed_reservations fr where fr.session_id=requested_session_id;
  for item in select value from jsonb_array_elements(requested_items) loop
    if not exists(
      select 1 from public.questions q
      join public.categories c on c.id=q.category_id and c.is_active
      join public.universes u on u.id=c.universe_id and u.is_active
      join public.profiles author on author.user_id=q.author_id and author.account_status='active'
      join public.profiles actor on actor.user_id=requested_user_id and actor.account_status='active'
      where q.id=(item->>'questionId')::uuid and q.status='published' and q.moderation_status in('clear','approved')
        and (q.target_min_age is null or extract(year from current_date)::integer-actor.birth_year>=q.target_min_age)
        and (q.target_max_age is null or extract(year from current_date)::integer-actor.birth_year<=q.target_max_age)
    )
      or exists(select 1 from public.votes v where v.user_id=requested_user_id and v.question_id=(item->>'questionId')::uuid)
      or exists(select 1 from public.user_question_controls uqc where uqc.user_id=requested_user_id and uqc.question_id=(item->>'questionId')::uuid)
      or exists(select 1 from public.reports r where r.reporter_id=requested_user_id and r.question_id=(item->>'questionId')::uuid and r.status in('pending','reviewing'))
      or exists(select 1 from public.blocked_users bu join public.questions q on q.author_id=bu.blocked_id where bu.blocker_id=requested_user_id and q.id=(item->>'questionId')::uuid)
      or exists(select 1 from public.feed_reservations fr where fr.session_id=requested_session_id and fr.question_id=(item->>'questionId')::uuid) then continue;end if;
    insert into public.feed_reservations(session_id,user_id,question_id,position,source_pool,final_score,score_components,applied_constraints,relaxed_constraints,ranking_version,experiment_variant,expires_at)
    values(requested_session_id,requested_user_id,(item->>'questionId')::uuid,next_position,item->>'sourcePool',(item->>'finalScore')::numeric,item->'scoreComponents',item->'appliedConstraints',item->'relaxedConstraints',session_row.ranking_version,session_row.experiment_variant,now()+make_interval(mins=>requested_ttl_minutes))
    on conflict(session_id,question_id) do nothing;
    if found then next_position:=next_position+1;end if;
  end loop;
  update public.feed_sessions set last_activity_at=now() where id=requested_session_id;
  return query select fr.question_id,fr.position from public.feed_reservations fr where fr.session_id=requested_session_id order by fr.position;
end;$$;

create function public.get_feed_reservation_page_v1(requested_user_id uuid,requested_session_id uuid,requested_offset integer,requested_limit integer)
returns table(
  question_id uuid,question_text text,author_id uuid,author_username text,author_verified boolean,
  category_id uuid,category_name text,published_at timestamptz,options jsonb,upvote_count integer,
  initially_followed boolean,initially_upvoted boolean,sponsored_by text,position integer,
  source_pool text,final_score numeric,score_components jsonb,ranking_version text,experiment_variant text
)
language sql stable security definer set search_path='' as $$
  select q.id,q.text,q.author_id,p.username,p.account_type='verified',q.category_id,c.name,q.published_at,
    (select jsonb_agg(jsonb_build_object('id',qo.id,'text',qo.text) order by qo.position) from public.question_options qo where qo.question_id=q.id),
    q.upvote_count,
    exists(select 1 from public.question_follows qf where qf.user_id=requested_user_id and qf.question_id=q.id),
    exists(select 1 from public.question_upvotes qu where qu.user_id=requested_user_id and qu.question_id=q.id),
    (select so.legal_name from public.sponsor_campaigns sc join public.sponsor_organisations so on so.id=sc.sponsor_id where sc.question_id=q.id and sc.status='active' and now() between sc.starts_at and sc.ends_at),
    fr.position,fr.source_pool,fr.final_score,fr.score_components,fr.ranking_version,fr.experiment_variant
  from public.feed_reservations fr
  join public.feed_sessions fs on fs.id=fr.session_id and fs.user_id=requested_user_id and fs.ended_at is null
  join public.questions q on q.id=fr.question_id and q.status='published' and q.moderation_status in('clear','approved')
  join public.profiles p on p.user_id=q.author_id and p.account_status='active'
  join public.categories c on c.id=q.category_id and c.is_active
  join public.universes u on u.id=c.universe_id and u.is_active
  join public.profiles actor on actor.user_id=requested_user_id and actor.account_status='active'
  where fr.session_id=requested_session_id and fr.position>=requested_offset and fr.expires_at>now()
    and not exists(select 1 from public.votes v where v.user_id=requested_user_id and v.question_id=q.id)
    and not exists(select 1 from public.user_question_controls uqc where uqc.user_id=requested_user_id and uqc.question_id=q.id)
    and not exists(select 1 from public.reports r where r.reporter_id=requested_user_id and r.question_id=q.id and r.status in('pending','reviewing'))
    and not exists(select 1 from public.blocked_users bu where bu.blocker_id=requested_user_id and bu.blocked_id=q.author_id)
    and (q.target_min_age is null or extract(year from current_date)::integer-actor.birth_year>=q.target_min_age)
    and (q.target_max_age is null or extract(year from current_date)::integer-actor.birth_year<=q.target_max_age)
  order by fr.position limit least(greatest(requested_limit,1),20);
$$;

create function public.get_feed_session_history_v1(requested_user_id uuid,requested_session_id uuid)
returns table(question_id uuid,category_id uuid,category_slug text,universe_id uuid,universe_slug text,tags jsonb,sensitivity text,question_format text,is_sponsored boolean)
language sql stable security definer set search_path='' as $$
  select q.id,q.category_id,c.slug,c.universe_id,u.slug,
    coalesce((select jsonb_agg(t.slug order by t.slug) from public.question_tags qt join public.tags t on t.id=qt.tag_id where qt.question_id=q.id),'[]'::jsonb),
    coalesce(q.sensitivity::text,'low'),coalesce(q.question_format::text,'opinion'),
    exists(select 1 from public.sponsor_campaigns sc where sc.question_id=q.id and sc.status='active' and now() between sc.starts_at and sc.ends_at)
  from public.feed_reservations fr join public.feed_sessions fs on fs.id=fr.session_id and fs.user_id=requested_user_id
  join public.questions q on q.id=fr.question_id join public.categories c on c.id=q.category_id join public.universes u on u.id=c.universe_id
  where fr.session_id=requested_session_id order by fr.position;
$$;

revoke all on function public.get_recommendation_candidates_v1(uuid,public.feed_type,text,uuid,timestamptz,integer) from public;
revoke all on function public.reserve_feed_items_v1(uuid,uuid,jsonb,integer) from public;
revoke all on function public.get_feed_reservation_page_v1(uuid,uuid,integer,integer) from public;
revoke all on function public.get_feed_session_history_v1(uuid,uuid) from public;
grant execute on function public.get_recommendation_candidates_v1(uuid,public.feed_type,text,uuid,timestamptz,integer) to service_role;
grant execute on function public.reserve_feed_items_v1(uuid,uuid,jsonb,integer) to service_role;
grant execute on function public.get_feed_reservation_page_v1(uuid,uuid,integer,integer) to service_role;
grant execute on function public.get_feed_session_history_v1(uuid,uuid) to service_role;

create function public.cleanup_feed_recommendation_v1()
returns bigint language plpgsql security definer set search_path='' as $$
declare deleted_count bigint;
begin
  if auth.role()<>'service_role' then raise exception 'maintenance_denied' using errcode='P0001';end if;
  delete from public.feed_sessions where expires_at<now() or (ended_at is not null and ended_at<now()-interval '1 day');
  get diagnostics deleted_count=row_count;
  return deleted_count;
end;$$;
revoke all on function public.cleanup_feed_recommendation_v1() from public;
grant execute on function public.cleanup_feed_recommendation_v1() to service_role;
