create type public.deletion_request_status as enum ('pending','processing','completed','failed');

alter table public.profiles drop constraint profiles_onboarding_state;
alter table public.profiles add constraint profiles_onboarding_state check(
  (account_status='pending_onboarding' and onboarding_completed_at is null)
  or (account_status in ('active','suspended','deletion_requested') and username is not null and birth_year is not null and department_code is not null and professional_activity is not null and onboarding_completed_at is not null)
  or (account_status='anonymized' and username is null and username_normalized is null and birth_year is null and department_code is null and professional_activity is null and gender is null)
);

create table public.account_deletion_requests(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete restrict,
  status public.deletion_request_status not null default 'pending', requested_at timestamptz not null default now(),
  confirmed_at timestamptz not null, processed_at timestamptz, processing_notes text,
  unique(user_id,status)
);
create index account_deletion_requests_status_idx on public.account_deletion_requests(status,requested_at);

create table public.account_lifecycle_audit(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete restrict,
  action text not null check(action in ('deletion_requested','anonymization_started','anonymization_completed','anonymization_failed')),
  actor_id uuid references public.profiles(user_id) on delete set null, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index account_lifecycle_audit_user_idx on public.account_lifecycle_audit(user_id,created_at desc);

create function public.update_private_profile(requested_birth_year smallint,requested_department_code text,requested_activity public.professional_activity,requested_gender public.gender_value)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); department text:=upper(trim(requested_department_code));
begin
  if actor is null or not public.is_active_user(actor) then raise exception 'not_authorized' using errcode='P0001'; end if;
  if requested_birth_year not between extract(year from current_date)::integer-120 and extract(year from current_date)::integer-18 then raise exception 'age_ineligible' using errcode='P0001'; end if;
  if department !~ '^(0[1-9]|1[0-9]|2[1-9]|[3-8][0-9]|9[0-5]|2A|2B|97[1-6])$' then raise exception 'invalid_department' using errcode='P0001'; end if;
  update public.profiles set birth_year=requested_birth_year,department_code=department,professional_activity=requested_activity,gender=requested_gender where user_id=actor and account_status='active';
  if not found then raise exception 'not_authorized' using errcode='P0001'; end if;
end; $$;

create function public.set_verified_account_follow(requested_user_id uuid,requested_followed boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or not public.is_active_user(actor) or actor=requested_user_id or not exists(select 1 from public.profiles where user_id=requested_user_id and account_status='active' and account_type='verified') then raise exception 'verified_target_required' using errcode='P0001'; end if;
  if requested_followed then insert into public.verified_account_follows(follower_id,followed_id) values(actor,requested_user_id) on conflict do nothing;
  else delete from public.verified_account_follows where follower_id=actor and followed_id=requested_user_id; end if;
  return requested_followed;
end; $$;

create function public.get_public_profile(requested_username text)
returns table(user_id uuid,username text,account_type public.account_type,created_at timestamptz,is_followed boolean)
language sql stable security definer set search_path='' as $$
  select p.user_id,p.username,p.account_type,p.created_at,exists(select 1 from public.verified_account_follows f where f.follower_id=auth.uid() and f.followed_id=p.user_id)
  from public.profiles p where p.username_normalized=lower(trim(requested_username)) and p.account_status='active' and public.is_active_user(auth.uid());
$$;

create function public.get_followed_verified_profiles()
returns table(user_id uuid,username text,created_at timestamptz) language sql stable security definer set search_path='' as $$
  select p.user_id,p.username,f.created_at from public.verified_account_follows f join public.profiles p on p.user_id=f.followed_id
  where f.follower_id=auth.uid() and public.is_active_user(auth.uid()) and p.account_status='active' and p.account_type='verified' order by f.created_at desc;
$$;

create function public.get_public_profile_questions(requested_user_id uuid)
returns table(question_id uuid,question_text text,published_at timestamptz) language sql stable security definer set search_path='' as $$
  select q.id,q.text,q.published_at from public.questions q
  where q.author_id=requested_user_id and public.can_view_question(q.id,auth.uid())
    and exists(select 1 from public.profiles p where p.user_id=requested_user_id and p.account_status='active')
  order by q.published_at desc,q.id;
$$;

create function public.request_account_deletion(requested_confirmation text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); request_id uuid;
begin
  if actor is null or not public.is_active_user(actor) or requested_confirmation<>'SUPPRIMER' then raise exception 'confirmation_required' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,7));
  insert into public.account_deletion_requests(user_id,confirmed_at) values(actor,now()) returning id into request_id;
  update public.profiles set account_status='deletion_requested' where user_id=actor and account_status='active';
  insert into public.account_lifecycle_audit(user_id,action,actor_id) values(actor,'deletion_requested',actor);
  return request_id;
exception when unique_violation then raise exception 'request_exists' using errcode='P0001';
end; $$;

create function public.anonymize_requested_account(requested_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare request_id uuid;
begin
  if exists(select 1 from public.account_deletion_requests where user_id=requested_user_id and status='completed')
    and exists(select 1 from public.profiles where user_id=requested_user_id and account_status='anonymized') then return; end if;
  select id into request_id from public.account_deletion_requests where user_id=requested_user_id and status='pending' for update;
  if request_id is null or not exists(select 1 from public.profiles where user_id=requested_user_id and account_status='deletion_requested') then raise exception 'request_unavailable' using errcode='P0001'; end if;
  update public.account_deletion_requests set status='processing' where id=request_id;
  insert into public.account_lifecycle_audit(user_id,action) values(requested_user_id,'anonymization_started');
  update public.questions q set follow_count=greatest(q.follow_count-x.amount,0) from (select question_id,count(*)::integer amount from public.question_follows where user_id=requested_user_id group by question_id)x where q.id=x.question_id;
  update public.questions q set upvote_count=greatest(q.upvote_count-x.amount,0) from (select question_id,count(*)::integer amount from public.question_upvotes where user_id=requested_user_id group by question_id)x where q.id=x.question_id;
  delete from public.category_follows where user_id=requested_user_id;
  delete from public.question_follows where user_id=requested_user_id;
  delete from public.question_upvotes where user_id=requested_user_id;
  delete from public.verified_account_follows where follower_id=requested_user_id or followed_id=requested_user_id;
  delete from public.blocked_users where blocker_id=requested_user_id or blocked_id=requested_user_id;
  delete from public.interaction_events where user_id=requested_user_id;
  delete from public.feed_impressions where user_id=requested_user_id;
  update public.reports set details=null where reporter_id=requested_user_id;
  update public.profiles set username=null,username_normalized=null,birth_year=null,department_code=null,professional_activity=null,gender=null,account_type='ordinary',account_status='anonymized' where user_id=requested_user_id;
  update public.account_deletion_requests set status='completed',processed_at=now(),processing_notes='Données applicatives anonymisées; identité Auth à supprimer de manière douce par le traitement serveur.' where id=request_id;
  insert into public.account_lifecycle_audit(user_id,action) values(requested_user_id,'anonymization_completed');
end; $$;

create or replace function public.get_public_question_author(requested_user_id uuid)
returns table(username text,account_type public.account_type) language sql stable security definer set search_path='' as $$
 select coalesce(p.username,'membre supprimé'),p.account_type from public.profiles p where p.user_id=requested_user_id and p.account_status in ('active','anonymized');
$$;

alter table public.account_deletion_requests enable row level security;
alter table public.account_lifecycle_audit enable row level security;
create policy deletion_requests_select_own on public.account_deletion_requests for select to authenticated using(user_id=auth.uid());
create policy lifecycle_audit_select_own on public.account_lifecycle_audit for select to authenticated using(user_id=auth.uid());
revoke all on public.account_deletion_requests,public.account_lifecycle_audit from anon,authenticated;
grant select on public.account_deletion_requests,public.account_lifecycle_audit to authenticated;
revoke all on function public.update_private_profile(smallint,text,public.professional_activity,public.gender_value),public.set_verified_account_follow(uuid,boolean),public.get_public_profile(text),public.get_followed_verified_profiles(),public.get_public_profile_questions(uuid),public.request_account_deletion(text),public.anonymize_requested_account(uuid) from public;
grant execute on function public.update_private_profile(smallint,text,public.professional_activity,public.gender_value),public.set_verified_account_follow(uuid,boolean),public.get_public_profile(text),public.get_followed_verified_profiles(),public.get_public_profile_questions(uuid),public.request_account_deletion(text) to authenticated;
grant execute on function public.anonymize_requested_account(uuid) to service_role;
