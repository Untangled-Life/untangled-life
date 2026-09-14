-- Let a couple's day run overnight.
--
-- The free-time window was constrained to end AFTER it starts, which quietly
-- excluded the people the feature is most useful to. Someone finishing nights
-- at 7am does not have a day that runs 7am to 11pm; theirs runs 10pm to 6am,
-- and the old rule rejected it as "that doesn't leave a day".
--
-- An end hour at or before the start now means the following morning, which is
-- the same reading the app already gives an overnight SHIFT. Equal hours mean
-- a full twenty-four.
--
-- Safe to run more than once.

alter table couples drop constraint if exists couples_free_window_check;

alter table couples
  add constraint couples_free_window_check
  check (
    day_start_hour between 0 and 23
    and day_end_hour between 0 and 24
    and min_free_minutes between 15 and 480
  );
