-- Pairing, hardened.
--
-- Three things a six-character code should have had from the start.
--
-- It expires. A code is for the person sitting next to you, this week, and
-- one that still works in six months is a door left open. Seven days, then
-- the pair screen mints a fresh one.
--
-- Guessing is rate-limited. The alphabet gives a billion codes and a phone
-- can try a handful a second, so five wrong tries buys fifteen minutes of
-- being told to wait. The count is per person, kept in a table nobody can
-- read, and cleared by a success.
--
-- And the guard cannot be walked around. The app calls the guarded
-- functions, and the bare redeem is no longer callable by a signed-in user
-- at all: only the guarded one, which runs as the owner, can reach it.
--
-- Run AFTER solo-start.sql, and again after any re-run of it, because
-- solo-start.sql re-grants execute on the bare function at the end.
-- Safe to run more than once.

alter table couple_invites add column if not exists expires_at timestamptz;
alter table couple_invites alter column expires_at set default (now() + interval '7 days');
update couple_invites set expires_at = created_at + interval '7 days' where expires_at is null;

alter table couple_invites drop constraint if exists couple_invites_status_check;
alter table couple_invites
  add constraint couple_invites_status_check
  check (status in ('pending', 'redeemed', 'expired'));

-- Failed tries. RLS on with no policies, so nothing reads it but the
-- functions below, which run as the owner.
create table if not exists pairing_attempts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists pairing_attempts_recent on pairing_attempts (user_id, attempted_at);
alter table pairing_attempts enable row level security;
revoke all on pairing_attempts from public, anon, authenticated;

/*
 * Redeem, guarded.
 *
 * Returns the reason it did not work, or null when it did. It cannot RAISE
 * on a bad code, because a raised error rolls back the whole call, and the
 * one row that has to survive a bad code is the record that it happened.
 */
create or replace function redeem_couple_invite_guarded(invite_code text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  normalised text := upper(trim(invite_code));
  recent integer;
begin
  if me is null then
    return 'Not signed in.';
  end if;

  -- Housekeeping, cheap and here rather than on a schedule.
  delete from pairing_attempts where attempted_at < now() - interval '1 day';

  select count(*) into recent
  from pairing_attempts
  where user_id = me and attempted_at > now() - interval '15 minutes';

  if recent >= 5 then
    return 'Too many tries. Wait fifteen minutes and try again.';
  end if;

  -- An expired code says so. "Invalid" sends somebody back to check the
  -- letters; "expired" sends them to ask for a new one, which is the fix.
  update couple_invites
  set status = 'expired'
  where code = normalised and status = 'pending' and expires_at < now();

  if found then
    insert into pairing_attempts (user_id) values (me);
    return 'That code has expired. Ask them to send you a fresh one.';
  end if;

  begin
    perform redeem_couple_invite(normalised);
  exception when others then
    insert into pairing_attempts (user_id) values (me);
    return sqlerrm;
  end;

  delete from pairing_attempts where user_id = me;
  return null;
end;
$$;

revoke all on function redeem_couple_invite_guarded(text) from public, anon;
grant execute on function redeem_couple_invite_guarded(text) to authenticated;

-- The bare one is reachable only through the guard from now on.
revoke execute on function redeem_couple_invite(text) from public, anon, authenticated;

/*
 * Create, guarded: retires your own expired codes first, so that "the code
 * you already sent" is never a dead one.
 */
create or replace function create_couple_invite_guarded()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update couple_invites
  set status = 'expired'
  where created_by = auth.uid() and status = 'pending' and expires_at < now();

  return create_couple_invite();
end;
$$;

revoke all on function create_couple_invite_guarded() from public, anon;
grant execute on function create_couple_invite_guarded() to authenticated;

-- And the read that restores a code you already sent skips dead ones.
create or replace function my_pending_invite()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.code
  from couple_invites i
  where i.couple_id = my_couple_id()
    and i.created_by = auth.uid()
    and i.status = 'pending'
    and (i.expires_at is null or i.expires_at > now())
  order by i.created_at desc
  limit 1;
$$;

revoke all on function my_pending_invite() from public, anon;
grant execute on function my_pending_invite() to authenticated;

notify pgrst, 'reload schema';
