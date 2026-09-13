-- "Book it on both phones": a date booked by either partner lands in BOTH
-- their phone calendars.
--
-- A phone can only write to its own local calendar, so this can't be done
-- with a single write. Instead the plan itself lives here (visible to both
-- partners), and each phone records the local calendar event id it created
-- for that plan. Next time the other partner opens the app, it sees a plan
-- with no link row for them, creates the event on their phone, and records
-- its own id. Cancelling flips a flag, and each phone removes its own copy
-- the next time it syncs.
--
-- Run after busy-blocks.sql.

create table if not exists planned_events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  location text,
  notes text,
  cancelled boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists planned_events_couple_window on planned_events (couple_id, start_at);

create table if not exists planned_event_calendar_links (
  id uuid primary key default gen_random_uuid(),
  planned_event_id uuid not null references planned_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_event_id text not null,
  created_at timestamptz not null default now(),
  unique (planned_event_id, user_id)
);

alter table planned_events enable row level security;
alter table planned_event_calendar_links enable row level security;

-- The plan itself: both partners can see and change it, scoped to their couple.

drop policy if exists "Couple can view planned events" on planned_events;
create policy "Couple can view planned events" on planned_events
  for select to authenticated using (couple_id = my_couple_id());

drop policy if exists "Couple can add planned events" on planned_events;
create policy "Couple can add planned events" on planned_events
  for insert to authenticated
  with check (couple_id = my_couple_id() and created_by = auth.uid());

drop policy if exists "Couple can update planned events" on planned_events;
create policy "Couple can update planned events" on planned_events
  for update to authenticated
  using (couple_id = my_couple_id())
  with check (couple_id = my_couple_id());

drop policy if exists "Couple can delete planned events" on planned_events;
create policy "Couple can delete planned events" on planned_events
  for delete to authenticated using (couple_id = my_couple_id());

-- The device links: strictly your own. A link row is just "this plan is event
-- <id> in MY phone's calendar" -- useless to the other partner, and not theirs
-- to write.

drop policy if exists "View own calendar links" on planned_event_calendar_links;
create policy "View own calendar links" on planned_event_calendar_links
  for select to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from planned_events pe
      where pe.id = planned_event_calendar_links.planned_event_id
        and pe.couple_id = my_couple_id()
    )
  );

drop policy if exists "Add own calendar links" on planned_event_calendar_links;
create policy "Add own calendar links" on planned_event_calendar_links
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from planned_events pe
      where pe.id = planned_event_calendar_links.planned_event_id
        and pe.couple_id = my_couple_id()
    )
  );

drop policy if exists "Delete own calendar links" on planned_event_calendar_links;
create policy "Delete own calendar links" on planned_event_calendar_links
  for delete to authenticated using (user_id = auth.uid());
