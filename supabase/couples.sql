-- Couples app schema: profiles, couples, and invite-code pairing.
-- Run this in the Supabase SQL editor (same project as the waitlist table).

create extension if not exists pgcrypto;

create table if not exists couples (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  couple_id uuid references couples(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists couple_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  couple_id uuid not null references couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'redeemed')),
  created_at timestamptz not null default now()
);

alter table couples enable row level security;
alter table profiles enable row level security;
alter table couple_invites enable row level security;

-- Helper: the calling user's own couple_id, as a SECURITY DEFINER function so
-- policies that need it don't recurse back into profiles' own RLS.
create or replace function my_couple_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select couple_id from profiles where id = auth.uid();
$$;

revoke all on function my_couple_id() from public;
grant execute on function my_couple_id() to authenticated;

create policy "Members can view their couple" on couples
  for select to authenticated
  using (id = my_couple_id());

create policy "View own or partner profile" on profiles
  for select to authenticated
  using (id = auth.uid() or (couple_id is not null and couple_id = my_couple_id()));

create policy "Insert own profile" on profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy "Update own profile" on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- couple_invites has no direct-access policies on purpose: every read/write
-- goes through the two SECURITY DEFINER functions below, same pattern as
-- waitlist_count() on the landing page (anon/authenticated never gets raw
-- table access, only the narrow operation the app actually needs).

create or replace function generate_invite_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I, easy to read aloud
  result text := '';
  i integer;
begin
  for i in 1..6 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return result;
end;
$$;

create or replace function create_couple_invite()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_couple uuid;
  existing_code text;
  new_couple_id uuid;
  new_code text;
begin
  select couple_id into existing_couple from profiles where id = auth.uid();
  if existing_couple is not null then
    raise exception 'You are already paired with a partner.';
  end if;

  select code into existing_code
  from couple_invites
  where created_by = auth.uid() and status = 'pending'
  order by created_at desc
  limit 1;

  if existing_code is not null then
    return existing_code;
  end if;

  insert into couples default values returning id into new_couple_id;

  loop
    new_code := generate_invite_code();
    begin
      insert into couple_invites (code, created_by, couple_id, status)
      values (new_code, auth.uid(), new_couple_id, 'pending');
      exit;
    exception when unique_violation then
      -- code collision (very unlikely) — loop and try a fresh one
    end;
  end loop;

  update profiles set couple_id = new_couple_id where id = auth.uid();

  return new_code;
end;
$$;

revoke all on function create_couple_invite() from public;
grant execute on function create_couple_invite() to authenticated;

create or replace function redeem_couple_invite(invite_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  member_count integer;
begin
  select * into inv from couple_invites where code = invite_code and status = 'pending';

  if inv is null then
    raise exception 'That code is invalid or has already been used.';
  end if;

  if inv.created_by = auth.uid() then
    raise exception 'You cannot redeem your own invite code.';
  end if;

  select count(*) into member_count from profiles where couple_id = inv.couple_id;
  if member_count >= 2 then
    raise exception 'That code has already been used.';
  end if;

  update profiles set couple_id = inv.couple_id where id = auth.uid();
  update couple_invites set status = 'redeemed' where id = inv.id;
end;
$$;

revoke all on function redeem_couple_invite(text) from public;
grant execute on function redeem_couple_invite(text) to authenticated;

-- Auto-create a profile row the moment someone signs up, rather than relying
-- on a client-side insert right after signUp() — that would race against
-- Supabase's "confirm email" setting, which leaves no active session (and so
-- no auth.uid()) until the user clicks the confirmation link.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
