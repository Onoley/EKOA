begin;

-- ADR-033 keeps a question's status/visibility fully gated by an explicit
-- admin decision: "Les signalements seuls ne modifient ni son statut ni sa
-- visibilité." This migration narrows that gate rather than removing it:
-- once a question accumulates 10 distinct active reporters (well above the
-- 3-reporter threshold that only surfaces it in the admin queue), it is
-- auto-limited as a precaution while it awaits review — the same 'limited'
-- state a moderator can already set by hand via moderate_report. A question
-- an admin has explicitly validated (moderation_status = 'approved') is
-- exempt from here on: reporting stays open, but it never re-triggers the
-- automatic hide. See ADR-034 in docs/DECISIONS.md.
create or replace function public.submit_report(
  requested_target public.report_target_type,
  requested_target_id uuid,
  requested_reason public.report_reason,
  requested_details text default null
)
returns table(report_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target_question uuid;
  existing uuid;
  inserted uuid;
  clean_details text := nullif(trim(requested_details), '');
  active_reporters integer;
  current_status public.question_status;
  current_moderation_status public.question_moderation_status;
begin
  if actor is null or not public.is_active_user(actor) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if clean_details is not null and char_length(clean_details) > 500 then
    raise exception 'invalid_details' using errcode = 'P0001';
  end if;

  if requested_target = 'question' then
    target_question := requested_target_id;
    if not public.can_view_question(target_question, actor) then
      raise exception 'target_unavailable' using errcode = 'P0001';
    end if;

    select id into existing from public.reports
    where reporter_id = actor and question_id = requested_target_id and status in ('pending', 'reviewing');

    if existing is null then
      insert into public.reports(reporter_id, target_type, question_id, reason, details)
      values(actor, 'question', requested_target_id, requested_reason, clean_details)
      returning id into inserted;
      update public.questions set report_count = report_count + 1 where id = requested_target_id;

      select status, moderation_status
      into current_status, current_moderation_status
      from public.questions
      where id = requested_target_id
      for update;

      if current_status = 'published' and current_moderation_status <> 'approved' then
        select count(distinct reporter_id)
        into active_reporters
        from public.reports
        where question_id = requested_target_id and status in ('pending', 'reviewing');

        if active_reporters >= 10 then
          update public.questions
          set status = 'limited', moderation_status = 'flagged'
          where id = requested_target_id;
        end if;
      end if;
    end if;
  else
    select question_id into target_question from public.comments
    where id = requested_target_id and moderation_status <> 'removed';
    if target_question is null or not public.can_view_question(target_question, actor) then
      raise exception 'target_unavailable' using errcode = 'P0001';
    end if;

    select id into existing from public.reports
    where reporter_id = actor and comment_id = requested_target_id and status in ('pending', 'reviewing');
    if existing is null then
      insert into public.reports(reporter_id, target_type, comment_id, reason, details)
      values(actor, 'comment', requested_target_id, requested_reason, clean_details)
      returning id into inserted;
    end if;
  end if;

  if inserted is not null then
    insert into public.interaction_events(id, user_id, event_type, question_id, occurred_at)
    values(gen_random_uuid(), actor, 'report', target_question, now());
  end if;

  return query select coalesce(inserted, existing), inserted is not null;
exception when unique_violation then
  return query select id, false from public.reports
  where reporter_id = actor and status in ('pending', 'reviewing')
    and (
      (requested_target = 'question' and question_id = requested_target_id)
      or (requested_target = 'comment' and comment_id = requested_target_id)
    )
  limit 1;
end;
$$;

commit;
