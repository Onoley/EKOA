create type public.comment_moderation_status as enum ('visible','hidden','removed');
create type public.report_target_type as enum ('question','comment');
create type public.report_reason as enum ('spam','harassment','hate','sexual_content','violence','misinformation','personal_information','other');
create type public.report_status as enum ('pending','reviewing','resolved','dismissed');

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  author_id uuid not null references public.profiles(user_id) on delete restrict,
  body text not null check(char_length(body) between 1 and 300),
  moderation_status public.comment_moderation_status not null default 'visible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comments_question_visible_created_idx on public.comments(question_id,created_at desc,id desc) where moderation_status='visible';
create index comments_author_created_idx on public.comments(author_id,created_at desc);
create trigger comments_set_updated_at before update on public.comments for each row execute function public.set_updated_at();

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(user_id) on delete restrict,
  target_type public.report_target_type not null,
  question_id uuid references public.questions(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  reason public.report_reason not null,
  details text check(details is null or char_length(details)<=500),
  status public.report_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_exact_target check(
    (target_type='question' and question_id is not null and comment_id is null)
    or (target_type='comment' and comment_id is not null and question_id is null)
  )
);
create unique index reports_active_question_key on public.reports(reporter_id,question_id) where question_id is not null and status in ('pending','reviewing');
create unique index reports_active_comment_key on public.reports(reporter_id,comment_id) where comment_id is not null and status in ('pending','reviewing');
create index reports_status_created_idx on public.reports(status,created_at);
create trigger reports_set_updated_at before update on public.reports for each row execute function public.set_updated_at();

create function public.can_view_question(requested_question_id uuid,requested_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_active_user(requested_user_id) and exists(
    select 1 from public.questions q
    where q.id=requested_question_id and q.status='published' and q.moderation_status in ('clear','approved')
      and (q.target_min_age is null or extract(year from current_date)::integer-(select birth_year from public.profiles where user_id=requested_user_id)>=q.target_min_age)
      and (q.target_max_age is null or extract(year from current_date)::integer-(select birth_year from public.profiles where user_id=requested_user_id)<=q.target_max_age)
      and not exists(select 1 from public.blocked_users b where b.blocker_id=requested_user_id and b.blocked_id=q.author_id)
  );
$$;

create function public.create_comment(requested_question_id uuid,requested_body text)
returns table(comment_id uuid,body text,author_username text,author_verified boolean,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); clean_body text:=trim(requested_body); created public.comments%rowtype;
begin
  if actor is null or not public.can_view_question(requested_question_id,actor) then raise exception 'question_unavailable' using errcode='P0001'; end if;
  if not exists(select 1 from public.votes where question_id=requested_question_id and user_id=actor) then raise exception 'vote_required' using errcode='P0001'; end if;
  if clean_body is null or char_length(clean_body) not between 1 and 300 then raise exception 'invalid_comment' using errcode='P0001'; end if;
  if clean_body ~* '(https?://|www\.|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}|\+?[0-9][0-9 .-]{7,}|@[a-z0-9_]{2,})' then raise exception 'contact_details' using errcode='P0001'; end if;
  if exists(select 1 from public.question_forbidden_terms where is_active and public.normalize_question_text(clean_body) ~ ('(^| )'||public.normalize_question_text(term)||'( |$)')) then raise exception 'forbidden_content' using errcode='P0001'; end if;
  insert into public.comments(question_id,author_id,body) values(requested_question_id,actor,clean_body) returning * into created;
  insert into public.interaction_events(id,user_id,event_type,question_id,occurred_at) values(gen_random_uuid(),actor,'comment',requested_question_id,now());
  return query select created.id,created.body,p.username,p.account_type='verified',created.created_at from public.profiles p where p.user_id=actor;
end; $$;

create function public.get_question_comments(requested_question_id uuid,requested_before timestamptz default null,requested_before_id uuid default null,requested_limit integer default 20)
returns table(comment_id uuid,body text,author_username text,author_verified boolean,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select c.id,c.body,p.username,p.account_type='verified',c.created_at
  from public.comments c join public.profiles p on p.user_id=c.author_id
  where public.can_view_question(requested_question_id,auth.uid()) and c.question_id=requested_question_id
    and c.moderation_status='visible' and p.account_status='active'
    and (requested_before is null or (c.created_at,c.id)<(requested_before,requested_before_id))
  order by c.created_at desc,c.id desc limit least(greatest(requested_limit,1),50);
$$;

create function public.submit_report(requested_target public.report_target_type,requested_target_id uuid,requested_reason public.report_reason,requested_details text default null)
returns table(report_id uuid,created boolean) language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target_question uuid; existing uuid; inserted uuid; clean_details text:=nullif(trim(requested_details),'');
begin
  if actor is null or not public.is_active_user(actor) then raise exception 'not_authorized' using errcode='P0001'; end if;
  if clean_details is not null and char_length(clean_details)>500 then raise exception 'invalid_details' using errcode='P0001'; end if;
  if requested_target='question' then
    target_question:=requested_target_id;
    if not public.can_view_question(target_question,actor) then raise exception 'target_unavailable' using errcode='P0001'; end if;
    select id into existing from public.reports where reporter_id=actor and question_id=requested_target_id and status in ('pending','reviewing');
    if existing is null then
      insert into public.reports(reporter_id,target_type,question_id,reason,details) values(actor,'question',requested_target_id,requested_reason,clean_details) returning id into inserted;
      update public.questions set report_count=report_count+1 where id=requested_target_id;
    end if;
  else
    select question_id into target_question from public.comments where id=requested_target_id and moderation_status<>'removed';
    if target_question is null or not public.can_view_question(target_question,actor) then raise exception 'target_unavailable' using errcode='P0001'; end if;
    select id into existing from public.reports where reporter_id=actor and comment_id=requested_target_id and status in ('pending','reviewing');
    if existing is null then insert into public.reports(reporter_id,target_type,comment_id,reason,details) values(actor,'comment',requested_target_id,requested_reason,clean_details) returning id into inserted; end if;
  end if;
  if inserted is not null then insert into public.interaction_events(id,user_id,event_type,question_id,occurred_at) values(gen_random_uuid(),actor,'report',target_question,now()); end if;
  return query select coalesce(inserted,existing),inserted is not null;
exception when unique_violation then
  return query select id,false from public.reports where reporter_id=actor and status in ('pending','reviewing') and ((requested_target='question' and question_id=requested_target_id) or (requested_target='comment' and comment_id=requested_target_id)) limit 1;
end; $$;

alter table public.comments enable row level security;
alter table public.reports enable row level security;
create policy comments_visible_or_moderator on public.comments for select to authenticated using(
  (moderation_status='visible' and public.can_view_question(question_id,auth.uid()))
  or exists(select 1 from public.profiles where user_id=auth.uid() and account_status='active' and role in ('moderator','admin'))
);
create policy reports_select_own on public.reports for select to authenticated using(reporter_id=auth.uid() and public.is_active_user());

revoke all on public.comments,public.reports from anon,authenticated;
grant select(id,question_id,author_id,body,moderation_status,created_at,updated_at) on public.comments to authenticated;
grant select(id,reporter_id,target_type,question_id,comment_id,reason,details,status,created_at,updated_at) on public.reports to authenticated;
revoke all on function public.can_view_question(uuid,uuid),public.create_comment(uuid,text),public.get_question_comments(uuid,timestamptz,uuid,integer),public.submit_report(public.report_target_type,uuid,public.report_reason,text) from public;
grant execute on function public.can_view_question(uuid,uuid),public.create_comment(uuid,text),public.get_question_comments(uuid,timestamptz,uuid,integer),public.submit_report(public.report_target_type,uuid,public.report_reason,text) to authenticated;
