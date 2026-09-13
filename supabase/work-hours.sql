-- Working hours: the thing that makes "when are we both free" true for shift
-- workers, not just people on a standard week.
--
-- Three shapes have to work, without three separate systems:
--
--   Regular hours   -- mode 'weekly', cycle_weeks 1. Mon-Fri 8:30-17:30.
--   Rotating roster -- mode 'rotating', cycle_weeks 2-6. A fixed rotation
--                      that repeats; anchor_date says when week 1 began, so
--                      it projects forward forever without re-entry.
--   Shift work      -- mode 'irregular', no recurring shifts at all. Every
--                      shift is entered against a real date in work_shifts.
--
-- The first two can still have one-off changes, and the third is just the
-- same system with the pattern left empty -- so someone whose roster is
-- mostly regular but occasionally isn't doesn't fall off a cliff.
--
-- Times are stored as local wall-clock (a shift is "8:30am", not an instant)
-- and expanded against the phone's timezone when computing free time.
--
-- Run after busy-blocks.sql.

create table if not exists work_patterns (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade unique,
  mode text not null default 'weekly',
  cycle_weeks integer not null default 1,
  -- The Monday that cycle week 0 started on. Only meaningful when rotating,
  -- but harmless to carry otherwise.
  anchor_date date not null default current_date,
  -- [{ "week": 0, "weekday": 1, "start": "08:30", "end": "17:30" }]
  -- weekday: 0 = Sunday .. 6 = Saturday, matching JS getDay().
  -- end <= start means the shift runs past midnight into the next day.
  shifts jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint work_patterns_mode_check check (mode in ('weekly', 'rotating', 'irregular')),
  constraint work_patterns_cycle_check check (cycle_weeks between 1 and 6)
);

-- One-off shifts and one-off days off. 'extra' adds a shift on that date;
-- 'off' cancels whatever the pattern would otherwise have put there.
create table if not exists work_shifts (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  kind text not null default 'extra',
  created_at timestamptz not null default now(),
  constraint work_shifts_kind_check check (kind in ('extra', 'off')),
  -- An 'extra' needs times; an 'off' is just the date.
  constraint work_shifts_times_check check (
    (kind = 'off') or (start_time is not null and end_time is not null)
  )
);

create index if not exists work_shifts_user_date on work_shifts (user_id, date);

alter table work_patterns enable row level security;
alter table work_shifts enable row level security;

-- Both partners can SEE each other's working hours -- that's the whole point,
-- and it's the same shape as busy_blocks: when, never what. Each person can
-- only change their own.

drop policy if exists "Couple can view work patterns" on work_patterns;
create policy "Couple can view work patterns" on work_patterns
  for select to authenticated using (couple_id = my_couple_id());

drop policy if exists "Manage own work pattern" on work_patterns;
create policy "Manage own work pattern" on work_patterns
  for all to authenticated
  using (couple_id = my_couple_id() and user_id = auth.uid())
  with check (couple_id = my_couple_id() and user_id = auth.uid());

drop policy if exists "Couple can view work shifts" on work_shifts;
create policy "Couple can view work shifts" on work_shifts
  for select to authenticated using (couple_id = my_couple_id());

drop policy if exists "Manage own work shifts" on work_shifts;
create policy "Manage own work shifts" on work_shifts
  for all to authenticated
  using (couple_id = my_couple_id() and user_id = auth.uid())
  with check (couple_id = my_couple_id() and user_id = auth.uid());
