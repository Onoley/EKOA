begin;

-- Transactional moderation intake for new user-submitted questions only.
do $migration$
begin
  if to_regtype('public.automated_question_moderation_status') is null then
    create type public.automated_question_moderation_status as enum ('not_required','pending_admin_review','revision_required','approved','rejected');
  elsif (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid='public.automated_question_moderation_status'::regtype)
    <> array['not_required','pending_admin_review','revision_required','approved','rejected'] then
    raise exception 'incompatible automated_question_moderation_status enum';
  end if;
  if to_regtype('public.automated_moderation_queue_status') is null then
    create type public.automated_moderation_queue_status as enum ('pending','in_review','revision_required','approved','rejected');
  elsif (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid='public.automated_moderation_queue_status'::regtype)
    <> array['pending','in_review','revision_required','approved','rejected'] then
    raise exception 'incompatible automated_moderation_queue_status enum';
  end if;
  if to_regtype('public.automated_moderation_priority') is null then
    create type public.automated_moderation_priority as enum ('normal','high','urgent');
  elsif (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid='public.automated_moderation_priority'::regtype)
    <> array['normal','high','urgent'] then
    raise exception 'incompatible automated_moderation_priority enum';
  end if;
end
$migration$;

alter table public.questions
  add column if not exists automated_moderation_status public.automated_question_moderation_status not null default 'not_required',
  add column if not exists is_user_submission boolean not null default false;

create unique index if not exists questions_one_open_user_review_idx on public.questions(author_id)
where is_user_submission and automated_moderation_status in ('pending_admin_review','revision_required');

create table if not exists public.question_moderation_checks(
 id uuid primary key default gen_random_uuid(),question_id uuid not null unique references public.questions(id) on delete cascade,
 user_id uuid not null references public.profiles(user_id) on delete restrict,original_text text not null,normalized_text text not null,
 action_recommended text not null check(action_recommended in('ALLOW','ALLOW_WITH_REWRITE','REVIEW','BLOCK_RECOMMENDED')),
 lexical_severity smallint not null check(lexical_severity between 0 and 3),predicted_severity smallint not null check(predicted_severity between 0 and 3),
 confidence real not null check(confidence between 0 and 1),target_type text not null,intent text not null,
 detected_terms jsonb not null default '[]'::jsonb,detected_expressions jsonb not null default '[]'::jsonb,detected_patterns jsonb not null default '[]'::jsonb,
 detected_obfuscations jsonb not null default '[]'::jsonb,reason_codes jsonb not null default '[]'::jsonb,context_codes jsonb not null default '[]'::jsonb,
 content_checks jsonb not null default '[]'::jsonb,suggested_rewrite text,lexicon_version text not null,engine_version text not null check(engine_version='moderation-v1'),created_at timestamptz not null default now(),
 constraint question_moderation_checks_json_arrays check(jsonb_typeof(detected_terms)='array' and jsonb_typeof(detected_expressions)='array' and jsonb_typeof(detected_patterns)='array' and jsonb_typeof(detected_obfuscations)='array' and jsonb_typeof(reason_codes)='array' and jsonb_typeof(context_codes)='array' and jsonb_typeof(content_checks)='array')
);

create table if not exists public.automated_moderation_queue(
 id uuid primary key default gen_random_uuid(),question_id uuid not null unique references public.questions(id) on delete cascade,
 check_id uuid not null unique references public.question_moderation_checks(id) on delete cascade,user_id uuid not null references public.profiles(user_id) on delete restrict,
 status public.automated_moderation_queue_status not null default 'pending',priority public.automated_moderation_priority not null,
 estimated_severity smallint not null check(estimated_severity between 0 and 3),assigned_to uuid references public.profiles(user_id) on delete set null,
 created_at timestamptz not null default now(),reviewed_at timestamptz
);
create index if not exists automated_moderation_queue_pending_idx on public.automated_moderation_queue(status,priority desc,created_at);

create table if not exists public.question_text_versions(
 id uuid primary key default gen_random_uuid(),question_id uuid not null references public.questions(id) on delete cascade,
 version_number integer not null check(version_number>0),text text not null,created_by_user_id uuid references public.profiles(user_id) on delete restrict,
 created_by_admin_id uuid references public.profiles(user_id) on delete restrict,change_reason text not null,created_at timestamptz not null default now(),
 unique(question_id,version_number),constraint question_text_version_actor check((created_by_user_id is not null)::integer+(created_by_admin_id is not null)::integer=1)
);

alter table public.question_moderation_checks enable row level security;
alter table public.automated_moderation_queue enable row level security;
alter table public.question_text_versions enable row level security;
drop policy if exists question_moderation_checks_admin_read on public.question_moderation_checks;
create policy question_moderation_checks_admin_read on public.question_moderation_checks for select to authenticated using(public.is_admin());
drop policy if exists automated_moderation_queue_admin_read on public.automated_moderation_queue;
create policy automated_moderation_queue_admin_read on public.automated_moderation_queue for select to authenticated using(public.is_admin());
drop policy if exists question_text_versions_owner_admin_read on public.question_text_versions;
create policy question_text_versions_owner_admin_read on public.question_text_versions for select to authenticated using(created_by_user_id=auth.uid() or public.is_admin());
revoke all on public.question_moderation_checks,public.automated_moderation_queue,public.question_text_versions from anon,authenticated;
grant select on public.question_moderation_checks,public.automated_moderation_queue,public.question_text_versions to authenticated;

drop policy if exists questions_select_visible on public.questions;
create policy questions_select_visible on public.questions for select to authenticated using(
 author_id=auth.uid() or public.is_admin() or (status='published' and moderation_status in('clear','approved') and automated_moderation_status in('not_required','approved') and public.is_active_user())
);
drop policy if exists options_select_visible on public.question_options;
create policy options_select_visible on public.question_options for select to authenticated using(exists(select 1 from public.questions q where q.id=question_id and(q.author_id=auth.uid() or public.is_admin() or(q.status='published' and q.moderation_status in('clear','approved') and q.automated_moderation_status in('not_required','approved') and public.is_active_user()))));
drop policy if exists question_tags_select_visible on public.question_tags;
create policy question_tags_select_visible on public.question_tags for select to authenticated using(exists(select 1 from public.questions q where q.id=question_id and(q.author_id=auth.uid() or public.is_admin() or(q.status='published' and q.moderation_status in('clear','approved') and q.automated_moderation_status in('not_required','approved') and public.is_active_user()))));

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
 if requested_text~*'(https?://|www\.|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}|\+?[0-9][0-9 .-]{7,}|@[a-z0-9_]{2,})' or exists(select 1 from unnest(requested_options)value where value~*'(https?://|www\.|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}|\+?[0-9][0-9 .-]{7,}|@[a-z0-9_]{2,})') then raise exception 'contact_details' using errcode='P0001';end if;
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
 insert into public.question_text_versions(question_id,version_number,text,created_by_user_id,change_reason)values(question_id,1,trim(requested_text),requested_user_id,'Soumission initiale');
 insert into public.question_moderation_checks(question_id,user_id,original_text,normalized_text,action_recommended,lexical_severity,predicted_severity,confidence,target_type,intent,detected_terms,detected_expressions,detected_patterns,detected_obfuscations,reason_codes,context_codes,content_checks,suggested_rewrite,lexicon_version,engine_version)
 values(question_id,requested_user_id,trim(requested_text),public.normalize_question_text(requested_text),action,(requested_moderation->>'lexicalSeverity')::smallint,(requested_moderation->>'predictedSeverity')::smallint,(requested_moderation->>'confidence')::real,requested_moderation->>'targetType',requested_moderation->>'intent',jsonb_path_query_array(requested_moderation,'$.checks[*].result.detectedTerms[*]'),jsonb_path_query_array(requested_moderation,'$.checks[*].result.detectedExpressions[*]'),jsonb_path_query_array(requested_moderation,'$.checks[*].result.detectedPatterns[*]'),jsonb_path_query_array(requested_moderation,'$.checks[*].result.detectedObfuscations[*]'),jsonb_path_query_array(requested_moderation,'$.checks[*].result.reasonCodes[*]'),jsonb_path_query_array(requested_moderation,'$.checks[*].result.contextCodes[*]'),requested_moderation->'checks',nullif(requested_moderation->>'suggestedRewrite',''),requested_moderation->>'lexiconVersion',requested_moderation->>'engineVersion')returning id into check_id;
 if automated_status='pending_admin_review' then insert into public.automated_moderation_queue(question_id,check_id,user_id,priority,estimated_severity)values(question_id,check_id,requested_user_id,(requested_moderation->>'priority')::public.automated_moderation_priority,(requested_moderation->>'predictedSeverity')::smallint);end if;
 return question_id;
exception when unique_violation then if exists(select 1 from public.questions where author_id=requested_user_id and is_user_submission and automated_moderation_status in('pending_admin_review','revision_required'))then raise exception 'QUESTION_REVIEW_ALREADY_PENDING' using errcode='P0001';else raise;end if;
end;$$;

create or replace function public.get_current_question_review_status()returns table(question_id uuid,question_excerpt text,submitted_at timestamptz,moderation_status public.automated_question_moderation_status,suggested_rewrite text,decision public.automated_moderation_queue_status,queue_status public.automated_moderation_queue_status)
language sql stable security definer set search_path='' as $$select q.id,left(q.text,120),q.created_at,q.automated_moderation_status,c.suggested_rewrite,mq.status,mq.status from public.questions q left join public.question_moderation_checks c on c.question_id=q.id left join public.automated_moderation_queue mq on mq.question_id=q.id where q.author_id=auth.uid() and q.is_user_submission and q.automated_moderation_status in('pending_admin_review','revision_required') order by q.created_at desc limit 1$$;

create or replace function public.get_pending_automated_moderation_queue(requested_limit integer default 25,requested_offset integer default 0)returns table(queue_id uuid,question_id uuid,user_id uuid,question_text text,options jsonb,submitted_at timestamptz,queue_status public.automated_moderation_queue_status,priority public.automated_moderation_priority,estimated_severity smallint,action_recommended text,target_type text,intent text,suggested_rewrite text)
language plpgsql stable security definer set search_path='' as $$begin if not public.is_admin()then raise exception 'not_authorized' using errcode='P0001';end if;return query select mq.id,q.id,q.author_id,q.text,(select jsonb_agg(jsonb_build_object('position',qo.position,'text',qo.text)order by qo.position)from public.question_options qo where qo.question_id=q.id),q.created_at,mq.status,mq.priority,mq.estimated_severity,c.action_recommended,c.target_type,c.intent,c.suggested_rewrite from public.automated_moderation_queue mq join public.questions q on q.id=mq.question_id join public.question_moderation_checks c on c.id=mq.check_id where mq.status in('pending','in_review','revision_required')order by mq.priority desc,mq.created_at limit least(greatest(requested_limit,1),50)offset greatest(requested_offset,0);end;$$;

revoke all on function public.submit_moderated_question(uuid,text,uuid,text[],text[],smallint,smallint,uuid,boolean,jsonb)from public,anon,authenticated;
grant execute on function public.submit_moderated_question(uuid,text,uuid,text[],text[],smallint,smallint,uuid,boolean,jsonb)to service_role;
revoke all on function public.get_current_question_review_status(),public.get_pending_automated_moderation_queue(integer,integer)from public;
grant execute on function public.get_current_question_review_status(),public.get_pending_automated_moderation_queue(integer,integer)to authenticated;

-- Transitional compatibility: the production version deployed before this
-- migration still submits questions through save_question_draft() followed by
-- publish_question(). Keep both RPCs and their authenticated grants unchanged
-- until the Vercel deployment using submit_moderated_question() is verified.
-- The separate cleanup migration 202607170004 revokes the legacy grants only
-- after that deployment. This intentionally creates a short, controlled period
-- where both submission paths are available, avoiding an application outage.

commit;
