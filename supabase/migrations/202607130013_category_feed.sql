create function public.get_category_feed_candidates(
  requested_user_id uuid,
  requested_category_slug text,
  requested_snapshot timestamptz,
  requested_limit integer default 100
)
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
  where public.is_active_user(requested_user_id) and c.slug=requested_category_slug and c.is_active
    and q.status='published' and q.moderation_status in ('clear','approved') and q.published_at<=requested_snapshot
    and not exists(select 1 from public.votes v where v.user_id=requested_user_id and v.question_id=q.id)
    and not exists(select 1 from public.blocked_users b where b.blocker_id=requested_user_id and b.blocked_id=q.author_id)
    and (q.target_min_age is null or extract(year from current_date)::integer-(select birth_year from public.profiles where user_id=requested_user_id)>=q.target_min_age)
    and (q.target_max_age is null or extract(year from current_date)::integer-(select birth_year from public.profiles where user_id=requested_user_id)<=q.target_max_age)
  order by q.published_at desc,q.id limit least(greatest(requested_limit,1),100);
$$;

revoke all on function public.get_category_feed_candidates(uuid,text,timestamptz,integer) from public;
grant execute on function public.get_category_feed_candidates(uuid,text,timestamptz,integer) to service_role;
