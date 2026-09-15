-- What the trip costs.
--
-- A price per item, so the total adds up from the flights and the hotel and
-- the tour rather than being a number somebody typed and now has to keep
-- true. Whole cents, because adding 19.99 and 0.10 as anything else is how a
-- budget ends in 20.089999999.
--
-- Optional on purpose: an idea has no price, and a trip that is still a
-- screenshot should not be made to invent one. Null means "no price entered",
-- which the total treats as nothing rather than as zero dollars.
--
-- Run AFTER wishlists-and-travel.sql. Safe to run more than once.

alter table trip_items add column if not exists cost_cents integer
  check (cost_cents is null or cost_cents >= 0);

notify pgrst, 'reload schema';
