-- Events that repeat.
--
-- A synced Google or Apple event could already repeat, because their calendar
-- carried the rule. An event created in Untangled Life could not, so a weekly
-- date night had to be entered every week and a fortnightly dinner was simply
-- not expressible.
--
-- The rule lives on the row and occurrences are worked out when they are
-- needed. The alternative -- writing one row per occurrence -- means deciding
-- how far into the future to write, rewriting them all when the time changes,
-- and a table that grows forever for a thing that is one sentence.
--
--   repeat_every  none | week | fortnight | month
--   repeat_until  the last day it may fall on. Null means it keeps going.
--
-- Run after planned-events.sql and calendar-events.sql.

alter table planned_events
  add column if not exists repeat_every text not null default 'none';

alter table planned_events
  add column if not exists repeat_until date;

alter table planned_events drop constraint if exists planned_events_repeat_check;
alter table planned_events
  add constraint planned_events_repeat_check
  check (repeat_every in ('none', 'week', 'fortnight', 'month'));

-- An end date on something that does not repeat is a contradiction, and it
-- would sit there confusing whoever reads the row next.
alter table planned_events drop constraint if exists planned_events_repeat_until_check;
alter table planned_events
  add constraint planned_events_repeat_until_check
  check (repeat_until is null or repeat_every <> 'none');

notify pgrst, 'reload schema';
