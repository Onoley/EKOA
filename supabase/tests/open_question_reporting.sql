begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(22);

create function pg_temp.set_test_actor(requested_user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', requested_user_id, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', requested_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

insert into auth.users(
  id, instance_id, aud, role, email, encrypted_password,
  created_at, updated_at
)
values
  ('91000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'open-author@example.test', '', now(), now()),
  ('91000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'open-reporter-one@example.test', '', now(), now()),
  ('91000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'open-reporter-two@example.test', '', now(), now()),
  ('91000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'open-reporter-three@example.test', '', now(), now()),
  ('91000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'open-admin@example.test', '', now(), now());

update public.profiles
set username = case user_id
      when '91000000-0000-4000-8000-000000000001' then 'open_author'
      when '91000000-0000-4000-8000-000000000002' then 'open_reporter_1'
      when '91000000-0000-4000-8000-000000000003' then 'open_reporter_2'
      when '91000000-0000-4000-8000-000000000004' then 'open_reporter_3'
      else 'open_admin'
    end,
    username_normalized = case user_id
      when '91000000-0000-4000-8000-000000000001' then 'open_author'
      when '91000000-0000-4000-8000-000000000002' then 'open_reporter_1'
      when '91000000-0000-4000-8000-000000000003' then 'open_reporter_2'
      when '91000000-0000-4000-8000-000000000004' then 'open_reporter_3'
      else 'open_admin'
    end,
    birth_year = 1990,
    department_code = '75',
    professional_activity = 'employee',
    gender = 'prefer_not_to_say',
    role = case
      when user_id = '91000000-0000-4000-8000-000000000005' then 'admin'::public.user_role
      else 'user'::public.user_role
    end,
    account_status = 'active',
    onboarding_completed_at = now()
where user_id::text like '91000000-0000-4000-8000-%';

-- If legacy quotas were still read, the second publication below would fail.
update public.question_settings
set active_limit = 1,
    ordinary_rolling_limit = 1,
    hourly_publish_limit = 1;

select set_config(
  'test.category_id',
  'a890a47f-01ec-59b4-ad2b-e3afed216fde',
  true
);

set local role authenticated;
select pg_temp.set_test_actor('91000000-0000-4000-8000-000000000001');
select set_config(
  'test.question_one',
  public.save_question_draft(
    null,
    'Ce connard consulte-t-il https://example.test ?',
    current_setting('test.category_id')::uuid,
    array['Oui, souvent', 'Non, jamais'],
    array['LGBTQIA Plus'],
    null,
    null,
    null
  )::text,
  true
);

select ok(
  exists(
    select 1 from public.questions
    where id = current_setting('test.question_one')::uuid and status = 'draft'
  ),
  'la question sans pré-modération est enregistrée comme brouillon'
);
select lives_ok(
  $$ select public.publish_question(current_setting('test.question_one')::uuid, false) $$,
  'la première question est publiée immédiatement'
);
select is(
  (
    select status::text from public.questions
    where id = current_setting('test.question_one')::uuid
  ),
  'published',
  'le statut public est appliqué sans revue'
);
select is(
  (
    select count(*)::integer from public.question_tags
    where question_id = current_setting('test.question_one')::uuid
  ),
  1,
  'un tag contrôlé existant est rattaché'
);

select set_config(
  'test.question_two',
  public.save_question_draft(
    null,
    'Ce connard consulte-t-il https://example.test ?',
    current_setting('test.category_id')::uuid,
    array['Oui, souvent', 'Non, jamais'],
    array['LGBTQIA Plus'],
    null,
    null,
    null
  )::text,
  true
);
select ok(
  current_setting('test.question_two')::uuid
    is distinct from current_setting('test.question_one')::uuid,
  'une question identique peut être enregistrée'
);
select lives_ok(
  $$ select public.publish_question(current_setting('test.question_two')::uuid, false) $$,
  'la question identique dépasse les anciens quotas sans blocage'
);
select is(
  (
    select count(*)::integer
    from public.questions
    where author_id = '91000000-0000-4000-8000-000000000001'
      and status = 'published'
  ),
  2,
  'les deux questions sont publiées'
);

select pg_temp.set_test_actor('91000000-0000-4000-8000-000000000002');
select is(
  (
    select created from public.submit_report(
      'question', current_setting('test.question_one')::uuid, 'spam', 'Premier signalement'
    )
  ),
  true,
  'le premier signalement distinct est créé'
);

select pg_temp.set_test_actor('91000000-0000-4000-8000-000000000005');
select is(
  (select count(*)::integer from public.get_moderation_queue('pending', 50)),
  0,
  'un signalement ne crée aucune carte administrateur'
);

select pg_temp.set_test_actor('91000000-0000-4000-8000-000000000002');
select is(
  (
    select created from public.submit_report(
      'question', current_setting('test.question_one')::uuid, 'spam', 'Doublon'
    )
  ),
  false,
  'répéter le signalement du même membre reste idempotent'
);
select is(
  (
    select count(*)::integer from public.reports
    where question_id = current_setting('test.question_one')::uuid
      and status in ('pending', 'reviewing')
  ),
  1,
  'le doublon ne compte pas comme deuxième signalement'
);

select pg_temp.set_test_actor('91000000-0000-4000-8000-000000000003');
select is(
  (
    select created from public.submit_report(
      'question', current_setting('test.question_one')::uuid, 'other', 'Deuxième membre'
    )
  ),
  true,
  'le deuxième signalement distinct est créé'
);

select pg_temp.set_test_actor('91000000-0000-4000-8000-000000000005');
select is(
  (select count(*)::integer from public.get_moderation_queue('pending', 50)),
  0,
  'deux signalements ne créent encore aucune carte'
);

select pg_temp.set_test_actor('91000000-0000-4000-8000-000000000004');
select is(
  (
    select created from public.submit_report(
      'question', current_setting('test.question_one')::uuid, 'misinformation', 'Troisième membre'
    )
  ),
  true,
  'le troisième signalement distinct est créé'
);

select pg_temp.set_test_actor('91000000-0000-4000-8000-000000000005');
select is(
  (select count(*)::integer from public.get_moderation_queue('pending', 50)),
  1,
  'le troisième signalement crée une seule carte groupée'
);
select is(
  (select report_count from public.get_moderation_queue('pending', 50)),
  3::bigint,
  'la carte indique les trois signalements'
);
select is(
  (
    select status::text from public.questions
    where id = current_setting('test.question_one')::uuid
  ),
  'published',
  'la question reste publiée avant la décision administrateur'
);

select pg_temp.set_test_actor('91000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select * from public.get_moderation_queue('pending', 50) $$,
  'P0001',
  'not_authorized',
  'un membre ordinaire ne peut pas lire la file'
);

select pg_temp.set_test_actor('91000000-0000-4000-8000-000000000005');
select set_config(
  'test.report_id',
  (select report_id::text from public.get_moderation_queue('pending', 50)),
  true
);
select lives_ok(
  $$ select public.moderate_report(current_setting('test.report_id')::uuid, 'no_action', 'Aucune action nécessaire') $$,
  'la décision administrateur traite la carte groupée'
);
select is(
  (select count(*)::integer from public.get_moderation_queue('pending', 50)),
  0,
  'la carte disparaît après la décision'
);

reset role;
select is(
  (
    select count(*)::integer from public.reports
    where question_id = current_setting('test.question_one')::uuid
      and status = 'dismissed'
  ),
  3,
  'les trois signalements actifs sont classés ensemble'
);
select is(
  (
    select count(*)::integer from public.audit_log
    where action = 'moderate_report'
      and target_id = current_setting('test.question_one')::uuid
  ),
  1,
  'la décision groupée reste auditée'
);

select * from finish();
rollback;
