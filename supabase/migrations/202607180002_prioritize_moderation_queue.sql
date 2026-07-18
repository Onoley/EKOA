begin;

-- get_moderation_queue previously listed grouped reports strictly by
-- created_at (FIFO), so a target with many reporters could sit behind an
-- older target with only its minimum of 3. Surface the most-reported
-- content first so moderators see the highest-signal cases at the top.
create or replace function public.get_moderation_queue(
  requested_status public.report_status default 'pending',
  requested_limit integer default 50
)
returns table(
  report_id uuid,
  target_type public.report_target_type,
  target_id uuid,
  reason public.report_reason,
  details text,
  status public.report_status,
  created_at timestamptz,
  target_excerpt text,
  report_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  return query
  with filtered_reports as (
    select r.*
    from public.reports r
    where (
      requested_status in ('pending', 'reviewing')
      and r.status in ('pending', 'reviewing')
    ) or (
      requested_status not in ('pending', 'reviewing')
      and r.status = requested_status
    )
  ), question_groups as (
    select
      r.question_id,
      count(*)::bigint grouped_report_count
    from filtered_reports r
    where r.target_type = 'question' and r.question_id is not null
    group by r.question_id
    having count(distinct r.reporter_id) >= 3
      or requested_status not in ('pending', 'reviewing')
  ), question_rows as (
    select
      representative.id report_id,
      representative.target_type,
      representative.question_id target_id,
      representative.reason,
      representative.details,
      representative.status,
      representative.created_at,
      groups.grouped_report_count report_count
    from question_groups groups
    cross join lateral (
      select r.*
      from filtered_reports r
      where r.question_id = groups.question_id
      order by r.created_at, r.id
      limit 1
    ) representative
  ), comment_rows as (
    select
      r.id report_id,
      r.target_type,
      r.comment_id target_id,
      r.reason,
      r.details,
      r.status,
      r.created_at,
      1::bigint report_count
    from filtered_reports r
    where r.target_type = 'comment' and r.comment_id is not null
  ), queue as (
    select * from question_rows
    union all
    select * from comment_rows
  )
  select
    queue.report_id,
    queue.target_type,
    queue.target_id,
    queue.reason,
    queue.details,
    queue.status,
    queue.created_at,
    case
      when queue.target_type = 'question' then q.text
      else c.body
    end,
    queue.report_count
  from queue
  left join public.questions q
    on queue.target_type = 'question' and q.id = queue.target_id
  left join public.comments c
    on queue.target_type = 'comment' and c.id = queue.target_id
  order by queue.report_count desc, queue.created_at
  limit least(greatest(requested_limit, 1), 100);
end;
$$;

commit;
