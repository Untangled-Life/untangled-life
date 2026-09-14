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

-- Carry over anything already chosen, then drop the old column.
--
-- All of it is inside a guard that checks whether `connected` is still there,
-- because the statement that reads it and the statement that drops it are in
-- the same file. Without the guard, running this a second time fails with
-- `column "connected" does not exist` -- the backfill goes looking for a
-- column the previous run removed. Everything else here was written to be
-- re-runnable, so a migration that is only safe the first time is worse than
-- one that is obviously not: it gets re-run.
--
-- Postgres plans the whole body of a DO block up front, so the backfill has to
-- be EXECUTEd as a string. Written plainly it would fail to parse on a
-- database where the column has already gone, guard or no guard.
do $migrate$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'calendar_prefs'
      and column_name = 'connected'
  ) then
    -- `share_level = 'off'` is the sentinel for "not backfilled yet", and it
    -- is also a real choice somebody may have made. If any row already carries
    -- a three-way value then this has run before, `connected` is vestigial,
    -- and backfilling again would flip every deliberately-off calendar to
    -- `details` -- the most permissive setting there is, quietly sharing
    -- titles, locations and notes with a partner. Drop the old column and
    -- leave the data alone.
    if exists (select 1 from calendar_prefs where share_level <> 'off') then
      execute 'alter table calendar_prefs drop column connected';
      return;
    end if;

    -- A connected calendar was sharing full detail, because that was the only
    -- thing "connected" meant.
    execute $backfill$
      update calendar_prefs
      set share_level = case when connected then 'details' else 'off' end
      where share_level = 'off'
    $backfill$;

    execute 'alter table calendar_prefs drop column connected';

    -- Rows in busy_blocks written under the old rule could be carrying detail
    -- their owner would now choose not to share. The sync rewrites this table
    -- on every run, so clearing it costs one refresh and removes the chance of
    -- detail outliving the setting that allowed it.
    --
    -- Inside the guard as well: on a re-run there is nothing left to clear,
    -- and wiping everyone's calendar data on every re-run is a real cost for
    -- no benefit.
    execute 'delete from busy_blocks';
  end if;
end
$migrate$;

notify pgrst, 'reload schema';
