create or replace function public.create_comment(requested_question_id uuid,requested_body text)
returns table(comment_id uuid,body text,author_username text,author_verified boolean,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); clean_body text:=trim(requested_body); created public.comments%rowtype;
begin
  if actor is null or not public.can_view_question(requested_question_id,actor) then raise exception 'question_unavailable' using errcode='P0001'; end if;
  if clean_body is null or char_length(clean_body) not between 1 and 300 then raise exception 'invalid_comment' using errcode='P0001'; end if;
  if clean_body ~* '(https?://|www\.|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}|\+?[0-9][0-9 .-]{7,}|@[a-z0-9_]{2,})' then raise exception 'contact_details' using errcode='P0001'; end if;
  if exists(select 1 from public.question_forbidden_terms where is_active and public.normalize_question_text(clean_body) ~ ('(^| )'||public.normalize_question_text(term)||'( |$)')) then raise exception 'forbidden_content' using errcode='P0001'; end if;
  insert into public.comments(question_id,author_id,body) values(requested_question_id,actor,clean_body) returning * into created;
  insert into public.interaction_events(id,user_id,event_type,question_id,occurred_at) values(gen_random_uuid(),actor,'comment',requested_question_id,now());
  return query select created.id,created.body,p.username,p.account_type='verified',created.created_at from public.profiles p where p.user_id=actor;
end;
$$;
