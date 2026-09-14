-- Profile pictures, and a cover photo for the home screen.
--
-- The files live in a PRIVATE storage bucket and are fetched through signed
-- URLs that expire. A public bucket would have been one line shorter and would
-- have made every couple's photo of themselves readable by anyone who ever saw
-- the link -- which contradicts the privacy policy's promise that nothing you
-- put in the app is visible on the web.
--
-- Paths are fixed by convention and the policies below enforce them:
--
--   avatars/<user_id>/<filename>   -- your profile picture, you write it
--   covers/<couple_id>/<filename>  -- your shared cover, either of you writes it
--
-- Both partners can READ each other's, because that is the entire point; only
-- you can write your own avatar.
--
-- Run after couples.sql.

alter table profiles add column if not exists avatar_path text;
alter table couples add column if not exists cover_path text;

-- Either partner can set the couple's cover photo. couples had no update
-- policy at all before this, so nothing could be written to the row.
--
-- This grants the row, not the columns. Narrowing to specific columns happens
-- in free-time-prefs.sql, which is the last file to add a member-writable
-- column to couples -- doing it here would either fail (those columns don't
-- exist yet) or be undone by re-running this file afterwards.
drop policy if exists "Members can update their couple" on couples;
create policy "Members can update their couple" on couples
  for update to authenticated
  using (id = my_couple_id())
  with check (id = my_couple_id());


-- `do update`, not `do nothing`. The whole premise of this file is a PRIVATE
-- bucket; if a `photos` bucket already exists and is public -- created in the
-- dashboard, or flipped public during an experiment -- `do nothing` would
-- leave it public and report success. Every avatar and cover photo would then
-- be readable by anyone with the URL, and the policies below would be
-- decorative, because a public bucket serves objects without consulting them.
--
-- The limits are enforcement, not validation: the app resizes before upload,
-- but storage is reachable directly with any user's JWT, so the size and type
-- caps have to live here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects policies. name is the full path inside the bucket, so
-- (storage.foldername(name))[1] is 'avatars' or 'covers' and [2] is the id.

drop policy if exists "Read photos in my couple" on storage.objects;
create policy "Read photos in my couple" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (
      -- Your own avatar, or your partner's: their id must be in your couple.
      (
        (storage.foldername(name))[1] = 'avatars'
        and exists (
          select 1 from profiles p
          where p.id::text = (storage.foldername(name))[2]
            and (p.id = auth.uid() or p.couple_id = my_couple_id())
        )
      )
      or
      -- Your couple's cover photo.
      (
        (storage.foldername(name))[1] = 'covers'
        and (storage.foldername(name))[2] = my_couple_id()::text
      )
    )
  );

drop policy if exists "Write photos in my couple" on storage.objects;
create policy "Write photos in my couple" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (
      -- Only you may write your own avatar. A partner replacing your profile
      -- picture is not a feature.
      ((storage.foldername(name))[1] = 'avatars'
        and (storage.foldername(name))[2] = auth.uid()::text)
      or
      ((storage.foldername(name))[1] = 'covers'
        and (storage.foldername(name))[2] = my_couple_id()::text)
    )
  );

drop policy if exists "Replace photos in my couple" on storage.objects;
create policy "Replace photos in my couple" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos'
    and (
      ((storage.foldername(name))[1] = 'avatars'
        and (storage.foldername(name))[2] = auth.uid()::text)
      or
      ((storage.foldername(name))[1] = 'covers'
        and (storage.foldername(name))[2] = my_couple_id()::text)
    )
  );

drop policy if exists "Remove photos in my couple" on storage.objects;
create policy "Remove photos in my couple" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and (
      ((storage.foldername(name))[1] = 'avatars'
        and (storage.foldername(name))[2] = auth.uid()::text)
      or
      ((storage.foldername(name))[1] = 'covers'
        and (storage.foldername(name))[2] = my_couple_id()::text)
    )
  );

notify pgrst, 'reload schema';
