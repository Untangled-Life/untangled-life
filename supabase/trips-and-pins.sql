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
