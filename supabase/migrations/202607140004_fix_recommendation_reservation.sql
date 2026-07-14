-- Disambiguate the RETURNS TABLE output name from the reservation column.
create or replace function public.reserve_feed_items_v1(requested_user_id uuid,requested_session_id uuid,requested_items jsonb,requested_ttl_minutes integer default 30)
returns table(question_id uuid,reservation_position integer)
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
    on conflict on constraint feed_reservations_session_id_question_id_key do nothing;
    if found then next_position:=next_position+1;end if;
  end loop;
  update public.feed_sessions set last_activity_at=now() where id=requested_session_id;
  return query select fr.question_id,fr.position from public.feed_reservations fr where fr.session_id=requested_session_id order by fr.position;
end;$$;

revoke all on function public.reserve_feed_items_v1(uuid,uuid,jsonb,integer) from public;
grant execute on function public.reserve_feed_items_v1(uuid,uuid,jsonb,integer) to service_role;
