create or replace function public.consume_rate_limit(requested_scope text,requested_subject_hash text,requested_limit integer,requested_window_seconds integer)
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
