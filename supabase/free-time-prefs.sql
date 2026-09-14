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
