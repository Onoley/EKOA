begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(5);

select has_table('public', 'questions', 'la table questions existe');
select has_table('public', 'question_options', 'la table des réponses existe');
select has_function('public', 'save_question_draft', array['uuid','text','uuid','text[]','text[]','smallint','smallint','uuid'], 'la sauvegarde transactionnelle existe');
select has_function('public', 'publish_question', array['uuid','boolean'], 'la publication transactionnelle existe');
select is(public.normalize_question_text('Êtes-vous d’accord ?'), 'etes vous d accord', 'la normalisation française est stable');

select * from finish();
rollback;
