-- Is it booked?
--
-- A trip goes through two lives. First it is an idea with a name and some
-- screenshots, which belongs on the Travel screen and nowhere else. Then
-- somebody pays for something, and it becomes the thing you count down to --
-- which belongs on the home screen, next to the anniversary.
--
-- One flag, set by hand, because the app cannot tell the difference. Flights
-- booked and nothing else is a booked trip; a hotel held on a free
-- cancellation is not, and only the two of you know which.
--
-- Run AFTER wishlists-and-travel.sql. Safe to run more than once.

alter table trips add column if not exists booked boolean not null default false;

-- Home asks one question of this table -- "what is the next booked trip" --
-- and asks it on every open.
create index if not exists trips_booked_upcoming
  on trips (couple_id, start_date)
  where booked and start_date is not null;

notify pgrst, 'reload schema';
