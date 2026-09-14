-- Editing an event that came from your phone's calendar.
--
-- busy_blocks knew which CALENDAR an event came from but not which EVENT, so
-- the app could show you a 2pm dentist appointment and had no way to move it.
-- Storing the device's own id for the event closes that: the app writes the
-- change straight back to the Google or Apple calendar it came from, and the
-- next sync reads the new version.
--
-- Two things worth being clear about.
--
-- The device event id is per PHONE. It is meaningless on your partner's
-- device, which is exactly right -- a phone can only write to its own
-- calendars, so only the owner of an event can edit it. The app enforces that
-- too, rather than letting a write fail for a reason nobody can see.
--
-- The calendar stays the source of truth. Nothing here is written by the app;
-- busy_blocks is rewritten wholesale on every sync, so a change made in
-- Untangled Life shows up here only after it has landed on the phone. If the
-- write fails, the row is unchanged and the app is not quietly out of step
-- with the calendar.
--
-- Run after calendar-detail.sql.

alter table busy_blocks add column if not exists device_event_id text;

-- Repeating events need a different question when you edit one: this
-- occurrence, or this one and everything after it. Knowing which rows repeat
-- is what lets the app ask only when it matters.
alter table busy_blocks add column if not exists recurring boolean not null default false;

-- Who made the last change, so a notification about it can go to the OTHER
-- person.
--
-- created_by isn't enough: if Alyssa moves a dinner Roy booked, the actor is
-- Alyssa, and using created_by would send Roy's own change back to him while
-- Alyssa hears nothing. Set by the client on every update.
alter table planned_events add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table planned_events add column if not exists updated_at timestamptz;

-- Stamped in the database rather than trusted from the client, so the webhook
-- payload always carries a real time even if the app forgets to send one.
-- On insert as well as update: an update-only trigger leaves every new row
-- with a null updated_at, which is the opposite of what that sentence claims.
create or replace function planned_events_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists planned_events_touch_trigger on planned_events;
create trigger planned_events_touch_trigger
  before insert or update on planned_events
  for each row execute function planned_events_touch();

notify pgrst, 'reload schema';
