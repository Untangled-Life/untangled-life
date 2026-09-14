-- Events from your phone's calendar, with their detail -- and a per-calendar
-- choice about which calendars that applies to.
--
-- Until now busy_blocks held start and end times and nothing else, so your
-- partner saw an anonymous grey block. Useful for finding free time, useless
-- for "what are you actually doing on Thursday". This adds the detail.
--
-- Detail is the whole privacy question, so it comes with the switch that makes
-- it honest: calendar_prefs. A calendar is only read if you have connected it,
-- and a calendar you haven't connected is never uploaded at all. There is
-- deliberately no default-on: a row must exist and be connected, so a calendar
-- the app has never asked you about stays on your phone.
--
-- Run after busy-blocks.sql.

alter table busy_blocks add column if not exists title text;
alter table busy_blocks add column if not exists location text;
alter table busy_blocks add column if not exists notes text;
alter table busy_blocks add column if not exists all_day boolean not null default false;
alter table busy_blocks add column if not exists calendar_id text;

-- Which of the calendars on your phone are connected.
--
-- calendar_id is the id your phone assigns, so these rows are per-device in
-- practice: the same Google calendar has a different id on your iPhone than on
-- an Android. That's the right granularity -- the choice is about what this
-- phone uploads -- and it's why the label is stored too, so the picker can
-- show you something recognisable.
create table if not exists calendar_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_id text not null,
  title text,
  source_name text,
  connected boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, calendar_id)
);

alter table calendar_prefs enable row level security;

-- Strictly your own. Your partner has no business knowing which calendars you
-- chose not to connect -- that list is itself revealing.
drop policy if exists "Manage own calendar prefs" on calendar_prefs;
create policy "Manage own calendar prefs" on calendar_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
