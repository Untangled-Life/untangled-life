-- Leaving a couple, and deleting an account.
--
-- ORDER MATTERS: run this AFTER feeling-valued.sql, date-history.sql and
-- date-proposals.sql. It cleans up their rows on unpairing, so it cannot run
-- before they exist.
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

  -- Newer Supabase projects carry owner_id (text) alongside the deprecated
  -- owner (uuid). Guarded because older projects have no such column, and a
  -- plain reference to it would fail to parse there.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner_id'
  ) then
    execute format(
      'update storage.objects set owner_id = %L
         where bucket_id = ''photos''
           and (storage.foldername(name))[1] = ''covers''
           and (storage.foldername(name))[2] = %L
           and owner_id = %L',
      remaining::text, the_couple::text, leaving_user::text
    );
  end if;

  -- planned_events carries three more references to a person, and all three
  -- have to let go.
  --
  -- This matters more than it looks. planned_events_members_only() refuses any
  -- write naming somebody outside the couple, so an event still owned by the
  -- person who left cannot be edited by the one who stayed -- and because the
  -- app deletes by CANCELLING, which is an update, it cannot be removed
  -- either. The event sticks on the shared calendar permanently with no way
  -- to touch it. Account deletion is fine on its own (the FK is `on delete
  -- set null`); unpairing has no such mechanism, which is exactly why it needs
  -- one here.
  update planned_events set owner_user_id = null
    where couple_id = the_couple and owner_user_id = leaving_user;
  update planned_events set push_to = array_remove(push_to, leaving_user)
    where couple_id = the_couple and leaving_user = any(push_to);
  update planned_events set updated_by = null
    where couple_id = the_couple and updated_by = leaving_user;

  -- A to-do assigned to the person leaving becomes unassigned rather than
  -- silently becoming the other person's job.
  update todos set assigned_to = null
    where couple_id = the_couple and assigned_to = leaving_user;

  -- Your birthday is about you. It has no meaning once you've gone, and it
  -- would cascade away anyway the moment the account is deleted -- doing it
  -- here means unpairing behaves the same as deleting.
  delete from key_dates
    where couple_id = the_couple and subject_user_id = leaving_user;

  -- The three tables added after this function was first written.
  --
  -- Account DELETION was always fine: every one of them cascades from
  -- auth.users. Unpairing is not, because the couple row survives, and a row
  -- left behind with the old couple_id stays readable by whoever is still in
  -- that couple. Worse, couples are reused: B invites D into the same couple,
  -- and the app's "what your partner said" query then matches TWO rows, so B
  -- can be shown their EX's most private answer under the heading "What D
  -- said".
  --
  -- Deleted rather than reassigned, because none of it means anything
  -- detached from the person who wrote it. "What makes me feel valued" is not
  -- transferable, and a verdict on a date is an opinion rather than a record
  -- of it.
  delete from valued_answers
    where user_id = leaving_user and couple_id = the_couple;

  delete from date_reviews
    where user_id = leaving_user and couple_id = the_couple;

  -- Withdrawn rather than deleted: the partner may be looking at it right
  -- now, and a row that vanishes mid-read is worse than one that says it was
  -- withdrawn. Either way it stops being answerable, which is the point --
  -- otherwise answer_date_proposal() would cheerfully create a real event in
  -- both diaries on behalf of somebody who has gone.
  update date_proposals
    set status = 'withdrawn', answered_at = now()
    where couple_id = the_couple
      and proposed_by = leaving_user
      and status = 'open';

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

  -- The push token is the device registration, not couple data. Unpairing
  -- shouldn't silently stop your notifications working -- nothing re-registers
  -- it on the pairing screen, so they'd just never come back.
  --
  -- The profile picture is the same argument and used to be deleted here
  -- regardless: you keep your account when you unpair, and coming back to a
  -- blank avatar is a thing you did not ask for. It is now removed only when
  -- the account itself goes, in delete_own_account.
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

  -- The avatar goes with the account, and the pointer goes with it: leaving
  -- avatar_path set means the app signs a URL for an object that no longer
  -- exists (createSignedUrl signs a path without checking it), so <Image> gets
  -- a non-null URL that 404s and the initials fallback never fires.
  update profiles set avatar_path = null where id = me;

  -- Scoped to avatars rather than `owner = me`: deleting everything this user
  -- owns would take the couple's cover photo with it, which is not theirs to
  -- destroy on the way out. leave_couple has already handed that over or
  -- deleted it with the couple.
  --
  -- This removes the metadata row, which is what a storage object still owned
  -- by the user blocks the delete below on -- projects where
  -- storage.objects.owner still has a foreign key to auth.users. It does NOT
  -- remove the file from the object store; only the Storage API does that, so
  -- the app deletes the file before calling this and this is the backstop.
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
