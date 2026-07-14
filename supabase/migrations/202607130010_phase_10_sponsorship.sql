create type public.sponsor_campaign_kind as enum ('commercial','public_interest');
create type public.sponsor_campaign_status as enum ('draft','active','paused','completed','cancelled');

create table public.sponsor_organisations(
 id uuid primary key default gen_random_uuid(),owner_user_id uuid not null unique references public.profiles(user_id) on delete restrict,
 legal_name text not null check(char_length(trim(legal_name)) between 2 and 160),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create trigger sponsor_organisations_set_updated_at before update on public.sponsor_organisations for each row execute function public.set_updated_at();

create table public.sponsor_campaigns(
 id uuid primary key default gen_random_uuid(),sponsor_id uuid not null references public.sponsor_organisations(id) on delete restrict,
 question_id uuid not null unique references public.questions(id) on delete restrict,name text not null check(char_length(trim(name)) between 2 and 120),
 kind public.sponsor_campaign_kind not null,status public.sponsor_campaign_status not null default 'draft',
 starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at),response_target integer not null check(response_target between 20 and 1000000),
 budget_cents integer not null check(budget_cents between 0 and 100000000),currency char(3) not null default 'EUR' check(currency='EUR'),
 policy_confirmed_at timestamptz not null,created_by uuid not null references public.profiles(user_id) on delete restrict,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index sponsor_campaigns_active_idx on public.sponsor_campaigns(status,starts_at,ends_at);
create trigger sponsor_campaigns_set_updated_at before update on public.sponsor_campaigns for each row execute function public.set_updated_at();

create function public.admin_create_sponsor_organisation(requested_owner_user_id uuid,requested_legal_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); organisation_id uuid;
begin
 if not public.is_admin() or not exists(select 1 from public.profiles p join public.verified_profiles v on v.user_id=p.user_id where p.user_id=requested_owner_user_id and p.account_status='active' and p.account_type='verified' and v.verification_status='verified') then raise exception 'verified_owner_required' using errcode='P0001';end if;
 if char_length(trim(requested_legal_name)) not between 2 and 160 then raise exception 'invalid_organisation' using errcode='P0001';end if;
 insert into public.sponsor_organisations(owner_user_id,legal_name) values(requested_owner_user_id,trim(requested_legal_name)) returning id into organisation_id;
 insert into public.audit_log(actor_id,action,target_type,target_id,metadata) values(actor,'create_sponsor_organisation','sponsor_organisation',organisation_id,jsonb_build_object('owner_user_id',requested_owner_user_id));
 return organisation_id;
end;$$;

create function public.admin_create_sponsor_campaign(requested_sponsor_id uuid,requested_question_id uuid,requested_name text,requested_kind public.sponsor_campaign_kind,requested_starts_at timestamptz,requested_ends_at timestamptz,requested_response_target integer,requested_budget_cents integer,requested_policy_confirmed boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();campaign_id uuid;category_slug text;
begin
 if not public.is_admin() then raise exception 'not_authorized' using errcode='P0001';end if;
 select c.slug into category_slug from public.questions q join public.categories c on c.id=q.category_id where q.id=requested_question_id and q.status='published' and q.moderation_status in ('clear','approved') for share;
 if category_slug is null then raise exception 'question_unavailable' using errcode='P0001';end if;
 if category_slug='politique' then raise exception 'political_sponsorship_forbidden' using errcode='P0001';end if;
 if requested_policy_confirmed is not true then raise exception 'policy_confirmation_required' using errcode='P0001';end if;
 if char_length(trim(requested_name)) not between 2 and 120 or requested_ends_at<=requested_starts_at or requested_response_target not between 20 and 1000000 or requested_budget_cents not between 0 and 100000000 then raise exception 'invalid_campaign' using errcode='P0001';end if;
 insert into public.sponsor_campaigns(sponsor_id,question_id,name,kind,starts_at,ends_at,response_target,budget_cents,policy_confirmed_at,created_by)
 values(requested_sponsor_id,requested_question_id,trim(requested_name),requested_kind,requested_starts_at,requested_ends_at,requested_response_target,requested_budget_cents,now(),actor) returning id into campaign_id;
 insert into public.audit_log(actor_id,action,target_type,target_id,metadata) values(actor,'create_sponsor_campaign','sponsor_campaign',campaign_id,jsonb_build_object('question_id',requested_question_id,'budget_cents',requested_budget_cents,'response_target',requested_response_target,'kind',requested_kind));
 return campaign_id;
end;$$;

create function public.admin_set_sponsor_campaign_status(requested_campaign_id uuid,requested_status public.sponsor_campaign_status,requested_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();previous public.sponsor_campaign_status;
begin
 if not public.is_admin() or char_length(trim(requested_reason)) not between 5 and 500 then raise exception 'not_authorized' using errcode='P0001';end if;
 select status into previous from public.sponsor_campaigns where id=requested_campaign_id for update;
 if previous is null then raise exception 'campaign_unavailable' using errcode='P0001';end if;
 update public.sponsor_campaigns set status=requested_status where id=requested_campaign_id;
 insert into public.audit_log(actor_id,action,target_type,target_id,metadata) values(actor,'set_sponsor_campaign_status','sponsor_campaign',requested_campaign_id,jsonb_build_object('previous',previous,'new',requested_status,'reason',trim(requested_reason)));
end;$$;

create function public.get_active_sponsorships(requested_question_ids uuid[])
returns table(question_id uuid,organisation_name text) language sql stable security definer set search_path='' as $$
 select c.question_id,o.legal_name from public.sponsor_campaigns c join public.sponsor_organisations o on o.id=c.sponsor_id
 where c.question_id=any(requested_question_ids) and c.status='active' and now() between c.starts_at and c.ends_at;
$$;

create function public.get_owned_sponsor_campaigns()
returns table(campaign_id uuid,campaign_name text,question_id uuid,question_text text,status public.sponsor_campaign_status,starts_at timestamptz,ends_at timestamptz,response_target integer,total_responses bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_active_user(auth.uid()) then raise exception 'not_authorized' using errcode='P0001';end if;
 return query select c.id,c.name,c.question_id,q.text,c.status,c.starts_at,c.ends_at,c.response_target,count(v.id)
 from public.sponsor_campaigns c join public.sponsor_organisations o on o.id=c.sponsor_id join public.questions q on q.id=c.question_id left join public.votes v on v.question_id=q.id
 where o.owner_user_id=auth.uid() group by c.id,q.id order by c.created_at desc;
end;$$;

create function public.get_admin_sponsor_overview()
returns table(organisation_id uuid,organisation_name text,owner_username text,campaign_id uuid,campaign_name text,campaign_status public.sponsor_campaign_status,question_text text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'not_authorized' using errcode='P0001';end if;
 return query select o.id,o.legal_name,p.username,c.id,c.name,c.status,q.text from public.sponsor_organisations o join public.profiles p on p.user_id=o.owner_user_id left join public.sponsor_campaigns c on c.sponsor_id=o.id left join public.questions q on q.id=c.question_id order by o.created_at desc,c.created_at desc;
end;$$;

create function public.get_sponsor_campaign_report(requested_campaign_id uuid)
returns table(option_text text,vote_count bigint,percentage numeric,total_responses bigint,suppressed boolean)
language plpgsql stable security definer set search_path='' as $$
declare total bigint;
begin
 if not exists(select 1 from public.sponsor_campaigns c join public.sponsor_organisations o on o.id=c.sponsor_id where c.id=requested_campaign_id and (o.owner_user_id=auth.uid() or public.is_admin())) then raise exception 'not_authorized' using errcode='P0001';end if;
 select count(*) into total from public.votes v join public.sponsor_campaigns c on c.question_id=v.question_id where c.id=requested_campaign_id;
 if total<20 then return query select null::text,null::bigint,null::numeric,total,true;return;end if;
 return query select qo.text,count(v.id),round(count(v.id)*100.0/total,1),total,false
 from public.sponsor_campaigns c join public.question_options qo on qo.question_id=c.question_id left join public.votes v on v.option_id=qo.id
 where c.id=requested_campaign_id group by qo.id order by qo.position;
end;$$;

alter table public.sponsor_organisations enable row level security;alter table public.sponsor_campaigns enable row level security;
revoke all on public.sponsor_organisations,public.sponsor_campaigns from anon,authenticated;
revoke all on function public.admin_create_sponsor_organisation(uuid,text),public.admin_create_sponsor_campaign(uuid,uuid,text,public.sponsor_campaign_kind,timestamptz,timestamptz,integer,integer,boolean),public.admin_set_sponsor_campaign_status(uuid,public.sponsor_campaign_status,text),public.get_active_sponsorships(uuid[]),public.get_owned_sponsor_campaigns(),public.get_sponsor_campaign_report(uuid),public.get_admin_sponsor_overview() from public;
grant execute on function public.admin_create_sponsor_organisation(uuid,text),public.admin_create_sponsor_campaign(uuid,uuid,text,public.sponsor_campaign_kind,timestamptz,timestamptz,integer,integer,boolean),public.admin_set_sponsor_campaign_status(uuid,public.sponsor_campaign_status,text) to authenticated;
grant execute on function public.get_active_sponsorships(uuid[]) to service_role;
grant execute on function public.get_owned_sponsor_campaigns(),public.get_sponsor_campaign_report(uuid) to authenticated;
grant execute on function public.get_admin_sponsor_overview() to authenticated;
