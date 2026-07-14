create type public.moderation_case_status as enum ('open','in_review','resolved');
create type public.moderation_action_type as enum ('no_action','limit_question','remove_question','restore_question','hide_comment','remove_comment','restore_comment');
create type public.verification_status as enum ('pending','verified','rejected');

create table public.moderation_cases(
 id uuid primary key default gen_random_uuid(),report_id uuid not null unique references public.reports(id) on delete restrict,
 status public.moderation_case_status not null default 'open',priority smallint not null default 0,
 assigned_to uuid references public.profiles(user_id) on delete set null,resolution public.moderation_action_type,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),resolved_at timestamptz
);
create index moderation_cases_queue_idx on public.moderation_cases(status,priority desc,created_at);
create trigger moderation_cases_set_updated_at before update on public.moderation_cases for each row execute function public.set_updated_at();

create table public.moderation_actions(
 id uuid primary key default gen_random_uuid(),case_id uuid references public.moderation_cases(id) on delete restrict,
 actor_id uuid not null references public.profiles(user_id) on delete restrict,action public.moderation_action_type not null,
 target_type public.report_target_type not null,target_id uuid not null,previous_state jsonb not null,new_state jsonb not null,
 reason text not null check(char_length(trim(reason)) between 5 and 500),created_at timestamptz not null default now()
);
create index moderation_actions_target_idx on public.moderation_actions(target_type,target_id,created_at desc);

create table public.audit_log(
 id uuid primary key default gen_random_uuid(),actor_id uuid references public.profiles(user_id) on delete set null,
 action text not null,target_type text not null,target_id uuid,metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log(created_at desc);

create table public.verified_profiles(
 user_id uuid primary key references public.profiles(user_id) on delete cascade,
 verification_status public.verification_status not null default 'pending',organisation_type text not null,
 organisation_name text not null,public_description text not null default '',
 official_website text,responsible_owner text,private_notes text,verified_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create trigger verified_profiles_set_updated_at before update on public.verified_profiles for each row execute function public.set_updated_at();

alter table public.question_forbidden_terms add column severity smallint not null default 1 check(severity between 1 and 3);
alter table public.question_forbidden_terms add column created_by uuid references public.profiles(user_id) on delete set null;

create function public.is_moderator() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where user_id=auth.uid() and account_status='active' and role in ('moderator','admin'));
$$;
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where user_id=auth.uid() and account_status='active' and role='admin');
$$;

create function public.get_moderation_queue(requested_status public.report_status default 'pending',requested_limit integer default 50)
returns table(report_id uuid,target_type public.report_target_type,target_id uuid,reason public.report_reason,details text,status public.report_status,created_at timestamptz,target_excerpt text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_moderator() then raise exception 'not_authorized' using errcode='P0001'; end if;
 return query select r.id,r.target_type,coalesce(r.question_id,r.comment_id),r.reason,r.details,r.status,r.created_at,
  case when r.target_type='question' then q.text else c.body end
 from public.reports r left join public.questions q on q.id=r.question_id left join public.comments c on c.id=r.comment_id
 where r.status=requested_status order by r.created_at limit least(greatest(requested_limit,1),100);
end; $$;

create function public.moderate_report(requested_report_id uuid,requested_action public.moderation_action_type,requested_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.reports%rowtype; case_id uuid; old_state jsonb; new_state jsonb; target uuid;
begin
 if not public.is_moderator() or char_length(trim(requested_reason)) not between 5 and 500 then raise exception 'not_authorized' using errcode='P0001'; end if;
 select * into item from public.reports where id=requested_report_id for update;
 if item.id is null then raise exception 'report_unavailable' using errcode='P0001'; end if;
 target:=coalesce(item.question_id,item.comment_id);
 insert into public.moderation_cases(report_id,status,assigned_to) values(item.id,'in_review',actor)
 on conflict(report_id) do update set status='in_review',assigned_to=actor returning id into case_id;
 if item.target_type='question' then
  select jsonb_build_object('status',status,'moderation_status',moderation_status) into old_state from public.questions where id=item.question_id for update;
  if requested_action='limit_question' then update public.questions set status='limited',moderation_status='flagged' where id=item.question_id;
  elsif requested_action='remove_question' then update public.questions set status='removed',moderation_status='rejected' where id=item.question_id;
  elsif requested_action='restore_question' then update public.questions set status='published',moderation_status='approved' where id=item.question_id;
  elsif requested_action<>'no_action' then raise exception 'invalid_action' using errcode='P0001'; end if;
  select jsonb_build_object('status',status,'moderation_status',moderation_status) into new_state from public.questions where id=item.question_id;
 else
  select jsonb_build_object('moderation_status',moderation_status) into old_state from public.comments where id=item.comment_id for update;
  if requested_action='hide_comment' then update public.comments set moderation_status='hidden' where id=item.comment_id;
  elsif requested_action='remove_comment' then update public.comments set moderation_status='removed' where id=item.comment_id;
  elsif requested_action='restore_comment' then update public.comments set moderation_status='visible' where id=item.comment_id;
  elsif requested_action<>'no_action' then raise exception 'invalid_action' using errcode='P0001'; end if;
  select jsonb_build_object('moderation_status',moderation_status) into new_state from public.comments where id=item.comment_id;
 end if;
 update public.reports set status=case when requested_action='no_action' then 'dismissed' else 'resolved' end,updated_at=now() where id=item.id;
 update public.moderation_cases set status='resolved',resolution=requested_action,resolved_at=now() where id=case_id;
 insert into public.moderation_actions(case_id,actor_id,action,target_type,target_id,previous_state,new_state,reason) values(case_id,actor,requested_action,item.target_type,target,old_state,new_state,trim(requested_reason));
 insert into public.audit_log(actor_id,action,target_type,target_id,metadata) values(actor,'moderate_report',item.target_type::text,target,jsonb_build_object('report_id',item.id,'decision',requested_action));
end; $$;

create function public.admin_set_account_suspension(requested_user_id uuid,requested_suspended boolean,requested_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); previous public.account_status;
begin
 if not public.is_admin() or actor=requested_user_id or char_length(trim(requested_reason))<5 then raise exception 'not_authorized' using errcode='P0001'; end if;
 select account_status into previous from public.profiles where user_id=requested_user_id for update;
 if previous not in ('active','suspended') then raise exception 'account_unavailable' using errcode='P0001'; end if;
 update public.profiles set account_status=case when requested_suspended then 'suspended'::public.account_status else 'active'::public.account_status end where user_id=requested_user_id;
 insert into public.audit_log(actor_id,action,target_type,target_id,metadata) values(actor,case when requested_suspended then 'suspend_account' else 'restore_account' end,'profile',requested_user_id,jsonb_build_object('previous',previous,'reason',trim(requested_reason)));
end; $$;

create function public.admin_set_verification(requested_user_id uuid,requested_status public.verification_status,requested_organisation_type text,requested_organisation_name text,requested_public_description text,requested_official_website text,requested_responsible_owner text,requested_private_notes text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if not public.is_admin() or not exists(select 1 from public.profiles where user_id=requested_user_id and account_status='active') then raise exception 'not_authorized' using errcode='P0001'; end if;
 if char_length(trim(requested_organisation_type)) not between 2 and 80 or char_length(trim(requested_organisation_name)) not between 2 and 120 or char_length(trim(requested_public_description))>500 then raise exception 'invalid_verification' using errcode='P0001'; end if;
 insert into public.verified_profiles(user_id,verification_status,organisation_type,organisation_name,public_description,official_website,responsible_owner,private_notes,verified_at)
 values(requested_user_id,requested_status,trim(requested_organisation_type),trim(requested_organisation_name),trim(requested_public_description),nullif(trim(requested_official_website),''),nullif(trim(requested_responsible_owner),''),nullif(trim(requested_private_notes),''),case when requested_status='verified' then now() end)
 on conflict(user_id) do update set verification_status=excluded.verification_status,organisation_type=excluded.organisation_type,organisation_name=excluded.organisation_name,public_description=excluded.public_description,official_website=excluded.official_website,responsible_owner=excluded.responsible_owner,private_notes=excluded.private_notes,verified_at=excluded.verified_at;
 update public.profiles set account_type=case when requested_status='verified' then 'verified'::public.account_type else 'ordinary'::public.account_type end where user_id=requested_user_id;
 insert into public.audit_log(actor_id,action,target_type,target_id,metadata) values(actor,'set_verification','profile',requested_user_id,jsonb_build_object('status',requested_status,'organisation_name',trim(requested_organisation_name)));
end; $$;

create function public.admin_set_forbidden_term(requested_term text,requested_severity smallint,requested_active boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); term_id uuid;
begin
 if not public.is_admin() or char_length(trim(requested_term)) not between 2 and 80 or requested_severity not between 1 and 3 then raise exception 'not_authorized' using errcode='P0001'; end if;
 insert into public.question_forbidden_terms(term,severity,is_active,created_by) values(public.normalize_question_text(requested_term),requested_severity,requested_active,actor)
 on conflict(term) do update set severity=excluded.severity,is_active=excluded.is_active returning id into term_id;
 insert into public.audit_log(actor_id,action,target_type,target_id,metadata) values(actor,'set_forbidden_term','forbidden_term',term_id,jsonb_build_object('active',requested_active,'severity',requested_severity));return term_id;
end; $$;

create function public.get_admin_forbidden_terms() returns table(id uuid,term text,severity smallint,is_active boolean,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$ begin if not public.is_admin() then raise exception 'not_authorized' using errcode='P0001';end if;return query select t.id,t.term,t.severity,t.is_active,t.created_at from public.question_forbidden_terms t order by t.term;end;$$;

create function public.admin_find_account(requested_username text)
returns table(user_id uuid,username text,role public.user_role,account_type public.account_type,account_status public.account_status,verification_status public.verification_status,organisation_type text,organisation_name text,public_description text,official_website text,responsible_owner text,private_notes text)
language plpgsql stable security definer set search_path='' as $$
begin if not public.is_admin() then raise exception 'not_authorized' using errcode='P0001';end if;
 return query select p.user_id,p.username,p.role,p.account_type,p.account_status,v.verification_status,v.organisation_type,v.organisation_name,v.public_description,v.official_website,v.responsible_owner,v.private_notes from public.profiles p left join public.verified_profiles v on v.user_id=p.user_id where p.username_normalized=lower(trim(requested_username));
end;$$;

create function public.get_verified_public_details(requested_user_id uuid) returns table(organisation_type text,organisation_name text,public_description text)
language sql stable security definer set search_path='' as $$ select v.organisation_type,v.organisation_name,v.public_description from public.verified_profiles v join public.profiles p on p.user_id=v.user_id where v.user_id=requested_user_id and v.verification_status='verified' and p.account_status='active' and public.is_active_user(auth.uid());$$;

alter table public.moderation_cases enable row level security;alter table public.moderation_actions enable row level security;alter table public.audit_log enable row level security;alter table public.verified_profiles enable row level security;
create policy moderation_cases_staff_read on public.moderation_cases for select to authenticated using(public.is_moderator());
create policy moderation_actions_staff_read on public.moderation_actions for select to authenticated using(public.is_moderator());
create policy audit_log_admin_read on public.audit_log for select to authenticated using(public.is_admin());
revoke all on public.moderation_cases,public.moderation_actions,public.audit_log,public.verified_profiles from anon,authenticated;
grant select on public.moderation_cases,public.moderation_actions to authenticated;grant select on public.audit_log to authenticated;
revoke all on function public.is_moderator(),public.is_admin() from public;grant execute on function public.is_moderator(),public.is_admin() to authenticated;
revoke all on function public.get_moderation_queue(public.report_status,integer),public.moderate_report(uuid,public.moderation_action_type,text),public.admin_set_account_suspension(uuid,boolean,text),public.admin_set_verification(uuid,public.verification_status,text,text,text,text,text,text),public.admin_set_forbidden_term(text,smallint,boolean),public.get_admin_forbidden_terms(),public.admin_find_account(text),public.get_verified_public_details(uuid) from public;
grant execute on function public.get_moderation_queue(public.report_status,integer),public.moderate_report(uuid,public.moderation_action_type,text),public.get_verified_public_details(uuid) to authenticated;
grant execute on function public.admin_set_account_suspension(uuid,boolean,text),public.admin_set_verification(uuid,public.verification_status,text,text,text,text,text,text),public.admin_set_forbidden_term(text,smallint,boolean),public.get_admin_forbidden_terms(),public.admin_find_account(text) to authenticated;
