begin;
select plan(5);
select has_function('public','discover_questions',array['uuid','discovery_mode','text','text','timestamp with time zone','integer','integer'],'discovery function exists');
select has_index('public','questions','questions_text_fts_idx','question full text index exists');
select has_index('public','tags','tags_name_trgm_idx','tag trigram index exists');
select has_index('public','categories','categories_name_trgm_idx','category trigram index exists');
select has_index('public','profiles','profiles_username_trgm_idx','username trigram index exists');
select * from finish();
rollback;
