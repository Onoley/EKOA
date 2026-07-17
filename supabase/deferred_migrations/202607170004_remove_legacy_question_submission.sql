-- Deferred migration: move this file into supabase/migrations/ only after the
-- Vercel deployment using submit_moderated_question() has been verified in
-- production. Historical questions and drafts are preserved.

revoke execute on function public.save_question_draft(
  uuid,
  text,
  uuid,
  text[],
  text[],
  smallint,
  smallint,
  uuid
) from authenticated;

revoke execute on function public.publish_question(uuid, boolean) from authenticated;

comment on function public.save_question_draft(uuid,text,uuid,text[],text[],smallint,smallint,uuid)
  is 'Legacy question submission RPC retained without client execution rights for historical compatibility.';

comment on function public.publish_question(uuid,boolean)
  is 'Legacy question publication RPC retained without client execution rights for historical compatibility.';
