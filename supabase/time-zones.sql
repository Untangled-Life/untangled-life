-- Where each of you is.
--
-- Two kinds of time live in this app and they need opposite treatment.
--
-- An instant -- a booked date, an event off a calendar -- is stored as
-- timestamptz and is the same moment for both of you. It only needs a zone to
-- be displayed in.
--
-- A wall-clock rule is not an instant at all. "9am to 5pm" means nine o'clock
-- WHERE THAT PERSON IS, and becomes a real moment only once you know the zone.
-- Stored without one, a roster typed in Sydney quietly becomes Perth hours the
-- moment its owner lands in Perth, and "we're both free at 7pm" has no answer
-- when you are three hours apart.
--
-- Run after couples.sql and work-hours.sql.

-- The IANA name from each phone, kept current by the app on every open.
alter table profiles add column if not exists time_zone text;

-- Which zone a roster's hours are in. Null means "wherever the phone is",
-- which is what every existing row has been assuming, so nothing changes for
-- anyone who has not travelled.
alter table work_patterns add column if not exists time_zone text;
alter table work_shifts add column if not exists time_zone text;

-- Deliberately NOT added to couples: the free-together window stays a couple
-- setting, but it is read in each partner's OWN zone. "Our evening is 7pm to
-- 11pm" then means each of you in your own evening, and a window is offered
-- only where those two actually overlap. That is the right answer when you are
-- in the same place and the only sensible one when you are not.

notify pgrst, 'reload schema';
