-- Untangled Life waitlist table + RLS policy.
-- Paste this into the Supabase SQL editor for the project.

create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  uses_shared_calendar text not null,
  created_at timestamptz not null default now()
);

alter table waitlist enable row level security;

-- Allow anonymous inserts only -- no select/update/delete for the anon role.
-- The app's server-side route uses the anon key, so this policy is what
-- keeps a leaked anon key from being able to read the waitlist back.
drop policy if exists "Allow anonymous insert" on waitlist;
create policy "Allow anonymous insert" on waitlist
  for insert
  to anon
  with check (true);

-- Public signup counter (for the landing page "X/500 registered" display).
-- SECURITY DEFINER lets this function read the row count on behalf of the
-- anon role without granting anon a general SELECT policy on the table --
-- it returns only a single aggregate number, never any row data, so the
-- privacy guarantee above (anon can insert but never read the list) holds.
create or replace function waitlist_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer from waitlist;
$$;

revoke all on function waitlist_count() from public;
grant execute on function waitlist_count() to anon;
