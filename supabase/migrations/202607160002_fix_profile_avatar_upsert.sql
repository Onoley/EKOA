drop policy if exists "profile_avatars_select_own" on storage.objects;

create policy "profile_avatars_select_own"
on storage.objects for select to authenticated
using (
  bucket_id='profile-avatars'
  and (storage.foldername(name))[1]=auth.uid()::text
  and name=auth.uid()::text||'/avatar'
  and public.is_active_user()
);
