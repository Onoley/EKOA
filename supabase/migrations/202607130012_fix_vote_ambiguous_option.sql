create or replace function public.submit_vote(requested_question_id uuid, requested_option_id uuid)
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

revoke all on function public.submit_vote(uuid,uuid) from public;
grant execute on function public.submit_vote(uuid,uuid) to authenticated;
