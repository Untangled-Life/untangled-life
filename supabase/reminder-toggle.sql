-- An on/off switch for a key date's reminders.
--
-- Turning every chip off already meant "don't remind me", so this looks
-- redundant until you use it: switching reminders off that way THROWS AWAY the
-- schedule, and turning them back on gives you the default rather than what
-- you had. A separate flag lets the schedule sit there untouched while the
-- reminders are off, which is what a switch is supposed to do.
--
-- Defaults to on, so every existing date keeps behaving exactly as it does now.
--
-- Run after key-date-extras.sql.

alter table key_dates add column if not exists reminders_on boolean not null default true;

notify pgrst, 'reload schema';
