begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(8);

select has_table('public', 'votes', 'la table votes existe');
select has_table('public', 'question_follows', 'la table des questions suivies existe');
select has_table('public', 'question_upvotes', 'la table des soutiens existe');
select col_is_pk('public', 'votes', 'id', 'un vote a une clé primaire');
select has_function('public', 'submit_vote', array['uuid','uuid'], 'le vote transactionnel existe');
select has_function('public', 'get_question_results', array['uuid'], 'la lecture protégée des résultats existe');
select has_function('public', 'set_question_follow', array['uuid','boolean'], 'le suivi idempotent existe');
select has_function('public', 'set_question_upvote', array['uuid','boolean'], 'le soutien répondant existe');

select * from finish();
rollback;
