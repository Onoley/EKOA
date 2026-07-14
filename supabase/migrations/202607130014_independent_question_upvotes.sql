create or replace function public.set_question_upvote(requested_question_id uuid, requested_upvoted boolean)
returns table(is_upvoted boolean, upvote_count integer)
language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); changed integer;
begin
  if current_user_id is null or not public.is_active_user(current_user_id)
    or not exists(select 1 from public.questions where id=requested_question_id and status='published' and moderation_status in ('clear','approved')) then
    raise exception 'question_unavailable' using errcode='P0001';
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

create function public.get_question_engagement(requested_question_id uuid)
returns table(upvote_count integer, is_upvoted boolean, is_followed boolean)
language plpgsql stable security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null or not public.is_active_user(current_user_id) then
    raise exception 'not_authorized' using errcode='P0001';
  end if;
  return query
  select q.upvote_count,
    exists(select 1 from public.question_upvotes qu where qu.question_id=q.id and qu.user_id=current_user_id),
    exists(select 1 from public.question_follows qf where qf.question_id=q.id and qf.user_id=current_user_id)
  from public.questions q
  where q.id=requested_question_id and q.status='published' and q.moderation_status in ('clear','approved');
end;
$$;

revoke all on function public.get_question_engagement(uuid) from public;
grant execute on function public.get_question_engagement(uuid) to authenticated;
