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

-- Allow anonymous inserts only — no select/update/delete for the anon role.
-- The app's server-side route uses the anon key, so this policy is what
-- keeps a leaked anon key from being able to read the waitlist back.
create policy "Allow anonymous insert" on waitlist
  for insert
  to anon
  with check (true);
