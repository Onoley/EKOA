create table public.votes (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete restrict,
  option_id uuid not null references public.question_options(id) on delete restrict,
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(question_id, user_id)
);
create index votes_option_id_idx on public.votes(option_id);
create index votes_user_created_idx on public.votes(user_id, created_at desc);

create table public.question_follows (
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(question_id, user_id)
);
create index question_follows_user_created_idx on public.question_follows(user_id, created_at desc);

create table public.question_upvotes (
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(question_id, user_id)
);
create index question_upvotes_user_idx on public.question_upvotes(user_id);

create function public.get_public_question_author(requested_user_id uuid)
returns table(username text, account_type public.account_type)
language sql stable security definer set search_path = '' as $$
  select profiles.username, profiles.account_type
  from public.profiles
  where user_id=requested_user_id and account_status='active';
$$;

create function public.get_question_results(requested_question_id uuid)
returns table(
  option_id uuid,
  option_text text,
  option_position smallint,
  option_vote_count integer,
  total_vote_count integer,
  percentage numeric,
  is_selected boolean,
  question_upvote_count integer,
  is_upvoted boolean,
  is_followed boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  selected_option uuid;
begin
  if current_user_id is null or not public.is_active_user(current_user_id) then
    raise exception 'not_authorized' using errcode='P0001';
  end if;
  if not exists(select 1 from public.questions where id=requested_question_id and status='published' and moderation_status in ('clear','approved')) then
    raise exception 'question_unavailable' using errcode='P0001';
  end if;
  select votes.option_id into selected_option from public.votes
    where question_id=requested_question_id and user_id=current_user_id;
  if selected_option is null then raise exception 'vote_required' using errcode='P0001'; end if;

  return query
  select qo.id, qo.text, qo.position, qo.vote_count, q.vote_count,
    case when q.vote_count=0 then 0 else round(qo.vote_count * 100.0 / q.vote_count, 1) end,
    qo.id=selected_option, q.upvote_count,
    exists(select 1 from public.question_upvotes qu where qu.question_id=q.id and qu.user_id=current_user_id),
    exists(select 1 from public.question_follows qf where qf.question_id=q.id and qf.user_id=current_user_id)
  from public.questions q join public.question_options qo on qo.question_id=q.id
  where q.id=requested_question_id
  order by qo.position;
end;
$$;

create function public.submit_vote(requested_question_id uuid, requested_option_id uuid)
returns table(
  option_id uuid, option_text text, option_position smallint, option_vote_count integer,
  total_vote_count integer, percentage numeric, is_selected boolean,
  question_upvote_count integer, is_upvoted boolean, is_followed boolean
)
language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  existing_option uuid;
  voter_birth_year smallint;
  target public.questions%rowtype;
begin
  if current_user_id is null or not public.is_active_user(current_user_id) then raise exception 'not_authorized' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || requested_question_id::text, 3));
  select votes.option_id into existing_option from public.votes where question_id=requested_question_id and user_id=current_user_id;
  if existing_option is not null then
    if existing_option <> requested_option_id then raise exception 'vote_immutable' using errcode='P0001'; end if;
    return query select * from public.get_question_results(requested_question_id); return;
  end if;

  select * into target from public.questions where id=requested_question_id for update;
  if target.id is null or target.status <> 'published' or target.moderation_status not in ('clear','approved') then
    raise exception 'question_unavailable' using errcode='P0001';
  end if;
  if not exists(select 1 from public.question_options where id=requested_option_id and question_id=target.id) then
    raise exception 'invalid_option' using errcode='P0001';
  end if;
  select birth_year into voter_birth_year from public.profiles where user_id=current_user_id;
  if target.target_min_age is not null and extract(year from current_date)::integer-voter_birth_year < target.target_min_age
    or target.target_max_age is not null and extract(year from current_date)::integer-voter_birth_year > target.target_max_age then
    raise exception 'age_ineligible' using errcode='P0001';
  end if;

  insert into public.votes(question_id, option_id, user_id) values(target.id, requested_option_id, current_user_id);
  update public.question_options set vote_count=vote_count+1 where id=requested_option_id;
  update public.questions set vote_count=vote_count+1 where id=target.id;
  return query select * from public.get_question_results(requested_question_id);
end;
$$;

create function public.set_question_follow(requested_question_id uuid, requested_followed boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); changed integer;
begin
  if current_user_id is null or not public.is_active_user(current_user_id)
    or not exists(select 1 from public.questions where id=requested_question_id and status='published' and moderation_status in ('clear','approved')) then
    raise exception 'question_unavailable' using errcode='P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || requested_question_id::text, 4));
  if requested_followed then
    insert into public.question_follows(question_id,user_id) values(requested_question_id,current_user_id) on conflict do nothing;
    get diagnostics changed = row_count;
    if changed=1 then update public.questions set follow_count=follow_count+1 where id=requested_question_id; end if;
  else
    delete from public.question_follows where question_id=requested_question_id and user_id=current_user_id;
    get diagnostics changed = row_count;
    if changed=1 then update public.questions set follow_count=greatest(follow_count-1,0) where id=requested_question_id; end if;
  end if;
  return requested_followed;
end;
$$;

create function public.set_question_upvote(requested_question_id uuid, requested_upvoted boolean)
returns table(is_upvoted boolean, upvote_count integer)
language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); changed integer;
begin
  if current_user_id is null or not public.is_active_user(current_user_id)
    or not exists(select 1 from public.votes where question_id=requested_question_id and user_id=current_user_id)
    or not exists(select 1 from public.questions where id=requested_question_id and status='published' and moderation_status in ('clear','approved')) then
    raise exception 'vote_required' using errcode='P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || requested_question_id::text, 5));
  if requested_upvoted then
    insert into public.question_upvotes(question_id,user_id) values(requested_question_id,current_user_id) on conflict do nothing;
    get diagnostics changed = row_count;
    if changed=1 then update public.questions set upvote_count=upvote_count+1 where id=requested_question_id; end if;
  else
    delete from public.question_upvotes where question_id=requested_question_id and user_id=current_user_id;
    get diagnostics changed = row_count;
    if changed=1 then update public.questions set upvote_count=greatest(upvote_count-1,0) where id=requested_question_id; end if;
  end if;
  return query select requested_upvoted, questions.upvote_count from public.questions where id=requested_question_id;
end;
$$;

alter table public.votes enable row level security;
alter table public.question_follows enable row level security;
alter table public.question_upvotes enable row level security;
create policy votes_select_own on public.votes for select to authenticated using(user_id=auth.uid() and public.is_active_user());
create policy question_follows_select_own on public.question_follows for select to authenticated using(user_id=auth.uid() and public.is_active_user());
create policy question_upvotes_select_own on public.question_upvotes for select to authenticated using(user_id=auth.uid() and public.is_active_user());

drop policy questions_select_visible on public.questions;
create policy questions_select_visible on public.questions for select to authenticated using (
  author_id=auth.uid() or (status='published' and moderation_status in ('clear','approved') and public.is_active_user())
);

revoke select on public.questions, public.question_options, public.tags from authenticated;
grant select(id,author_id,category_id,series_id,previous_wave_id,text,normalized_text,normalization_version,
  target_min_age,target_max_age,status,moderation_status,published_at,duplicate_confirmed_at,created_at,updated_at)
  on public.questions to authenticated;
grant select(id,question_id,position,text,normalized_text,created_at) on public.question_options to authenticated;
grant select(id,name,normalized_name,created_at) on public.tags to authenticated;
revoke all on public.votes, public.question_follows, public.question_upvotes from anon, authenticated;
grant select on public.votes, public.question_follows, public.question_upvotes to authenticated;

revoke all on function public.get_public_question_author(uuid) from public;
revoke all on function public.get_question_results(uuid) from public;
revoke all on function public.submit_vote(uuid,uuid) from public;
revoke all on function public.set_question_follow(uuid,boolean) from public;
revoke all on function public.set_question_upvote(uuid,boolean) from public;
grant execute on function public.get_public_question_author(uuid), public.get_question_results(uuid),
  public.submit_vote(uuid,uuid), public.set_question_follow(uuid,boolean), public.set_question_upvote(uuid,boolean) to authenticated;
