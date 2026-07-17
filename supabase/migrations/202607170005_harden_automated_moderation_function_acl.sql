begin;

-- Server-only moderated submission.
revoke all on function public.submit_moderated_question(
  uuid,
  text,
  uuid,
  text[],
  text[],
  smallint,
  smallint,
  uuid,
  boolean,
  jsonb
) from public, anon, authenticated;
grant execute on function public.submit_moderated_question(
  uuid,
  text,
  uuid,
  text[],
  text[],
  smallint,
  smallint,
  uuid,
  boolean,
  jsonb
) to service_role;

-- Authenticated users may read only their own open review through auth.uid().
revoke all on function public.get_current_question_review_status()
  from public, anon, authenticated, service_role;
grant execute on function public.get_current_question_review_status()
  to authenticated;

-- Supabase administrators also use the authenticated database role. The
-- function itself rejects every caller for which public.is_admin() is false.
revoke all on function public.get_pending_automated_moderation_queue(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_pending_automated_moderation_queue(integer, integer)
  to authenticated;

commit;
