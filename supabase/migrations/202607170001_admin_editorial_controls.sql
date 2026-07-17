-- Direct, audited administrator controls and transparent editorial featuring.
alter table public.questions
  add column featured_until timestamptz,
  add column featured_by uuid references public.profiles(user_id) on delete set null;

create index questions_featured_until_idx on public.questions(featured_until desc)
where featured_until is not null;

create function public.feature_admin_question_on_publish()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='published'
    and (tg_op='INSERT' or old.status is distinct from 'published')
    and exists(select 1 from public.profiles p where p.user_id=new.author_id and p.role='admin' and p.account_status='active') then
    new.featured_until:=now()+interval '48 hours';
    new.featured_by:=new.author_id;
    new.publication_priority:=100;
  end if;
  return new;
end; $$;

create trigger questions_feature_admin_publish
before insert or update of status on public.questions
for each row execute function public.feature_admin_question_on_publish();

create function public.admin_moderate_question(requested_question_id uuid,requested_action text,requested_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); previous jsonb; current jsonb;
begin
  if not public.is_admin() or requested_action not in ('remove','restore','feature','unfeature')
    or char_length(trim(requested_reason)) not between 5 and 500 then
    raise exception 'not_authorized' using errcode='P0001';
  end if;
  select jsonb_build_object('status',q.status,'moderation_status',q.moderation_status,'featured_until',q.featured_until)
    into previous from public.questions q where q.id=requested_question_id for update;
  if previous is null then raise exception 'question_unavailable' using errcode='P0001'; end if;
  if requested_action='remove' then
    update public.questions set status='removed',moderation_status='rejected',featured_until=null,featured_by=null where id=requested_question_id;
  elsif requested_action='restore' then
    update public.questions set status='published',moderation_status='approved' where id=requested_question_id;
  elsif requested_action='feature' then
    update public.questions set featured_until=now()+interval '48 hours',featured_by=actor,publication_priority=100 where id=requested_question_id and status='published';
  else
    update public.questions set featured_until=null,featured_by=null where id=requested_question_id;
  end if;
  select jsonb_build_object('status',q.status,'moderation_status',q.moderation_status,'featured_until',q.featured_until)
    into current from public.questions q where q.id=requested_question_id;
  insert into public.moderation_actions(actor_id,action,target_type,target_id,previous_state,new_state,reason)
  values(actor,case requested_action when 'remove' then 'remove_question'::public.moderation_action_type when 'restore' then 'restore_question'::public.moderation_action_type else 'no_action'::public.moderation_action_type end,'question',requested_question_id,previous,current,trim(requested_reason));
  insert into public.audit_log(actor_id,action,target_type,target_id,metadata)
  values(actor,'admin_question_'||requested_action,'question',requested_question_id,jsonb_build_object('reason',trim(requested_reason),'previous',previous,'current',current));
end; $$;

create function public.admin_set_quick_verification(requested_user_id uuid,requested_verified boolean)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); display_name text;
begin
  if not public.is_admin() or not exists(select 1 from public.profiles where user_id=requested_user_id and account_status='active') then
    raise exception 'not_authorized' using errcode='P0001';
  end if;
  select coalesce(username,'Compte Ekoa') into display_name from public.profiles where user_id=requested_user_id for update;
  if requested_verified then
    insert into public.verified_profiles(user_id,verification_status,organisation_type,organisation_name,public_description,verified_at)
    values(requested_user_id,'verified','Compte certifié',display_name,'',now())
    on conflict(user_id) do update set verification_status='verified',verified_at=now();
    update public.profiles set account_type='verified' where user_id=requested_user_id;
  else
    update public.verified_profiles set verification_status='rejected',verified_at=null where user_id=requested_user_id;
    update public.profiles set account_type='ordinary' where user_id=requested_user_id;
  end if;
  insert into public.audit_log(actor_id,action,target_type,target_id,metadata)
  values(actor,case when requested_verified then 'quick_verify_account' else 'remove_account_verification' end,'profile',requested_user_id,jsonb_build_object('verified',requested_verified));
end; $$;

revoke all on function public.admin_moderate_question(uuid,text,text),public.admin_set_quick_verification(uuid,boolean) from public;
grant execute on function public.admin_moderate_question(uuid,text,text),public.admin_set_quick_verification(uuid,boolean) to authenticated;
