-- The first-run walkthrough.
--
-- Two columns, and the split between them matters.
--
-- Most steps have a REAL answer already: a calendar is shared or it is not, a
-- photo exists or it does not. Those are never stored twice -- asking the data
-- is always right, and a stored "done" flag would go stale the moment somebody
-- turned their last calendar back off.
--
-- onboarding_done is only for the two things the data cannot answer: a step
-- the person deliberately SKIPPED, and a step with nothing to measure
-- (personalisation is finished when you say it is). Without it, "skip" would
-- mean "ask me again tomorrow".
--
-- onboarded_at is the walkthrough itself being over, however it ended. It is
-- the difference between a new couple and a couple who have chosen not to
-- bother, and only the first should be sent to it.
--
-- Safe to run more than once.

alter table profiles add column if not exists onboarding_done text[] not null default '{}';
alter table profiles add column if not exists onboarded_at timestamptz;

-- No policy changes needed: "Update own profile" in couples.sql already covers
-- these, and unlike couples there is no column grant on profiles to extend.

notify pgrst, 'reload schema';
