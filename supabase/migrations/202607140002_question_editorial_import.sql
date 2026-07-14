create type public.question_editorial_type as enum (
  'evergreen', 'topical', 'debate', 'experience', 'prediction'
);
create type public.question_format as enum (
  'opinion', 'projection', 'regulation', 'comportement', 'dilemme'
);

alter table public.questions
  add column external_id text,
  add column sensitivity public.tag_sensitivity,
  add column editorial_type public.question_editorial_type,
  add column question_format public.question_format,
  add column publication_priority smallint not null default 0,
  add column editorial_note text,
  add column editorial_organisation_id uuid references public.sponsor_organisations(id) on delete restrict,
  add column source_content_hash text,
  add column import_batch_id uuid,
  add column imported_at timestamptz,
  add constraint questions_external_id_format check (
    external_id is null or external_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  add constraint questions_publication_priority check (publication_priority between 0 and 100),
  add constraint questions_editorial_note_length check (
    editorial_note is null or char_length(editorial_note) <= 2000
  ),
  add constraint questions_source_content_hash_format check (
    source_content_hash is null or source_content_hash ~ '^[a-f0-9]{64}$'
  ),
  add constraint questions_import_metadata_complete check (
    (external_id is null and source_content_hash is null and imported_at is null)
    or (external_id is not null and source_content_hash is not null and imported_at is not null
      and sensitivity is not null and editorial_type is not null and question_format is not null)
  );

create unique index questions_external_id_key
  on public.questions (external_id) where external_id is not null;
create index questions_import_batch_idx
  on public.questions (import_batch_id) where import_batch_id is not null;

create function public.import_editorial_question(
  requested_external_id text,
  requested_content_hash text,
  requested_author_id uuid,
  requested_organisation_id uuid,
  requested_category_id uuid,
  requested_text text,
  requested_options text[],
  requested_tag_ids uuid[],
  requested_min_age smallint,
  requested_max_age smallint,
  requested_sensitivity public.tag_sensitivity,
  requested_editorial_type public.question_editorial_type,
  requested_question_format public.question_format,
  requested_publication_priority smallint,
  requested_status public.question_status,
  requested_editorial_note text,
  requested_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.questions%rowtype;
  created_question_id uuid;
  created_series_id uuid;
  option_value text;
  option_position integer := 0;
  tag_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select * into existing from public.questions where external_id = requested_external_id for update;
  if existing.id is not null then
    if existing.source_content_hash = requested_content_hash then
      return jsonb_build_object('outcome', 'skipped', 'question_id', existing.id);
    end if;
    raise exception 'external_id_conflict' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.questions
    where normalized_text = public.normalize_question_text(requested_text)
  ) then
    raise exception 'duplicate_question' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.profiles
    where user_id = requested_author_id and account_status = 'active'
  ) then
    raise exception 'editorial_account_unavailable' using errcode = 'P0001';
  end if;

  if requested_organisation_id is not null and not exists (
    select 1 from public.sponsor_organisations
    where id = requested_organisation_id and owner_user_id = requested_author_id
  ) then
    raise exception 'editorial_organisation_unavailable' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.categories where id = requested_category_id and is_active
  ) then
    raise exception 'invalid_category' using errcode = 'P0001';
  end if;

  if cardinality(requested_options) not between 2 and 6
    or cardinality(requested_tag_ids) > 3
    or requested_status not in ('draft', 'published')
    or requested_publication_priority not between 0 and 100 then
    raise exception 'invalid_editorial_question' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from unnest(requested_tag_ids) requested(id)
    left join public.tags t on t.id = requested.id and t.is_active
    left join public.category_tags ct on ct.tag_id = requested.id and ct.category_id = requested_category_id
    where t.id is null or ct.tag_id is null
  ) then
    raise exception 'invalid_tags' using errcode = 'P0001';
  end if;

  insert into public.question_series (creator_id)
  values (requested_author_id)
  returning id into created_series_id;

  insert into public.questions (
    author_id, category_id, series_id, text, normalized_text,
    target_min_age, target_max_age, status, published_at, external_id,
    sensitivity, editorial_type, question_format, publication_priority, editorial_note,
    editorial_organisation_id, source_content_hash, import_batch_id, imported_at
  ) values (
    requested_author_id, requested_category_id, created_series_id, trim(requested_text),
    public.normalize_question_text(requested_text), requested_min_age, requested_max_age,
    requested_status, case when requested_status = 'draft' then null else now() end,
    requested_external_id, requested_sensitivity, requested_editorial_type, requested_question_format,
    requested_publication_priority, nullif(trim(requested_editorial_note), ''),
    requested_organisation_id, requested_content_hash, requested_batch_id, now()
  ) returning id into created_question_id;

  foreach option_value in array requested_options loop
    option_position := option_position + 1;
    insert into public.question_options (question_id, position, text, normalized_text)
    values (
      created_question_id, option_position, trim(option_value),
      public.normalize_question_text(option_value)
    );
  end loop;

  foreach tag_id in array requested_tag_ids loop
    insert into public.question_tags (question_id, tag_id)
    values (created_question_id, tag_id);
  end loop;

  return jsonb_build_object('outcome', 'imported', 'question_id', created_question_id);
end;
$$;

revoke all on function public.import_editorial_question(
  text,text,uuid,uuid,uuid,text,text[],uuid[],smallint,smallint,
  public.tag_sensitivity,public.question_editorial_type,public.question_format,smallint,
  public.question_status,text,uuid
) from public, anon, authenticated;
grant execute on function public.import_editorial_question(
  text,text,uuid,uuid,uuid,text,text[],uuid[],smallint,smallint,
  public.tag_sensitivity,public.question_editorial_type,public.question_format,smallint,
  public.question_status,text,uuid
) to service_role;
