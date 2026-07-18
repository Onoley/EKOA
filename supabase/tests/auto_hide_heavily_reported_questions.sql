begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(15);

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
select
  ('95000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'auto-hide-' || n || '@example.test', '', now(), now()
from generate_series(1, 13) n;
-- 1 = author, 2..12 = 11 distinct reporters, 13 = admin

update public.profiles
set username = 'auto_hide_' || right(user_id::text, 2),
    username_normalized = 'auto_hide_' || right(user_id::text, 2),
    birth_year = 1990,
    department_code = '75',
    professional_activity = 'employee',
    gender = 'prefer_not_to_say',
    role = case
      when user_id = '95000000-0000-4000-8000-000000000013' then 'admin'::public.user_role
      else 'user'::public.user_role
    end,
    account_status = 'active',
    onboarding_completed_at = now()
where user_id::text like '95000000-0000-4000-8000-%';

select set_config('test.category_id', 'a890a47f-01ec-59b4-ad2b-e3afed216fde', true);

-- ===== scenario 1: 10 distinct active reporters auto-hide a published
-- question; an admin's explicit approval exempts it from further auto-hides
-- (ADR-034) =====

set local role authenticated;
select pg_temp.set_test_actor('95000000-0000-4000-8000-000000000001');
select set_config(
  'test.q1',
  public.save_question_draft(
    null, 'Combien de temps passez-vous en ligne chaque jour ?',
    current_setting('test.category_id')::uuid,
    array['Moins de 2h', 'Plus de 2h'], array[]::text[], null, null, null
  )::text,
  true
);
select lives_ok(
  $$ select public.publish_question(current_setting('test.q1')::uuid) $$,
  'la question de test est publiée'
);

do $$
declare i integer;
begin
  for i in 2..10 loop
    perform pg_temp.set_test_actor(('95000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid);
    perform public.submit_report('question', current_setting('test.q1')::uuid, 'other', null);
  end loop;
end;
$$;

select is(
  (select status::text from public.questions where id = current_setting('test.q1')::uuid),
  'published',
  '9 signalements actifs ne masquent pas encore la question'
);

select pg_temp.set_test_actor('95000000-0000-4000-8000-000000000011');
select is(
  (
    select created from public.submit_report(
      'question', current_setting('test.q1')::uuid, 'other', null
    )
  ),
  true,
  'le dixième signalement distinct est créé'
);
-- status/visibility checks run as the admin: once 'limited', RLS hides the
-- question from ordinary users (including the reporter who just flagged it).
select pg_temp.set_test_actor('95000000-0000-4000-8000-000000000013');
select is(
  (select status::text from public.questions where id = current_setting('test.q1')::uuid),
  'limited',
  'le dixième signalement actif masque automatiquement la question'
);
select is(
  (select moderation_status::text from public.questions where id = current_setting('test.q1')::uuid),
  'flagged',
  'la question masquée automatiquement est marquée flagged'
);

select set_config(
  'test.q1_report',
  (select report_id::text from public.get_moderation_queue('pending', 50) where target_id = current_setting('test.q1')::uuid),
  true
);
select lives_ok(
  $$ select public.moderate_report(current_setting('test.q1_report')::uuid, 'restore_question', 'Contenu vérifié, aucune violation') $$,
  'un administrateur valide explicitement la question'
);
select is(
  (select status::text from public.questions where id = current_setting('test.q1')::uuid),
  'published',
  'la validation administrateur republie la question'
);
select is(
  (select moderation_status::text from public.questions where id = current_setting('test.q1')::uuid),
  'approved',
  'la validation administrateur marque la question approved'
);

select pg_temp.set_test_actor('95000000-0000-4000-8000-000000000012');
select is(
  (
    select created from public.submit_report(
      'question', current_setting('test.q1')::uuid, 'other', null
    )
  ),
  true,
  'un nouveau signalement reste possible après validation'
);
select is(
  (select status::text from public.questions where id = current_setting('test.q1')::uuid),
  'published',
  'une question déjà approuvée par un administrateur n’est plus masquée automatiquement'
);
select is(
  (select moderation_status::text from public.questions where id = current_setting('test.q1')::uuid),
  'approved',
  'le statut de modération approved est conservé après le nouveau signalement'
);

-- ===== scenario 2: la file d'administration priorise le nombre de
-- signalements, pas l'ordre d'arrivée =====

select pg_temp.set_test_actor('95000000-0000-4000-8000-000000000001');
select set_config(
  'test.q_old',
  public.save_question_draft(
    null, 'Question ancienne avec peu de signalements ?',
    current_setting('test.category_id')::uuid,
    array['Oui', 'Non'], array[]::text[], null, null, null
  )::text,
  true
);
select public.publish_question(current_setting('test.q_old')::uuid);

select set_config(
  'test.q_new',
  public.save_question_draft(
    null, 'Question récente avec beaucoup de signalements ?',
    current_setting('test.category_id')::uuid,
    array['Oui', 'Non'], array[]::text[], null, null, null
  )::text,
  true
);
select public.publish_question(current_setting('test.q_new')::uuid);

do $$
declare i integer;
begin
  for i in 2..4 loop
    perform pg_temp.set_test_actor(('95000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid);
    perform public.submit_report('question', current_setting('test.q_old')::uuid, 'other', null);
  end loop;
  for i in 5..9 loop
    perform pg_temp.set_test_actor(('95000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid);
    perform public.submit_report('question', current_setting('test.q_new')::uuid, 'other', null);
  end loop;
end;
$$;

select pg_temp.set_test_actor('95000000-0000-4000-8000-000000000013');
select is(
  (
    select count(*)::integer from public.get_moderation_queue('pending', 50)
    where target_id in (current_setting('test.q_old')::uuid, current_setting('test.q_new')::uuid)
  ),
  2,
  'les deux questions signalées apparaissent dans la file'
);
select is(
  (
    select target_id from public.get_moderation_queue('pending', 50)
    where target_id in (current_setting('test.q_old')::uuid, current_setting('test.q_new')::uuid)
    order by report_count desc
    limit 1
  ),
  current_setting('test.q_new')::uuid,
  'la question avec le plus de signalements (5) passe devant la plus ancienne (3)'
);
select is(
  (
    select report_count from public.get_moderation_queue('pending', 50)
    where target_id = current_setting('test.q_new')::uuid
  ),
  5::bigint,
  'la carte de la question récente indique ses 5 signalements'
);
select is(
  (
    select report_count from public.get_moderation_queue('pending', 50)
    where target_id = current_setting('test.q_old')::uuid
  ),
  3::bigint,
  'la carte de la question ancienne indique ses 3 signalements'
);

reset role;
select * from finish();
rollback;
