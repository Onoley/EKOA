create type public.feed_type as enum ('for_you', 'following');
create type public.interaction_event_type as enum (
  'impression','answer','skip','dwell','upvote','question_follow','question_unfollow',
  'comment','report','category_follow','category_unfollow'
);

create table public.blocked_users (
  blocker_id uuid not null references public.profiles(user_id) on delete cascade,
  blocked_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id, blocked_id),
  check(blocker_id<>blocked_id)
);
create table public.verified_account_follows (
  follower_id uuid not null references public.profiles(user_id) on delete cascade,
  followed_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id, followed_id),
  check(follower_id<>followed_id)
);
create function public.ensure_verified_follow_target()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.profiles where user_id=new.followed_id and account_type='verified' and account_status='active') then
    raise exception 'verified_target_required' using errcode='P0001';
  end if;
  return new;
end; $$;
create trigger verified_account_follow_target before insert on public.verified_account_follows for each row execute function public.ensure_verified_follow_target();

create table public.feed_impressions (
  id uuid primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  feed public.feed_type not null,
  algorithm_version smallint not null check(algorithm_version>0),
  rank smallint not null check(rank>=0),
  request_id uuid not null,
  shown_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index feed_impressions_user_time_idx on public.feed_impressions(user_id, received_at desc);
create index feed_impressions_question_time_idx on public.feed_impressions(question_id, received_at desc);

create table public.interaction_events (
  id uuid primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  event_type public.interaction_event_type not null,
  question_id uuid references public.questions(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  impression_id uuid references public.feed_impressions(id) on delete set null,
  feed public.feed_type,
  algorithm_version smallint,
  occurred_at timestamptz not null,
  dwell_ms integer check(dwell_ms between 0 and 300000),
  received_at timestamptz not null default now(),
  constraint interaction_target check(question_id is not null or category_id is not null)
);
create index interaction_events_user_time_idx on public.interaction_events(user_id, received_at desc);
create index interaction_events_question_time_idx on public.interaction_events(question_id, received_at desc) where question_id is not null;
create index interaction_events_type_time_idx on public.interaction_events(event_type, received_at desc);

create function public.record_authoritative_interaction()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; kind public.interaction_event_type; question uuid; category uuid;
begin
  actor := case when tg_op='DELETE' then old.user_id else new.user_id end;
  if actor is null then actor := auth.uid(); end if;
  if actor is null then if tg_op='DELETE' then return old; else return new; end if; end if;
  if tg_table_name='votes' then kind:='answer'; question:=new.question_id;
  elsif tg_table_name='question_upvotes' then kind:='upvote'; question:=new.question_id;
  elsif tg_table_name='question_follows' then kind:=case when tg_op='DELETE' then 'question_unfollow' else 'question_follow' end; question:=case when tg_op='DELETE' then old.question_id else new.question_id end;
  elsif tg_table_name='category_follows' then kind:=case when tg_op='DELETE' then 'category_unfollow' else 'category_follow' end; category:=case when tg_op='DELETE' then old.category_id else new.category_id end;
  end if;
  insert into public.interaction_events(id,user_id,event_type,question_id,category_id,occurred_at)
  values(gen_random_uuid(),actor,kind,question,category,now());
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
create trigger votes_record_event after insert on public.votes for each row execute function public.record_authoritative_interaction();
create trigger upvotes_record_event after insert on public.question_upvotes for each row execute function public.record_authoritative_interaction();
create trigger question_follows_record_event after insert or delete on public.question_follows for each row execute function public.record_authoritative_interaction();
create trigger category_follows_record_event after insert or delete on public.category_follows for each row execute function public.record_authoritative_interaction();

create function public.record_feed_event(
  requested_event_id uuid, requested_type public.interaction_event_type, requested_question_id uuid,
  requested_impression_id uuid, requested_feed public.feed_type, requested_algorithm_version smallint,
  requested_rank smallint, requested_request_id uuid, requested_occurred_at timestamptz, requested_dwell_ms integer default null
)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); inserted integer;
begin
  if actor is null or not public.is_active_user(actor) or requested_type not in ('impression','skip','dwell') then raise exception 'invalid_event' using errcode='P0001'; end if;
  if requested_occurred_at < now()-interval '24 hours' or requested_occurred_at > now()+interval '5 minutes' then raise exception 'invalid_event_time' using errcode='P0001'; end if;
  if not exists(select 1 from public.questions where id=requested_question_id and status='published' and moderation_status in ('clear','approved')) then raise exception 'question_unavailable' using errcode='P0001'; end if;
  if requested_type='impression' then
    insert into public.feed_impressions(id,user_id,question_id,feed,algorithm_version,rank,request_id,shown_at)
    values(requested_impression_id,actor,requested_question_id,requested_feed,requested_algorithm_version,requested_rank,requested_request_id,requested_occurred_at) on conflict do nothing;
    get diagnostics inserted=row_count;
    if inserted=1 then
      update public.questions set impression_count=impression_count+1 where id=requested_question_id;
      insert into public.interaction_events(id,user_id,event_type,question_id,impression_id,feed,algorithm_version,occurred_at)
      values(requested_event_id,actor,'impression',requested_question_id,requested_impression_id,requested_feed,requested_algorithm_version,requested_occurred_at) on conflict do nothing;
    end if;
  else
    if not exists(select 1 from public.feed_impressions where id=requested_impression_id and user_id=actor and question_id=requested_question_id) then raise exception 'invalid_impression' using errcode='P0001'; end if;
    if requested_type='skip' and exists(select 1 from public.votes where user_id=actor and question_id=requested_question_id) then return; end if;
    insert into public.interaction_events(id,user_id,event_type,question_id,impression_id,feed,algorithm_version,occurred_at,dwell_ms)
    values(requested_event_id,actor,requested_type,requested_question_id,requested_impression_id,requested_feed,requested_algorithm_version,requested_occurred_at,
      case when requested_type='dwell' then least(greatest(coalesce(requested_dwell_ms,0),0),300000) else null end) on conflict do nothing;
  end if;
end; $$;

create function public.get_feed_candidates(requested_user_id uuid, requested_feed public.feed_type, requested_snapshot timestamptz, requested_limit integer default 80)
returns table(
  question_id uuid, question_text text, author_id uuid, author_username text, author_verified boolean,
  category_id uuid, category_name text, published_at timestamptz, options jsonb,
  vote_count integer, upvote_count integer, follow_count integer, report_count integer, impression_count integer,
  followed_category boolean, followed_author boolean, initially_followed boolean
)
language sql stable security definer set search_path='' as $$
  select q.id,q.text,q.author_id,p.username,p.account_type='verified',q.category_id,c.name,q.published_at,
    (select jsonb_agg(jsonb_build_object('id',qo.id,'text',qo.text) order by qo.position) from public.question_options qo where qo.question_id=q.id),
    q.vote_count,q.upvote_count,q.follow_count,q.report_count,q.impression_count,
    exists(select 1 from public.category_follows cf where cf.user_id=requested_user_id and cf.category_id=q.category_id),
    exists(select 1 from public.verified_account_follows vf where vf.follower_id=requested_user_id and vf.followed_id=q.author_id),
    exists(select 1 from public.question_follows qf where qf.user_id=requested_user_id and qf.question_id=q.id)
  from public.questions q join public.profiles p on p.user_id=q.author_id join public.categories c on c.id=q.category_id
  where public.is_active_user(requested_user_id) and q.status='published' and q.moderation_status in ('clear','approved') and q.published_at<=requested_snapshot
    and not exists(select 1 from public.votes v where v.user_id=requested_user_id and v.question_id=q.id)
    and not exists(select 1 from public.blocked_users b where b.blocker_id=requested_user_id and b.blocked_id=q.author_id)
    and (q.target_min_age is null or extract(year from current_date)::integer-(select birth_year from public.profiles where user_id=requested_user_id)>=q.target_min_age)
    and (q.target_max_age is null or extract(year from current_date)::integer-(select birth_year from public.profiles where user_id=requested_user_id)<=q.target_max_age)
    and (requested_feed='for_you' or exists(select 1 from public.category_follows cf where cf.user_id=requested_user_id and cf.category_id=q.category_id)
      or exists(select 1 from public.verified_account_follows vf where vf.follower_id=requested_user_id and vf.followed_id=q.author_id))
  order by q.published_at desc,q.id limit least(greatest(requested_limit,1),100);
$$;

alter table public.blocked_users enable row level security;
alter table public.verified_account_follows enable row level security;
alter table public.feed_impressions enable row level security;
alter table public.interaction_events enable row level security;
create policy blocked_users_own on public.blocked_users for select to authenticated using(blocker_id=auth.uid());
create policy verified_follows_own on public.verified_account_follows for select to authenticated using(follower_id=auth.uid());

revoke all on public.blocked_users,public.verified_account_follows,public.feed_impressions,public.interaction_events from anon,authenticated;
grant select on public.blocked_users,public.verified_account_follows to authenticated;
revoke all on function public.record_feed_event(uuid,public.interaction_event_type,uuid,uuid,public.feed_type,smallint,smallint,uuid,timestamptz,integer) from public;
grant execute on function public.record_feed_event(uuid,public.interaction_event_type,uuid,uuid,public.feed_type,smallint,smallint,uuid,timestamptz,integer) to authenticated;
revoke all on function public.get_feed_candidates(uuid,public.feed_type,timestamptz,integer) from public;
grant execute on function public.get_feed_candidates(uuid,public.feed_type,timestamptz,integer) to service_role;
