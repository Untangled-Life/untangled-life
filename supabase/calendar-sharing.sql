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
