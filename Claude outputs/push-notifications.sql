-- Remote push: lets one partner's action reach the other partner's phone.
--
-- The key-date reminders already in the app are LOCAL notifications -- each
-- phone schedules its own from data it already has. These are different: they
-- fire because the OTHER person did something (booked a date, added a key
-- date), which a phone can't know about on its own. That needs a push token
-- per phone and something server-side to send to it.
--
-- Run after planned-events.sql. Pairs with the notify-partner Edge Function
-- and the two database webhooks described in supabase/functions/README.md.

create table if not exists push_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expo_push_token text not null,
  platform text,
  updated_at timestamptz not null default now()
);

alter table push_tokens enable row level security;

-- Your token is yours: you can read and write your own row and nobody else's.
-- The Edge Function reads the partner's token with the service role key, which
-- bypasses RLS -- that's deliberate, and why no policy here grants partners
-- read access to each other's tokens.

drop policy if exists "Manage own push token" on push_tokens;
create policy "Manage own push token" on push_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
