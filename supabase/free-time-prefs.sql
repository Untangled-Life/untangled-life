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
    -- An end hour at or before the start is an OVERNIGHT day, not an invalid
    -- one: someone finishing nights at 7am has a day that runs 10pm to 6am.
    -- Requiring the end to come after the start excluded exactly the people
    -- this feature is most useful to. See overnight-day.sql.
    and day_end_hour between 0 and 24
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
-- couples.sql already turns RLS on and this repeats it, which costs nothing
-- and closes the one assumption this file otherwise makes about a database it
-- cannot see. CREATE POLICY does not enable RLS, so the policy photos.sql adds
-- to couples would be inert on a database where it had somehow been left off,
-- and the revoke below only narrows `authenticated`. Without RLS, `anon` --
-- the role behind the public anon key -- keeps table-level UPDATE.
alter table couples enable row level security;

-- The SELECT policy has to come with it. Enabling RLS on a table with no
-- SELECT policy makes it unreadable, so on the one database this line exists
-- to protect -- RLS off, no policies -- turning it on would silently break the
-- cover photo and the settings below rather than securing anything. This is
-- the same policy couples.sql creates, restated so the file stands on its own.
drop policy if exists "Members can view their couple" on couples;
create policy "Members can view their couple" on couples
  for select to authenticated
  using (id = my_couple_id());

revoke update on couples from authenticated;
revoke update on couples from anon;
grant update (cover_path, day_start_hour, day_end_hour, min_free_minutes)
  on couples to authenticated;

notify pgrst, 'reload schema';
