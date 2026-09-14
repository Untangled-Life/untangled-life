-- =====================================================================
-- Untangled Life — paste this whole thing into the Supabase SQL editor.
--
-- Everything from 14 September 2026. Replaces every earlier file I sent
-- today; run this one and nothing else. Order matters.
--
--   0a. photos.sql            RE-RUN. The version already run used
--                             `on conflict do nothing` on the bucket,
--                             which would leave an existing bucket
--                             PUBLIC. This forces it private and adds a
--                             size and file-type cap.
--   0b. leaving.sql           RE-RUN. Review found a concurrent-unpair
--                             hole that could make a couple's data
--                             unreadable by anyone, and an account
--                             deletion that could report success having
--                             deleted nothing.
--   1.  calendar-sharing.sql  off / busy-only / full-detail per calendar
--   2.  key-date-extras.sql   per-date reminders, and notes
--   3.  trips-and-pins.sql    multi-day trips, pinned countdowns
--   4.  free-time-prefs.sql   what counts as time you're free, and the
--                             column grants on couples
--   5.  home-layout.sql       per-person Home screen arrangement
--   6.  calendar-events.sql   event owners, per-person push toggles,
--                             partner colours
--
-- Safe to run in full, and safe to re-run: every policy, constraint and
-- trigger is dropped before it is created, and the one backfill is
-- written so a second run can't undo a deliberate choice.
--
-- The one thing that is not idempotent in spirit is the
-- `delete from busy_blocks` in step 1 — it clears the table so no row
-- written under the old sharing rule outlives it. Re-running costs one
-- calendar refresh and nothing else.
-- =====================================================================


-- ============================ photos.sql ============================

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

-- ============================ leaving.sql ============================

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

-- ============================ calendar-sharing.sql ============================

-- Three ways to share a calendar, not two.
--
-- calendar-detail.sql gave each calendar a boolean: connected, meaning your
-- partner reads your event titles, or not connected, meaning the app can't see
-- the calendar at all. That leaves no room for the most common case there is --
-- a work calendar you want counted as busy without your partner reading what
-- every meeting is about.
--
--   off     -- never read. Nothing from this calendar leaves the phone.
--   times   -- start and end times only. Your partner sees "busy", not what.
--   details -- times plus title, location and notes.
--
-- Run after calendar-detail.sql.

alter table calendar_prefs
  add column if not exists share_level text not null default 'off';

-- Added separately from the column so re-running this file doesn't error on an
-- existing constraint.
alter table calendar_prefs drop constraint if exists calendar_prefs_share_level_check;
alter table calendar_prefs
  add constraint calendar_prefs_share_level_check
  check (share_level in ('off', 'times', 'details'));

-- Carry over anything already chosen. A connected calendar was sharing full
-- detail, because that was the only thing "connected" meant.
update calendar_prefs
  set share_level = case when connected then 'details' else 'off' end
  where share_level = 'off' and connected is not null;

alter table calendar_prefs drop column if exists connected;

-- Existing rows in busy_blocks were written under the old rule, so any of them
-- could be carrying detail their owner would now choose not to share. The sync
-- rewrites this table on every run, so clearing it costs one refresh and
-- removes the chance of detail outliving the setting that allowed it.
delete from busy_blocks;

notify pgrst, 'reload schema';

-- ============================ key-date-extras.sql ============================

-- Per-date reminders, and somewhere to put gift ideas.
--
-- Two small columns that fix the same complaint from opposite ends: a key date
-- currently knows only when it is.
--
--   reminder_days -- how far ahead to nudge you. Everything was hard-coded to
--                    14/7/3, which is right for an anniversary and absurd for
--                    a friend's birthday you just want a day's warning about.
--   notes         -- "she mentioned those earrings". Gift ideas belong on the
--                    date they're for, not in your head or a wishlist you have
--                    to remember to open.
--
-- Run after relationship-features.sql and birthday-subject.sql.

alter table key_dates
  add column if not exists reminder_days integer[] not null default '{14,7,3}';

alter table key_dates
  add column if not exists notes text;

-- A reminder 400 days out is a typo, not a plan, and an empty array means
-- "don't remind me" rather than "remind me constantly".
alter table key_dates drop constraint if exists key_dates_reminder_days_check;
alter table key_dates
  add constraint key_dates_reminder_days_check
  check (
    array_length(reminder_days, 1) is null
    or (
      array_length(reminder_days, 1) <= 6
      and reminder_days <@ array[0,1,2,3,5,7,14,21,30,60,90]
    )
  );

notify pgrst, 'reload schema';

-- ============================ trips-and-pins.sql ============================

-- Trips, and the one countdown you actually care about.
--
-- Two more columns on key_dates, because a trip is a key date that lasts more
-- than a day and a pinned date is a key date you want to see without scrolling.
-- Neither justifies its own table: the reminders, the notes, the recurrence and
-- the calendar rendering are all identical, and splitting them would mean
-- writing all of that twice.
--
--   end_date -- the last day. Null means a single day, which is every existing
--               row, so nothing needs backfilling.
--   pinned   -- show it big at the top of Home. "47 days until Bali."
--
-- A trip is not recurring by default, unlike a birthday. "Bali 2026" happening
-- again in 2027 is not what anyone meant.
--
-- Run after key-date-extras.sql.

alter table key_dates add column if not exists end_date date;
alter table key_dates add column if not exists pinned boolean not null default false;

-- A trip that ends before it starts is a data-entry slip, and it would render
-- as a negative-length band on the calendar.
alter table key_dates drop constraint if exists key_dates_end_after_start_check;
alter table key_dates
  add constraint key_dates_end_after_start_check
  check (end_date is null or end_date >= date);

-- Only misc dates can span days. An anniversary or a birthday is one day by
-- definition, and allowing a range there would make the singleton rows
-- ambiguous for no gain.
alter table key_dates drop constraint if exists key_dates_span_kind_check;
alter table key_dates
  add constraint key_dates_span_kind_check
  check (end_date is null or kind = 'misc');

-- Finding the pinned ones is the Home screen's first query on every load.
create index if not exists key_dates_pinned on key_dates (couple_id) where pinned;

notify pgrst, 'reload schema';

-- ============================ free-time-prefs.sql ============================

-- What counts as time you're free.
--
-- The app has been assuming 7am to 11pm, at least 30 minutes, seven days
-- ahead, for everybody. That is a reasonable guess for office hours and wrong
-- for the people this app is actually for: someone finishing a night shift at
-- 7am does not want their one free morning ruled out because a hard-coded
-- constant decided the day starts then.
--
-- It's per couple rather than per person because the answer is about the two
-- of you together -- there is no useful sense in which one partner's idea of
-- "too late" applies to a window you'd both have to be in.
--
-- Run after couples.sql.

alter table couples add column if not exists day_start_hour integer not null default 7;
alter table couples add column if not exists day_end_hour integer not null default 23;
alter table couples add column if not exists min_free_minutes integer not null default 30;

alter table couples drop constraint if exists couples_free_window_check;
alter table couples
  add constraint couples_free_window_check
  check (
    day_start_hour between 0 and 23
    and day_end_hour between 1 and 24
    and day_end_hour > day_start_hour
    and min_free_minutes between 15 and 480
  );

-- Narrow what a member may write on couples.
--
-- The RLS policy in photos.sql says WHICH ROW you may update; this says WHICH
-- COLUMNS. Without it, being a member of a couple means write access through
-- PostgREST to every column of that table, present and future -- so anything
-- added later (a join code, a plan, a flag) would silently become
-- member-writable the moment it exists.
--
-- This is the last file that adds a member-writable column to couples, which
-- is why the grant lives here. Anything added after this must be appended to
-- the list, or the app will save nothing and report a permission error.
revoke update on couples from authenticated;
grant update (cover_path, day_start_hour, day_end_hour, min_free_minutes)
  on couples to authenticated;

notify pgrst, 'reload schema';

-- ============================ home-layout.sql ============================

-- Your own arrangement of the Home screen.
--
-- On profiles rather than couples: this is about which of you is holding the
-- phone. One of you lives by the countdowns and the other only ever opens the
-- app to check when you're both free, and there's no reason they should have
-- to agree.
--
-- Null means "the default order, everything showing", which is what every
-- existing row is. An empty array is a real choice -- somebody who has hidden
-- every section -- so the app has to tell the two apart, and null is the only
-- honest way to say "never set".
--
-- Run after couples.sql.

alter table profiles add column if not exists home_sections text[];

notify pgrst, 'reload schema';

-- ============================ calendar-events.sql ============================

-- A real calendar: events that belong to someone, and choose whose phone they
-- land on.
--
-- planned_events already existed for "Book it on both phones", where both was
-- the only option and the event belonged to the couple. A calendar you can
-- actually run your life on needs two more things:
--
--   owner_user_id -- whose it is. Null means "Us". Colour on the calendar
--                    follows this, not who typed it in: Roy putting Alyssa's
--                    dentist appointment in should show as hers.
--   push_to       -- whose PHONE calendar it goes to, as its own choice. Not
--                    derived from the owner, because the two genuinely differ:
--                    a shared dinner belongs to both of you and wants to be on
--                    both phones, while "Alyssa - school pickup" is hers but
--                    you might well want it in your own diary too.
--
-- Also gives each partner a colour, used everywhere the app draws their stuff.
--
-- Run after planned-events.sql and couples.sql.

alter table planned_events
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

-- `on delete set null` is deliberate: when someone deletes their account their
-- events become the couple's rather than vanishing. leaving.sql does the same
-- thing for unpairing, so the two behave alike.

-- Added NULLABLE and backfilled before the default and the not-null go on.
--
-- The obvious version -- add it with a default of '{}' and then backfill
-- `where push_to = '{}'` -- is not safe to re-run, and every other statement
-- in this file is, which is exactly what invites someone to run it twice. An
-- empty push_to is a real choice the editor offers ("Off means it stays in
-- Untangled Life"), so a second run would read every deliberately-private
-- event as un-backfilled and push it to both phones. Someone's therapy
-- appointment appearing in their partner's calendar because a migration was
-- re-run is not a mistake worth leaving available.
--
-- A null can only mean "this row predates the column", so the backfill below
-- is idempotent by construction: after the first run there are no nulls left.
alter table planned_events add column if not exists push_to uuid[];

-- Everything created before this column existed was a "Book it on both
-- phones" plan, and both phones already have it. Saying so keeps push_to
-- consistent with the link rows that already exist -- otherwise the next sync
-- would read an empty push_to and strip those events off both calendars.
update planned_events pe
set push_to = coalesce(
  (select array_agg(p.id) from profiles p where p.couple_id = pe.couple_id),
  '{}'
)
where push_to is null;

alter table planned_events alter column push_to set default '{}';
alter table planned_events alter column push_to set not null;

create index if not exists planned_events_owner on planned_events (couple_id, owner_user_id);

-- Each partner's colour, from the palette in mobile/lib/palette.ts. Null means
-- they haven't picked, and the app falls back to a stable default derived from
-- their id rather than leaving two people the same colour.
alter table profiles add column if not exists color text;

alter table profiles drop constraint if exists profiles_color_check;
alter table profiles
  add constraint profiles_color_check
  check (color is null or color = lower(color));

-- The palette itself is not enumerated here on purpose. A check constraint
-- listing 24 names would mean a database migration to add a colour, and the
-- worst case of an unrecognised value is the app falling back to its default
-- -- which resolveColor already does for null.

-- owner_user_id and push_to must name people in the couple.
--
-- A check constraint can't ask another table, so this is a trigger. Neither
-- column is a leak on its own -- a stranger named in push_to still can't read
-- planned_events, so nothing reaches their phone -- but an owner who isn't in
-- the couple renders as the partner's name in the partner's colour, which is
-- worse than an error.
create or replace function planned_events_members_only()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  stranger uuid;
begin
  if new.owner_user_id is not null
     and not exists (
       select 1 from profiles p
       where p.id = new.owner_user_id and p.couple_id = new.couple_id
     )
  then
    raise exception 'An event can only belong to someone in the couple.';
  end if;

  select id into stranger
  from unnest(new.push_to) as id
  where not exists (
    select 1 from profiles p where p.id = id and p.couple_id = new.couple_id
  )
  limit 1;

  if stranger is not null then
    raise exception 'An event can only be pushed to a phone in the couple.';
  end if;

  return new;
end;
$$;

drop trigger if exists planned_events_members_only_trigger on planned_events;
create trigger planned_events_members_only_trigger
  before insert or update on planned_events
  for each row execute function planned_events_members_only();

notify pgrst, 'reload schema';
