-- Leaving a couple, and deleting an account.
--
-- Apple requires in-app account deletion, so this is a launch blocker rather
-- than a nicety. Unpairing shares almost all of its logic, so both live here.
--
-- The interesting part is what happens to shared things. Every table hangs off
-- auth.users with `on delete cascade`, which is right for your own data and
-- badly wrong for the couple's: deleting your account would take the
-- anniversary, every wishlist you happened to create, and every to-do you
-- added down with it, off your partner's phone, without either of you being
-- told. A couple's history should not be destroyed by the person who happened
-- to type it in.
--
-- So before an account is deleted, anything shared that is attributed to you
-- is handed to your partner, and only then are you removed. What goes is what
-- is genuinely yours alone: your busy blocks, your calendar choices, your
-- working hours, your push token, your profile. Your birthday goes too -- it
-- is about you, and it is meaningless once you are gone.
--
-- Run after work-hours.sql (any time; it only adds functions).

-- Hand everything shared to the remaining partner. Returns the partner's id,
-- or null if there wasn't one -- in which case there is nobody to hand things
-- to and the cascades can have them.
create or replace function reassign_shared_to_partner(leaving_user uuid, the_couple uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  remaining uuid;
begin
  select id into remaining
  from profiles
  where couple_id = the_couple and id <> leaving_user
  limit 1;

  if remaining is null then
    return null;
  end if;

  update key_dates set created_by = remaining
    where couple_id = the_couple and created_by = leaving_user;
  update todos set created_by = remaining
    where couple_id = the_couple and created_by = leaving_user;
  update wishlists set created_by = remaining
    where couple_id = the_couple and created_by = leaving_user;
  update wishlist_items set added_by = remaining
    where couple_id = the_couple and added_by = leaving_user;
  update planned_events set created_by = remaining
    where couple_id = the_couple and created_by = leaving_user;

  -- The cover photo is the couple's, so it stays -- but it can't stay owned by
  -- someone about to be deleted. On projects where storage.objects.owner still
  -- references auth.users, leaving it would make the account deletion fail
  -- outright; on the rest it would dangle.
  update storage.objects set owner = remaining
    where bucket_id = 'photos'
      and (storage.foldername(name))[1] = 'covers'
      and (storage.foldername(name))[2] = the_couple::text
      and owner = leaving_user;

  -- A to-do assigned to the person leaving becomes unassigned rather than
  -- silently becoming the other person's job.
  update todos set assigned_to = null
    where couple_id = the_couple and assigned_to = leaving_user;

  -- Your birthday is about you. It has no meaning once you've gone, and it
  -- would cascade away anyway the moment the account is deleted -- doing it
  -- here means unpairing behaves the same as deleting.
  delete from key_dates
    where couple_id = the_couple and subject_user_id = leaving_user;

  return remaining;
end;
$$;

revoke all on function reassign_shared_to_partner(uuid, uuid) from public;

-- Clear out everything that is only ever about one person.
create or replace function purge_personal_data(the_user uuid, keep_device boolean default false)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from busy_blocks where user_id = the_user;
  delete from calendar_prefs where user_id = the_user;
  delete from work_shifts where user_id = the_user;
  delete from work_patterns where user_id = the_user;
  delete from planned_event_calendar_links where user_id = the_user;

  -- The avatar file is removed below, so the pointer has to go with it.
  -- Leaving it set means the app signs a URL for an object that no longer
  -- exists: createSignedUrl signs a path without checking it, so <Image> gets
  -- a non-null URL that 404s and the initials fallback never fires. The user
  -- sees a permanently broken picture.
  update profiles set avatar_path = null where id = the_user;

  delete from storage.objects
  where bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = the_user::text;

  -- The push token is the device registration, not couple data. Unpairing
  -- shouldn't silently stop your notifications working -- nothing re-registers
  -- it on the pairing screen, so they'd just never come back.
  if not keep_device then
    delete from push_tokens where user_id = the_user;
  end if;
end;
$$;

revoke all on function purge_personal_data(uuid, boolean) from public;

-- Older signature, from before keep_device existed. Dropped so a stale copy
-- can't be called and can't make the overload ambiguous.
drop function if exists purge_personal_data(uuid);

-- Leave the couple, keeping your account.
--
-- The other person keeps the shared history. You keep your sign-in, and land
-- back on the pairing screen able to pair again.
create or replace function leave_couple()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  my_couple uuid;
  remaining uuid;
  member_count integer;
begin
  if me is null then
    raise exception 'Not signed in.';
  end if;

  select couple_id into my_couple from profiles where id = me;

  if my_couple is null then
    return; -- already unpaired; nothing to do
  end if;

  -- Serialise on the couple row before reading who is in it.
  --
  -- Without this, both partners unpairing at once each read the other as
  -- "remaining", so neither deletes the couple -- and every key date, to-do
  -- and wishlist keeps a couple_id that nobody's my_couple_id() will ever
  -- match again. The rows become permanently unreadable and undeletable, which
  -- is the exact outcome the delete below exists to prevent.
  perform 1 from couples where id = my_couple for update;

  remaining := reassign_shared_to_partner(me, my_couple);
  perform purge_personal_data(me, keep_device := true);

  update profiles set couple_id = null where id = me;

  -- Any invite still outstanding for that couple is meaningless now.
  delete from couple_invites where couple_id = my_couple and status = 'pending';

  -- Re-count rather than trusting the earlier read: under the lock this is the
  -- authoritative answer, and it is taken AFTER our own couple_id is cleared.
  select count(*) into member_count from profiles where couple_id = my_couple;

  -- Last one out deletes the couple, which cascades the shared tables.
  if member_count = 0 then
    -- The cover photo belongs to the couple, so it goes when the couple does.
    -- It has to happen here: once couples is gone, my_couple_id() is null for
    -- everyone and the storage policy denies that path forever, so a file left
    -- behind can never be removed by anybody.
    delete from storage.objects
    where bucket_id = 'photos'
      and (storage.foldername(name))[1] = 'covers'
      and (storage.foldername(name))[2] = my_couple::text;

    delete from couples where id = my_couple;
  end if;
end;
$$;

revoke all on function leave_couple() from public;
grant execute on function leave_couple() to authenticated;

-- Delete your account outright.
--
-- SECURITY DEFINER so it can reach auth.users, which the anon and authenticated
-- roles cannot touch. It only ever deletes auth.uid(), so there is no id to
-- pass and no way to aim it at somebody else.
create or replace function delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in.';
  end if;

  -- Hands shared things over, purges personal ones, and tidies the couple.
  perform leave_couple();

  -- leave_couple keeps the push token, because unpairing shouldn't unregister
  -- your device. Deleting the account should.
  delete from push_tokens where user_id = me;

  -- By this point leave_couple has dealt with every photo this user could own:
  -- purge_personal_data deleted their avatar, and the cover was either handed
  -- to the remaining partner or deleted with the couple. This is the belt and
  -- braces, because a storage object still owned by the user blocks the delete
  -- below on projects where storage.objects.owner still has a foreign key to
  -- auth.users -- and merely orphans the file on projects where it doesn't.
  --
  -- Scoped to avatars rather than `owner = me`: deleting everything this user
  -- owns would take the couple's cover photo with it, which is not theirs to
  -- destroy on the way out.
  delete from storage.objects
  where bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = me::text;

  -- profiles cascades from auth.users, and so does everything still pointing
  -- at this user.
  delete from auth.users where id = me;

  -- A SECURITY DEFINER function that lacks the privilege to touch auth.users
  -- deletes zero rows and raises nothing. Without this the app would sign the
  -- user out, show the sign-in screen, and report success -- while the account,
  -- its identities and its email still exist. That is a failed Apple
  -- requirement and retained personal data, reported as done.
  if not found then
    raise exception 'Account deletion did not complete. Nothing has been removed from your sign-in.';
  end if;
end;
$$;

revoke all on function delete_own_account() from public;
grant execute on function delete_own_account() to authenticated;

notify pgrst, 'reload schema';
