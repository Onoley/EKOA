begin;

create or replace function public.submit_moderated_question(
 requested_user_id uuid,requested_text text,requested_category_id uuid,requested_options text[],requested_tags text[],requested_min_age smallint,requested_max_age smallint,
 requested_previous_wave_id uuid,requested_confirmed_medium_similarity boolean,requested_moderation jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype;settings public.question_settings%rowtype;series uuid;question_id uuid;check_id uuid;option_value text;tag_value text;pos integer:=0;similar_question record;
 action text:=requested_moderation->>'action';automated_status public.automated_question_moderation_status;public_status public.question_status;user_submission boolean;
begin
 if auth.role()<>'service_role' then raise exception 'not_authorized' using errcode='P0001';end if;
 perform pg_advisory_xact_lock(hashtextextended(requested_user_id::text,7));
 select * into actor from public.profiles where user_id=requested_user_id and account_status='active' for share;
 if actor.user_id is null then raise exception 'not_authorized' using errcode='P0001';end if;
 user_submission:=actor.role<>'admin';
 if user_submission and exists(select 1 from public.questions where author_id=requested_user_id and is_user_submission and automated_moderation_status in('pending_admin_review','revision_required')) then raise exception 'QUESTION_REVIEW_ALREADY_PENDING' using errcode='P0001';end if;
 if action not in('ALLOW','ALLOW_WITH_REWRITE','REVIEW','BLOCK_RECOMMENDED') or jsonb_typeof(requested_moderation->'checks')<>'array' or jsonb_array_length(requested_moderation->'checks')<>cardinality(requested_options)+1 then raise exception 'invalid_moderation_result' using errcode='P0001';end if;
 select * into settings from public.question_settings where singleton;
 if char_length(trim(requested_text)) not between 10 and settings.question_max_length or cardinality(requested_options) not between 2 and 6 or cardinality(requested_tags)>3 then raise exception 'invalid_question' using errcode='P0001';end if;
 if exists(select 1 from unnest(requested_options)value where char_length(trim(value)) not between 1 and settings.option_max_length) then raise exception 'invalid_options' using errcode='P0001';end if;
 if requested_min_age is not null and requested_max_age is not null and requested_min_age>requested_max_age then raise exception 'invalid_age_range' using errcode='P0001';end if;
 if not exists(select 1 from public.categories where id=requested_category_id and is_active) then raise exception 'invalid_category' using errcode='P0001';end if;
 if public.has_prohibited_contact_details(requested_text) or exists(select 1 from unnest(requested_options)value where public.has_prohibited_contact_details(value)) then raise exception 'contact_details' using errcode='P0001';end if;
 if (select count(distinct public.normalize_question_text(value))from unnest(requested_options)value)<>cardinality(requested_options) then raise exception 'duplicate_options' using errcode='P0001';end if;
 if user_submission and (select count(*)from public.questions where author_id=requested_user_id and is_user_submission and status in('published','limited','under_review'))>=settings.active_limit then raise exception 'active_limit' using errcode='P0001';end if;
 if user_submission and (select count(*)from public.questions where author_id=requested_user_id and is_user_submission and created_at>=now()-interval '1 hour')>=settings.hourly_publish_limit then raise exception 'rate_limit' using errcode='P0001';end if;
 if user_submission and actor.account_type='ordinary' and (select count(*)from public.questions where author_id=requested_user_id and is_user_submission and created_at>=now()-make_interval(days=>settings.rolling_days))>=settings.ordinary_rolling_limit then raise exception 'rolling_limit' using errcode='P0001';end if;
 perform pg_advisory_xact_lock(hashtextextended(public.normalize_question_text(requested_text),8));
 for similar_question in select * from public.find_similar_questions(requested_text,requested_category_id,requested_options,null) loop
  if similar_question.is_exact and requested_previous_wave_id is null then raise exception 'exact_duplicate' using errcode='P0001';end if;
  if similar_question.similarity>=settings.high_similarity and requested_previous_wave_id is null then raise exception 'high_similarity' using errcode='P0001';end if;
  if similar_question.similarity>=settings.medium_similarity and not requested_confirmed_medium_similarity then raise exception 'similarity_confirmation_required' using errcode='P0001';end if;
 end loop;
 if requested_previous_wave_id is not null then select series_id into series from public.questions where id=requested_previous_wave_id and author_id=requested_user_id and status='published';if series is null then raise exception 'wave_unavailable' using errcode='P0001';end if;else insert into public.question_series(creator_id)values(requested_user_id)returning id into series;end if;
 automated_status:=case when not user_submission or action='ALLOW' then 'not_required'::public.automated_question_moderation_status else 'pending_admin_review'::public.automated_question_moderation_status end;
 public_status:=case when automated_status='not_required' then 'published'::public.question_status else 'under_review'::public.question_status end;
 insert into public.questions(author_id,category_id,series_id,previous_wave_id,text,normalized_text,target_min_age,target_max_age,status,moderation_status,automated_moderation_status,is_user_submission,published_at,duplicate_confirmed_at)
 values(requested_user_id,requested_category_id,series,requested_previous_wave_id,trim(requested_text),public.normalize_question_text(requested_text),requested_min_age,requested_max_age,public_status,'clear',automated_status,user_submission,now(),case when requested_confirmed_medium_similarity then now() end)returning id into question_id;
 foreach option_value in array requested_options loop pos:=pos+1;insert into public.question_options(question_id,position,text,normalized_text)values(question_id,pos,trim(option_value),public.normalize_question_text(option_value));end loop;
 foreach tag_value in array requested_tags loop if trim(tag_value)<>'' then insert into public.tags(name,normalized_name)values(trim(tag_value),lower(trim(tag_value)))on conflict(normalized_name)do nothing;insert into public.question_tags(question_id,tag_id)select question_id,id from public.tags where normalized_name=lower(trim(tag_value))on conflict do nothing;end if;end loop;
 insert into public.question_text_versions(question_id,version_number,text,options,created_by_user_id,change_reason)values(question_id,1,trim(requested_text),to_jsonb(requested_options),requested_user_id,'Soumission initiale');
 insert into public.question_moderation_checks(question_id,user_id,original_text,normalized_text,action_recommended,lexical_severity,predicted_severity,confidence,target_type,intent,detected_terms,detected_expressions,detected_patterns,detected_obfuscations,reason_codes,context_codes,content_checks,suggested_rewrite,lexicon_version,engine_version)
 values(question_id,requested_user_id,trim(requested_text),public.normalize_question_text(requested_text),action,(requested_moderation->>'lexicalSeverity')::smallint,(requested_moderation->>'predictedSeverity')::smallint,(requested_moderation->>'confidence')::real,requested_moderation->>'targetType',requested_moderation->>'intent',jsonb_path_query_array(requested_moderation,'$.checks[*].result.detectedTerms[*]'),jsonb_path_query_array(requested_moderation,'$.checks[*].result.detectedExpressions[*]'),jsonb_path_query_array(requested_moderation,'$.checks[*].result.detectedPatterns[*]'),jsonb_path_query_array(requested_moderation,'$.checks[*].result.detectedObfuscations[*]'),jsonb_path_query_array(requested_moderation,'$.checks[*].result.reasonCodes[*]'),jsonb_path_query_array(requested_moderation,'$.checks[*].result.contextCodes[*]'),requested_moderation->'checks',nullif(requested_moderation->>'suggestedRewrite',''),requested_moderation->>'lexiconVersion',requested_moderation->>'engineVersion')returning id into check_id;
 if automated_status='pending_admin_review' then insert into public.automated_moderation_queue(question_id,check_id,user_id,priority,estimated_severity)values(question_id,check_id,requested_user_id,(requested_moderation->>'priority')::public.automated_moderation_priority,(requested_moderation->>'predictedSeverity')::smallint);end if;
 return question_id;
exception when unique_violation then if exists(select 1 from public.questions where author_id=requested_user_id and is_user_submission and automated_moderation_status in('pending_admin_review','revision_required'))then raise exception 'QUESTION_REVIEW_ALREADY_PENDING' using errcode='P0001';else raise;end if;
end;$$;

revoke all on function public.submit_moderated_question(uuid,text,uuid,text[],text[],smallint,smallint,uuid,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.submit_moderated_question(uuid,text,uuid,text[],text[],smallint,smallint,uuid,boolean,jsonb) to service_role;

commit;
