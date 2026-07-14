create table public.rate_limit_buckets (
  scope text not null check(scope in ('auth','publication','vote','report','event','admin')),
  subject_hash text not null check(length(subject_hash)=64),
  window_started_at timestamptz not null,
  request_count integer not null check(request_count>0),
  updated_at timestamptz not null default now(),
  primary key(scope,subject_hash)
);
alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from anon,authenticated;

create function public.consume_rate_limit(requested_scope text,requested_subject_hash text,requested_limit integer,requested_window_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare bucket public.rate_limit_buckets; request_time timestamptz:=clock_timestamp();
begin
  if auth.role()<>'service_role' or requested_scope not in ('auth','publication','vote','report','event','admin')
    or length(requested_subject_hash)<>64 or requested_limit not between 1 and 1000 or requested_window_seconds not between 1 and 86400 then
    raise exception 'invalid_rate_limit' using errcode='P0001';
  end if;
  insert into public.rate_limit_buckets(scope,subject_hash,window_started_at,request_count)
  values(requested_scope,requested_subject_hash,request_time,1)
  on conflict(scope,subject_hash) do update set
    window_started_at=case when public.rate_limit_buckets.window_started_at <= request_time-make_interval(secs=>requested_window_seconds) then request_time else public.rate_limit_buckets.window_started_at end,
    request_count=case when public.rate_limit_buckets.window_started_at <= request_time-make_interval(secs=>requested_window_seconds) then 1 else public.rate_limit_buckets.request_count+1 end,
    updated_at=request_time
  returning * into bucket;
  return bucket.request_count<=requested_limit;
end; $$;
revoke all on function public.consume_rate_limit(text,text,integer,integer) from public;
grant execute on function public.consume_rate_limit(text,text,integer,integer) to service_role;

create table public.question_metrics_daily (
  question_id uuid not null references public.questions(id) on delete cascade,
  metric_date date not null,
  impressions integer not null default 0,
  skips integer not null default 0,
  dwell_events integer not null default 0,
  dwell_ms bigint not null default 0,
  primary key(question_id,metric_date)
);
alter table public.question_metrics_daily enable row level security;
revoke all on public.question_metrics_daily from anon,authenticated;

create function public.run_operational_maintenance(requested_retention_days integer)
returns table(aggregated_rows bigint,deleted_events bigint,deleted_impressions bigint,deleted_buckets bigint)
language plpgsql security definer set search_path='' as $$
declare events_deleted bigint:=0; impressions_deleted bigint:=0; buckets_deleted bigint:=0; aggregates bigint:=0; cutoff timestamptz;
begin
  if auth.role()<>'service_role' or requested_retention_days not between 30 and 730 then raise exception 'maintenance_denied' using errcode='P0001'; end if;
  cutoff:=now()-make_interval(days=>requested_retention_days);
  insert into public.question_metrics_daily(question_id,metric_date,impressions,skips,dwell_events,dwell_ms)
  select question_id,occurred_at::date,count(*) filter(where event_type='impression'),count(*) filter(where event_type='skip'),count(*) filter(where event_type='dwell'),coalesce(sum(dwell_ms) filter(where event_type='dwell'),0)
  from public.interaction_events where question_id is not null and occurred_at<current_date
  group by question_id,occurred_at::date
  on conflict(question_id,metric_date) do update set impressions=excluded.impressions,skips=excluded.skips,dwell_events=excluded.dwell_events,dwell_ms=excluded.dwell_ms;
  get diagnostics aggregates=row_count;
  delete from public.interaction_events where received_at<cutoff; get diagnostics events_deleted=row_count;
  delete from public.feed_impressions where received_at<cutoff; get diagnostics impressions_deleted=row_count;
  delete from public.rate_limit_buckets where updated_at<now()-interval '2 days'; get diagnostics buckets_deleted=row_count;
  return query select aggregates,events_deleted,impressions_deleted,buckets_deleted;
end; $$;
revoke all on function public.run_operational_maintenance(integer) from public;
grant execute on function public.run_operational_maintenance(integer) to service_role;
