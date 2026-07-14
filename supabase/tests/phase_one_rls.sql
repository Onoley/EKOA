begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'one@example.test', '', now(), now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two@example.test', '', now(), now(), now());

update public.profiles set username = 'user_one', username_normalized = 'user_one', birth_year = 1990,
  department_code = '75', professional_activity = 'employee', gender = 'prefer_not_to_say',
  account_status = 'active', onboarding_completed_at = now()
where user_id = '10000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is((select count(*)::integer from public.profiles), 1, 'un utilisateur lit uniquement son profil');
select is((select username from public.profiles limit 1), 'user_one', 'le propriétaire lit son nom utilisateur');
select is((select count(*)::integer from public.categories), 17, 'un compte actif lit les catégories actives');
select throws_ok(
  $$ update public.profiles set role = 'admin' where user_id = '10000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'le client ne peut pas élever son rôle'
);
select throws_ok(
  $$ insert into public.category_follows (user_id, category_id) select '10000000-0000-0000-0000-000000000002', id from public.categories limit 1 $$,
  '42501', null, 'le client ne suit pas au nom d’un tiers'
);
select lives_ok(
  $$ insert into public.category_follows (user_id, category_id) select '10000000-0000-0000-0000-000000000001', id from public.categories limit 1 $$,
  'un compte actif suit une catégorie pour lui-même'
);
select is((select count(*)::integer from public.category_follows), 1, 'le propriétaire lit ses suivis');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.category_follows), 0, 'un autre utilisateur ne lit pas les suivis privés');

select * from finish();
rollback;
