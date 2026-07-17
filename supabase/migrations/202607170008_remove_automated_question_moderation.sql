begin;

-- Automated question moderation is paused. Publish submissions that were held
-- by the automated review so removing the queue does not strand user content.
update public.questions
set status = 'published',
    moderation_status = 'clear',
    published_at = coalesce(published_at, now()),
    updated_at = now()
where automated_moderation_status in ('pending_admin_review', 'revision_required')
  and status = 'under_review';

drop function if exists public.get_current_question_review_status();
drop function if exists public.get_pending_automated_moderation_queue(integer, integer);
drop function if exists public.get_automated_moderation_dashboard(text, integer, integer);
drop function if exists public.get_automated_moderation_history(integer, integer);
drop function if exists public.get_my_moderated_question();
drop function if exists public.admin_decide_automated_question(uuid, uuid, text, text, text, text[], smallint);
drop function if exists public.resubmit_automated_question_revision(uuid, uuid, text, text[], jsonb);
drop function if exists public.submit_moderated_question(uuid, text, uuid, text[], text[], smallint, smallint, uuid, boolean, jsonb);
drop function if exists public.has_prohibited_contact_details(text);

drop table if exists public.question_moderation_warnings;
drop table if exists public.automated_moderation_decisions;
drop table if exists public.automated_moderation_queue;
drop table if exists public.question_moderation_checks;
drop table if exists public.question_text_versions;

drop index if exists public.questions_one_open_user_review_idx;

drop policy if exists questions_select_visible on public.questions;
create policy questions_select_visible on public.questions for select to authenticated using (
  author_id = auth.uid()
  or public.is_admin()
  or (status = 'published' and moderation_status in ('clear', 'approved') and public.is_active_user())
);
drop policy if exists options_select_visible on public.question_options;
create policy options_select_visible on public.question_options for select to authenticated using (
  exists(select 1 from public.questions q where q.id = question_id and (
    q.author_id = auth.uid() or public.is_admin()
    or (q.status = 'published' and q.moderation_status in ('clear', 'approved') and public.is_active_user())
  ))
);
drop policy if exists question_tags_select_visible on public.question_tags;
create policy question_tags_select_visible on public.question_tags for select to authenticated using (
  exists(select 1 from public.questions q where q.id = question_id and (
    q.author_id = auth.uid() or public.is_admin()
    or (q.status = 'published' and q.moderation_status in ('clear', 'approved') and public.is_active_user())
  ))
);

alter table public.questions
  drop column if exists automated_moderation_public_reason,
  drop column if exists automated_moderation_decided_at,
  drop column if exists automated_moderation_status,
  drop column if exists is_user_submission;

drop type if exists public.automated_moderation_priority;
drop type if exists public.automated_moderation_queue_status;
drop type if exists public.automated_question_moderation_status;

-- Restore the original authenticated draft/publication workflow.
grant execute on function public.save_question_draft(uuid, text, uuid, text[], text[], smallint, smallint, uuid) to authenticated;
grant execute on function public.publish_question(uuid, boolean) to authenticated;

commit;
