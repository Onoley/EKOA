create function public.get_question_comments_for_user(
  requested_user_id uuid,
  requested_question_id uuid,
  requested_before timestamptz default null,
  requested_before_id uuid default null,
  requested_limit integer default 20
)
returns table(comment_id uuid,body text,author_username text,author_verified boolean,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select c.id,c.body,p.username,p.account_type='verified',c.created_at
  from public.comments c
  join public.profiles p on p.user_id=c.author_id
  where public.can_view_question(requested_question_id,requested_user_id)
    and c.question_id=requested_question_id
    and c.moderation_status='visible'
    and p.account_status='active'
    and (requested_before is null or (c.created_at,c.id)<(requested_before,requested_before_id))
  order by c.created_at desc,c.id desc
  limit least(greatest(requested_limit,1),50);
$$;

revoke all on function public.get_question_comments_for_user(uuid,uuid,timestamptz,uuid,integer) from public;
grant execute on function public.get_question_comments_for_user(uuid,uuid,timestamptz,uuid,integer) to service_role;
