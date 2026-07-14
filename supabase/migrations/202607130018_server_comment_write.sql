create function public.create_comment_for_user(
  requested_user_id uuid,
  requested_question_id uuid,
  requested_body text
)
returns table(comment_id uuid,body text,author_username text,author_verified boolean,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare clean_body text:=trim(requested_body); created_comment public.comments%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'not_authorized' using errcode='P0001'; end if;
  if not public.can_view_question(requested_question_id,requested_user_id) then raise exception 'question_unavailable' using errcode='P0001'; end if;
  if clean_body is null or char_length(clean_body) not between 1 and 300 then raise exception 'invalid_comment' using errcode='P0001'; end if;
  if clean_body ~* '(https?://|www\.|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}|\+?[0-9][0-9 .-]{7,}|@[a-z0-9_]{2,})' then raise exception 'contact_details' using errcode='P0001'; end if;
  if exists(
    select 1 from public.question_forbidden_terms qft
    where qft.is_active
      and public.normalize_question_text(clean_body) ~ ('(^| )'||public.normalize_question_text(qft.term)||'( |$)')
  ) then raise exception 'forbidden_content' using errcode='P0001'; end if;
  insert into public.comments(question_id,author_id,body)
  values(requested_question_id,requested_user_id,clean_body)
  returning * into created_comment;
  insert into public.interaction_events(id,user_id,event_type,question_id,occurred_at)
  values(gen_random_uuid(),requested_user_id,'comment',requested_question_id,now());
  return query
    select created_comment.id,created_comment.body,p.username,p.account_type='verified',created_comment.created_at
    from public.profiles p where p.user_id=requested_user_id;
end;
$$;

revoke all on function public.create_comment_for_user(uuid,uuid,text) from public;
grant execute on function public.create_comment_for_user(uuid,uuid,text) to service_role;
