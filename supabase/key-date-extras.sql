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
