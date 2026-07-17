-- Allow the administrator to choose a bounded editorial feature duration.
create or replace function public.admin_moderate_question(requested_question_id uuid,requested_action text,requested_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); previous jsonb; current jsonb; feature_hours integer;
begin
  if not public.is_admin() or requested_action not in ('remove','restore','feature_24','feature_48','unfeature')
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
  elsif requested_action in ('feature_24','feature_48') then
    feature_hours:=case requested_action when 'feature_24' then 24 else 48 end;
    update public.questions set featured_until=now()+make_interval(hours=>feature_hours),featured_by=actor,publication_priority=100 where id=requested_question_id and status='published';
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

revoke all on function public.admin_moderate_question(uuid,text,text) from public;
grant execute on function public.admin_moderate_question(uuid,text,text) to authenticated;
