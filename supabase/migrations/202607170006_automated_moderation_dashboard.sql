begin;

alter table public.questions
  add column if not exists automated_moderation_public_reason text,
  add column if not exists automated_moderation_decided_at timestamptz;

alter table public.question_text_versions
  add column if not exists options jsonb not null default '[]'::jsonb;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint where conname='question_text_versions_options_array'
  ) then
    alter table public.question_text_versions
      add constraint question_text_versions_options_array check(jsonb_typeof(options)='array');
  end if;
end
$migration$;

create table if not exists public.automated_moderation_decisions(
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  moderation_check_id uuid not null references public.question_moderation_checks(id) on delete cascade,
  admin_id uuid not null references public.profiles(user_id) on delete restrict,
  decision text not null check(decision in(
    'approve_as_is','false_positive','approve_suggested_rewrite',
    'approve_manual_edit','request_rewrite','reject'
  )),
  warning_level smallint not null default 0 check(warning_level between 0 and 3),
  admin_reason text not null,
  previous_text text not null,
  final_text text not null,
  previous_options jsonb not null,
  final_options jsonb not null,
  created_at timestamptz not null default now(),
  constraint automated_moderation_decisions_option_arrays check(
    jsonb_typeof(previous_options)='array' and jsonb_typeof(final_options)='array'
  )
);
create index if not exists automated_moderation_decisions_question_created_idx
  on public.automated_moderation_decisions(question_id,created_at desc);

create table if not exists public.question_moderation_warnings(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  question_id uuid not null references public.questions(id) on delete cascade,
  decision_id uuid not null references public.automated_moderation_decisions(id) on delete cascade,
  admin_id uuid not null references public.profiles(user_id) on delete restrict,
  level smallint not null check(level between 1 and 3),
  reason text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists question_moderation_warnings_user_created_idx
  on public.question_moderation_warnings(user_id,created_at desc);

alter table public.automated_moderation_decisions enable row level security;
alter table public.question_moderation_warnings enable row level security;

revoke all on public.question_moderation_checks,public.automated_moderation_queue,
  public.question_text_versions,public.automated_moderation_decisions,
  public.question_moderation_warnings from anon,authenticated;

create or replace function public.has_prohibited_contact_details(input_text text)
returns boolean language sql immutable set search_path='' as $$
  select
    coalesce(input_text,'') ~* '(https?://|www\.|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}|@[a-z0-9_]{2,})'
    or regexp_replace(
      coalesce(input_text,''),
      '[+-]?[0-9][0-9 .-]*[[:space:]]*€',
      ' ',
      'g'
    ) ~* '\+?[0-9][0-9 .-]{7,}';
$$;
revoke all on function public.has_prohibited_contact_details(text) from public,anon,authenticated;

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
 if (select count(*)from public.questions where author_id=requested_user_id and status in('published','limited','under_review'))>=settings.active_limit then raise exception 'active_limit' using errcode='P0001';end if;
 if (select count(*)from public.questions where author_id=requested_user_id and created_at>=now()-interval '1 hour')>=settings.hourly_publish_limit then raise exception 'rate_limit' using errcode='P0001';end if;
 if actor.account_type='ordinary' and (select count(*)from public.questions where author_id=requested_user_id and created_at>=now()-make_interval(days=>settings.rolling_days))>=settings.ordinary_rolling_limit then raise exception 'rolling_limit' using errcode='P0001';end if;
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

create or replace function public.get_automated_moderation_dashboard(
  requested_tab text default 'pending',requested_limit integer default 50,requested_offset integer default 0
) returns table(
  queue_id uuid,question_id uuid,moderation_check_id uuid,user_id uuid,username text,
  question_text text,options jsonb,submitted_at timestamptz,queue_status text,priority text,
  estimated_severity smallint,action_recommended text,target_type text,intent text,
  core_terms jsonb,expressions jsonb,patterns jsonb,signal_sources jsonb,reason_codes jsonb,
  suggested_rewrite text,original_text text,original_options jsonb
) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'not_authorized' using errcode='P0001';end if;
 if requested_tab not in('pending','rewrite','urgent') then raise exception 'invalid_tab' using errcode='P0001';end if;
 return query
 select mq.id,q.id,c.id,q.author_id,p.username,q.text,
   coalesce((select jsonb_agg(jsonb_build_object('position',qo.position,'text',qo.text) order by qo.position) from public.question_options qo where qo.question_id=q.id),'[]'::jsonb),
   mq.created_at,mq.status::text,mq.priority::text,mq.estimated_severity,c.action_recommended,c.target_type,c.intent,
   coalesce((select jsonb_agg(entry.item order by entry.item->>'source',entry.item->>'term') from(
     select distinct jsonb_build_object('term',term->>'canonicalTerm','source',content->>'source') item
     from jsonb_array_elements(c.content_checks) content
     cross join lateral jsonb_array_elements(coalesce(content->'result'->'detectedTerms','[]'::jsonb)) term
     where term->>'tier'='core'
   )entry),'[]'::jsonb),
   coalesce((select jsonb_agg(entry.item order by entry.item->>'source',entry.item->>'expression') from(
     select distinct jsonb_build_object('expression',expression->>'canonicalText','source',content->>'source') item
     from jsonb_array_elements(c.content_checks) content
     cross join lateral jsonb_array_elements(coalesce(content->'result'->'detectedExpressions','[]'::jsonb)) expression
   )entry),'[]'::jsonb),
   coalesce((select jsonb_agg(entry.item order by entry.item->>'source',entry.item->>'pattern') from(
     select distinct jsonb_build_object('pattern',pattern->>'slug','source',content->>'source') item
     from jsonb_array_elements(c.content_checks) content
     cross join lateral jsonb_array_elements(coalesce(content->'result'->'detectedPatterns','[]'::jsonb)) pattern
   )entry),'[]'::jsonb),
   coalesce((select jsonb_agg(source order by source) from(
     select distinct content->>'source' source
     from jsonb_array_elements(c.content_checks) content
     where content->'result'->>'action'<>'ALLOW'
       or jsonb_array_length(coalesce(content->'result'->'detectedTerms','[]'::jsonb))>0
       or jsonb_array_length(coalesce(content->'result'->'detectedExpressions','[]'::jsonb))>0
       or jsonb_array_length(coalesce(content->'result'->'detectedPatterns','[]'::jsonb))>0
   )sources),'[]'::jsonb),
   coalesce((select jsonb_agg(reason order by reason) from(select distinct jsonb_array_elements_text(c.reason_codes) reason)reasons),'[]'::jsonb),
   c.suggested_rewrite,
   coalesce((select v.text from public.question_text_versions v where v.question_id=q.id order by v.version_number limit 1),c.original_text),
   coalesce((select v.options from public.question_text_versions v where v.question_id=q.id order by v.version_number limit 1),'[]'::jsonb)
 from public.automated_moderation_queue mq
 join public.questions q on q.id=mq.question_id
 join public.question_moderation_checks c on c.id=mq.check_id
 join public.profiles p on p.user_id=q.author_id
 where
   (requested_tab='pending' and mq.status in('pending','in_review'))
   or (requested_tab='rewrite' and mq.status='revision_required')
   or (requested_tab='urgent' and mq.status in('pending','in_review','revision_required') and mq.priority='urgent')
 order by
   case mq.priority when 'urgent' then 1 when 'high' then 2 else 3 end,
   mq.created_at
 limit least(greatest(requested_limit,1),100) offset greatest(requested_offset,0);
end;$$;

create or replace function public.get_automated_moderation_history(
  requested_limit integer default 50,requested_offset integer default 0
) returns table(
  decision_id uuid,question_id uuid,admin_id uuid,admin_username text,author_username text,
  decision text,warning_level smallint,admin_reason text,previous_text text,final_text text,
  previous_options jsonb,final_options jsonb,created_at timestamptz
) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'not_authorized' using errcode='P0001';end if;
 return query select d.id,d.question_id,d.admin_id,admin_profile.username,author_profile.username,
   d.decision,d.warning_level,d.admin_reason,d.previous_text,d.final_text,
   d.previous_options,d.final_options,d.created_at
 from public.automated_moderation_decisions d
 join public.questions q on q.id=d.question_id
 join public.profiles admin_profile on admin_profile.user_id=d.admin_id
 join public.profiles author_profile on author_profile.user_id=q.author_id
 order by d.created_at desc
 limit least(greatest(requested_limit,1),100) offset greatest(requested_offset,0);
end;$$;

create or replace function public.admin_decide_automated_question(
  requested_admin_id uuid,requested_question_id uuid,requested_decision text,
  requested_reason text default '',requested_text text default null,
  requested_options text[] default null,requested_warning_level smallint default 0
) returns void language plpgsql security definer set search_path='' as $$
declare q public.questions%rowtype;mq public.automated_moderation_queue%rowtype;c public.question_moderation_checks%rowtype;
 settings public.question_settings%rowtype;previous_options text[];final_options text[];final_text text;
 version_number integer;decision_id uuid;option_value text;pos integer:=0;reason text:=trim(coalesce(requested_reason,''));
begin
 if auth.role()<>'service_role' or not exists(select 1 from public.profiles where user_id=requested_admin_id and role='admin' and account_status='active') then raise exception 'not_authorized' using errcode='P0001';end if;
 if requested_decision not in('approve_as_is','false_positive','approve_suggested_rewrite','approve_manual_edit','request_rewrite','reject') then raise exception 'invalid_decision' using errcode='P0001';end if;
 if requested_warning_level not between 0 and 3
   or (requested_decision='request_rewrite' and requested_warning_level not in(0,1))
   or (requested_decision not in('request_rewrite','reject') and requested_warning_level<>0)
 then raise exception 'invalid_warning_level' using errcode='P0001';end if;
 if requested_decision in('request_rewrite','reject') and char_length(reason)<5 then raise exception 'reason_required' using errcode='P0001';end if;

 select * into q from public.questions where id=requested_question_id for update;
 select * into mq from public.automated_moderation_queue where question_id=requested_question_id for update;
 select * into c from public.question_moderation_checks where question_id=requested_question_id for update;
 if q.id is null or mq.id is null or c.id is null or q.automated_moderation_status not in('pending_admin_review','revision_required') or mq.status not in('pending','in_review','revision_required') then raise exception 'QUESTION_REVIEW_ALREADY_DECIDED' using errcode='P0001';end if;

 select array_agg(qo.text order by qo.position) into previous_options from public.question_options qo where qo.question_id=q.id;
 final_text:=q.text;final_options:=previous_options;
 if requested_decision='approve_suggested_rewrite' then
   if nullif(trim(c.suggested_rewrite),'') is null then raise exception 'suggested_rewrite_unavailable' using errcode='P0001';end if;
   final_text:=trim(c.suggested_rewrite);
 elsif requested_decision='approve_manual_edit' then
   final_text:=trim(coalesce(requested_text,''));final_options:=requested_options;
 end if;

 if requested_decision in('approve_suggested_rewrite','approve_manual_edit') then
   select * into settings from public.question_settings where singleton;
   if char_length(final_text) not between 10 and settings.question_max_length or cardinality(final_options) not between 2 and 6 then raise exception 'invalid_question' using errcode='P0001';end if;
   if exists(select 1 from unnest(final_options)value where char_length(trim(value)) not between 1 and settings.option_max_length) then raise exception 'invalid_options' using errcode='P0001';end if;
   if public.has_prohibited_contact_details(final_text) or exists(select 1 from unnest(final_options)value where public.has_prohibited_contact_details(value)) then raise exception 'contact_details' using errcode='P0001';end if;
   if (select count(distinct public.normalize_question_text(value))from unnest(final_options)value)<>cardinality(final_options) then raise exception 'duplicate_options' using errcode='P0001';end if;
   if exists(select 1 from public.votes where question_id=q.id) then raise exception 'question_has_votes' using errcode='P0001';end if;
   select coalesce(max(v.version_number),0)+1 into version_number from public.question_text_versions v where v.question_id=q.id;
   insert into public.question_text_versions(question_id,version_number,text,options,created_by_admin_id,change_reason)
   values(q.id,version_number,final_text,to_jsonb(final_options),requested_admin_id,case when requested_decision='approve_suggested_rewrite' then 'Réécriture suggérée validée' else 'Modification administrateur' end);
   update public.questions set text=final_text,normalized_text=public.normalize_question_text(final_text),updated_at=now() where id=q.id;
   if final_options is distinct from previous_options then
     delete from public.question_options where question_id=q.id;
     foreach option_value in array final_options loop pos:=pos+1;insert into public.question_options(question_id,position,text,normalized_text)values(q.id,pos,trim(option_value),public.normalize_question_text(option_value));end loop;
   end if;
 end if;

 if requested_decision in('approve_as_is','false_positive','approve_suggested_rewrite','approve_manual_edit') then
   update public.questions set status='published',automated_moderation_status='approved',published_at=coalesce(published_at,now()),automated_moderation_public_reason=null,automated_moderation_decided_at=now(),updated_at=now() where id=q.id;
   update public.automated_moderation_queue set status='approved',assigned_to=requested_admin_id,reviewed_at=now() where id=mq.id;
 elsif requested_decision='request_rewrite' then
   update public.questions set status='under_review',automated_moderation_status='revision_required',automated_moderation_public_reason=reason,automated_moderation_decided_at=now(),updated_at=now() where id=q.id;
   update public.automated_moderation_queue set status='revision_required',assigned_to=requested_admin_id,reviewed_at=now() where id=mq.id;
 else
   update public.questions set status='removed',automated_moderation_status='rejected',automated_moderation_public_reason=reason,automated_moderation_decided_at=now(),updated_at=now() where id=q.id;
   update public.automated_moderation_queue set status='rejected',assigned_to=requested_admin_id,reviewed_at=now() where id=mq.id;
 end if;

 insert into public.automated_moderation_decisions(question_id,moderation_check_id,admin_id,decision,warning_level,admin_reason,previous_text,final_text,previous_options,final_options)
 values(q.id,c.id,requested_admin_id,requested_decision,requested_warning_level,coalesce(nullif(reason,''),'Validation administrative'),q.text,final_text,to_jsonb(previous_options),to_jsonb(final_options)) returning id into decision_id;
 if requested_warning_level>0 then
   insert into public.question_moderation_warnings(user_id,question_id,decision_id,admin_id,level,reason)
   values(q.author_id,q.id,decision_id,requested_admin_id,requested_warning_level,reason);
 end if;
end;$$;

create or replace function public.get_my_moderated_question()
returns table(
  question_id uuid,question_text text,options jsonb,question_status text,
  automated_moderation_status text,submitted_at timestamptz,suggested_rewrite text,
  queue_status text,admin_reason text,warning_level smallint
) language sql stable security definer set search_path='' as $$
  select q.id,q.text,
    coalesce((select jsonb_agg(jsonb_build_object('position',qo.position,'text',qo.text) order by qo.position) from public.question_options qo where qo.question_id=q.id),'[]'::jsonb),
    q.status::text,q.automated_moderation_status::text,q.created_at,c.suggested_rewrite,mq.status::text,
    q.automated_moderation_public_reason,
    coalesce((select w.level from public.question_moderation_warnings w where w.question_id=q.id and w.is_active order by w.created_at desc limit 1),0)::smallint
  from public.questions q
  left join public.question_moderation_checks c on c.question_id=q.id
  left join public.automated_moderation_queue mq on mq.question_id=q.id
  where q.author_id=auth.uid() and q.is_user_submission
  order by q.created_at desc limit 1;
$$;

create or replace function public.resubmit_automated_question_revision(
  requested_user_id uuid,requested_question_id uuid,requested_text text,
  requested_options text[],requested_moderation jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare q public.questions%rowtype;mq public.automated_moderation_queue%rowtype;settings public.question_settings%rowtype;
 action text:=requested_moderation->>'action';option_value text;pos integer:=0;version_number integer;
begin
 if auth.role()<>'service_role' or not exists(select 1 from public.profiles where user_id=requested_user_id and account_status='active') then raise exception 'not_authorized' using errcode='P0001';end if;
 perform pg_advisory_xact_lock(hashtextextended(requested_user_id::text,7));
 select * into q from public.questions where id=requested_question_id and author_id=requested_user_id and is_user_submission for update;
 select * into mq from public.automated_moderation_queue where question_id=requested_question_id for update;
 if q.id is null or mq.id is null or q.automated_moderation_status<>'revision_required' or mq.status<>'revision_required' then raise exception 'QUESTION_REVISION_UNAVAILABLE' using errcode='P0001';end if;
 if action not in('ALLOW','ALLOW_WITH_REWRITE','REVIEW','BLOCK_RECOMMENDED') or jsonb_typeof(requested_moderation->'checks')<>'array' or jsonb_array_length(requested_moderation->'checks')<>cardinality(requested_options)+1 then raise exception 'invalid_moderation_result' using errcode='P0001';end if;
 select * into settings from public.question_settings where singleton;
 if char_length(trim(requested_text)) not between 10 and settings.question_max_length or cardinality(requested_options) not between 2 and 6 then raise exception 'invalid_question' using errcode='P0001';end if;
 if exists(select 1 from unnest(requested_options)value where char_length(trim(value)) not between 1 and settings.option_max_length) then raise exception 'invalid_options' using errcode='P0001';end if;
 if public.has_prohibited_contact_details(requested_text) or exists(select 1 from unnest(requested_options)value where public.has_prohibited_contact_details(value)) then raise exception 'contact_details' using errcode='P0001';end if;
 if (select count(distinct public.normalize_question_text(value))from unnest(requested_options)value)<>cardinality(requested_options) then raise exception 'duplicate_options' using errcode='P0001';end if;
 if exists(select 1 from public.votes where question_id=q.id) then raise exception 'question_has_votes' using errcode='P0001';end if;

 select coalesce(max(v.version_number),0)+1 into version_number from public.question_text_versions v where v.question_id=q.id;
 insert into public.question_text_versions(question_id,version_number,text,options,created_by_user_id,change_reason)
 values(q.id,version_number,trim(requested_text),to_jsonb(requested_options),requested_user_id,'Réécriture envoyée par l’auteur');
 update public.questions set text=trim(requested_text),normalized_text=public.normalize_question_text(requested_text),status='under_review',automated_moderation_status='pending_admin_review',automated_moderation_public_reason=null,automated_moderation_decided_at=null,updated_at=now() where id=q.id;
 delete from public.question_options where question_id=q.id;
 foreach option_value in array requested_options loop pos:=pos+1;insert into public.question_options(question_id,position,text,normalized_text)values(q.id,pos,trim(option_value),public.normalize_question_text(option_value));end loop;
 update public.question_moderation_checks set
   original_text=trim(requested_text),normalized_text=public.normalize_question_text(requested_text),action_recommended=action,
   lexical_severity=(requested_moderation->>'lexicalSeverity')::smallint,predicted_severity=(requested_moderation->>'predictedSeverity')::smallint,
   confidence=(requested_moderation->>'confidence')::real,target_type=requested_moderation->>'targetType',intent=requested_moderation->>'intent',
   detected_terms=jsonb_path_query_array(requested_moderation,'$.checks[*].result.detectedTerms[*]'),
   detected_expressions=jsonb_path_query_array(requested_moderation,'$.checks[*].result.detectedExpressions[*]'),
   detected_patterns=jsonb_path_query_array(requested_moderation,'$.checks[*].result.detectedPatterns[*]'),
   detected_obfuscations=jsonb_path_query_array(requested_moderation,'$.checks[*].result.detectedObfuscations[*]'),
   reason_codes=jsonb_path_query_array(requested_moderation,'$.checks[*].result.reasonCodes[*]'),
   context_codes=jsonb_path_query_array(requested_moderation,'$.checks[*].result.contextCodes[*]'),
   content_checks=requested_moderation->'checks',suggested_rewrite=nullif(requested_moderation->>'suggestedRewrite',''),
   lexicon_version=requested_moderation->>'lexiconVersion',engine_version=requested_moderation->>'engineVersion',created_at=now()
 where question_id=q.id;
 update public.automated_moderation_queue set status='pending',priority=(requested_moderation->>'priority')::public.automated_moderation_priority,
   estimated_severity=(requested_moderation->>'predictedSeverity')::smallint,assigned_to=null,created_at=now(),reviewed_at=null
 where id=mq.id;
end;$$;

revoke all on function public.submit_moderated_question(uuid,text,uuid,text[],text[],smallint,smallint,uuid,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.submit_moderated_question(uuid,text,uuid,text[],text[],smallint,smallint,uuid,boolean,jsonb) to service_role;
revoke all on function public.admin_decide_automated_question(uuid,uuid,text,text,text,text[],smallint) from public,anon,authenticated;
grant execute on function public.admin_decide_automated_question(uuid,uuid,text,text,text,text[],smallint) to service_role;
revoke all on function public.resubmit_automated_question_revision(uuid,uuid,text,text[],jsonb) from public,anon,authenticated;
grant execute on function public.resubmit_automated_question_revision(uuid,uuid,text,text[],jsonb) to service_role;
revoke all on function public.get_automated_moderation_dashboard(text,integer,integer),public.get_automated_moderation_history(integer,integer),public.get_my_moderated_question() from public,anon,authenticated,service_role;
grant execute on function public.get_automated_moderation_dashboard(text,integer,integer),public.get_automated_moderation_history(integer,integer),public.get_my_moderated_question() to authenticated;

commit;
