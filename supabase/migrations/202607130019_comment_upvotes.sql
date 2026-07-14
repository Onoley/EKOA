create table public.comment_upvotes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(comment_id,user_id)
);
create index comment_upvotes_user_created_idx on public.comment_upvotes(user_id,created_at desc);
alter table public.comment_upvotes enable row level security;
revoke all on public.comment_upvotes from anon,authenticated;

create function public.get_question_comments_with_upvotes(
  requested_user_id uuid,requested_question_id uuid,requested_before timestamptz default null,
  requested_before_id uuid default null,requested_limit integer default 20
)
returns table(comment_id uuid,body text,author_username text,author_verified boolean,created_at timestamptz,upvote_count integer,is_upvoted boolean)
language sql stable security definer set search_path='' as $$
  select c.id,c.body,p.username,p.account_type='verified',c.created_at,
    (select count(*)::integer from public.comment_upvotes cu where cu.comment_id=c.id),
    exists(select 1 from public.comment_upvotes cu where cu.comment_id=c.id and cu.user_id=requested_user_id)
  from public.comments c join public.profiles p on p.user_id=c.author_id
  where public.can_view_question(requested_question_id,requested_user_id) and c.question_id=requested_question_id
    and c.moderation_status='visible' and p.account_status='active'
    and (requested_before is null or (c.created_at,c.id)<(requested_before,requested_before_id))
  order by c.created_at desc,c.id desc limit least(greatest(requested_limit,1),50);
$$;

create function public.set_comment_upvote_for_user(requested_user_id uuid,requested_comment_id uuid,requested_upvoted boolean)
returns table(is_upvoted boolean,upvote_count integer)
language plpgsql security definer set search_path='' as $$
declare changed integer; target_question uuid;
begin
  if auth.role()<>'service_role' or not public.is_active_user(requested_user_id) then raise exception 'not_authorized' using errcode='P0001'; end if;
  select c.question_id into target_question from public.comments c where c.id=requested_comment_id and c.moderation_status='visible';
  if target_question is null or not public.can_view_question(target_question,requested_user_id) then raise exception 'comment_unavailable' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_user_id::text||requested_comment_id::text,19));
  if requested_upvoted then
    insert into public.comment_upvotes(comment_id,user_id) values(requested_comment_id,requested_user_id) on conflict do nothing;
  else
    delete from public.comment_upvotes cu where cu.comment_id=requested_comment_id and cu.user_id=requested_user_id;
  end if;
  get diagnostics changed=row_count;
  return query select requested_upvoted,(select count(*)::integer from public.comment_upvotes cu where cu.comment_id=requested_comment_id);
end;
$$;

revoke all on function public.get_question_comments_with_upvotes(uuid,uuid,timestamptz,uuid,integer) from public;
revoke all on function public.set_comment_upvote_for_user(uuid,uuid,boolean) from public;
grant execute on function public.get_question_comments_with_upvotes(uuid,uuid,timestamptz,uuid,integer),public.set_comment_upvote_for_user(uuid,uuid,boolean) to service_role;
