-- Your own arrangement of the Home screen.
--
-- On profiles rather than couples: this is about which of you is holding the
-- phone. One of you lives by the countdowns and the other only ever opens the
-- app to check when you're both free, and there's no reason they should have
-- to agree.
--
-- Null means "the default order, everything showing", which is what every
-- existing row is. An empty array is a real choice -- somebody who has hidden
-- every section -- so the app has to tell the two apart, and null is the only
-- honest way to say "never set".
--
-- Run after couples.sql.

alter table profiles add column if not exists home_sections text[];

notify pgrst, 'reload schema';
