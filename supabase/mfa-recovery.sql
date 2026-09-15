-- A way back in when the authenticator is gone.
--
-- Two-factor without recovery is a locked door with the only key on a phone
-- that can be lost, wiped or stolen. Since the database hides the couple's
-- shared life from a session that has a factor but has not passed it, a lost
-- authenticator would otherwise mean a lost account.
--
-- So enrolment hands over eight one-time codes. Each is shown once, stored
-- only as a hash, and spends itself when used. Redeeming one removes the
-- authenticator outright -- which is safe because the person redeeming has
-- already passed the password, and the code is the thing only they were
-- given. They are told to set two-factor up again afterwards.
--
-- These codes remove a factor, so they are password-strength secrets and are
-- treated like it: drawn from a cryptographic source, never handed back to
-- the client except as plaintext the once, and rate-limited on the way in so
-- the custom path is no weaker than the authenticator it stands in for.
--
-- Run AFTER two-factor.sql. Safe to run more than once.

create extension if not exists pgcrypto with schema extensions;

create table if not exists mfa_recovery_codes (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mfa_recovery_user on mfa_recovery_codes (user_id) where used_at is null;

-- Failed redeems, for the lockout. RLS on, no policies: nothing reads it but
-- the definer function.
create table if not exists mfa_recovery_attempts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists mfa_recovery_attempts_recent on mfa_recovery_attempts (user_id, attempted_at);

alter table mfa_recovery_codes enable row level security;
alter table mfa_recovery_attempts enable row level security;

-- The hashes are secrets in their own right, so the client never reads this
-- table at all. How many codes are left comes from the function below.
revoke all on mfa_recovery_codes from anon, authenticated;
revoke all on mfa_recovery_attempts from anon, authenticated;

/*
 * Mint a fresh set, returning the plaintext once.
 *
 * Any old codes are dropped first, so a regenerate genuinely replaces rather
 * than piling up. gen_random_bytes is the cryptographic source; each byte
 * picks a character, so the codes are not guessable the way random() would
 * make them. Only the SHA-256 of each is kept.
 */
create or replace function generate_mfa_recovery_codes()
returns setof text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  me uuid := auth.uid();
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 chars, no 0/O/1/I
  bytes bytea;
  raw text;
  formatted text;
  i integer;
  j integer;
begin
  if me is null then
    raise exception 'Not signed in.';
  end if;

  delete from mfa_recovery_codes where user_id = me;
  delete from mfa_recovery_attempts where user_id = me;

  for i in 1..8 loop
    raw := '';
    bytes := gen_random_bytes(8);
    for j in 0..7 loop
      -- Each byte modulo the alphabet. The modulo bias across 256/32 is
      -- exactly none, because 32 divides 256.
      raw := raw || substr(chars, (get_byte(bytes, j) % 32) + 1, 1);
    end loop;

    formatted := substr(raw, 1, 4) || '-' || substr(raw, 5, 4);

    insert into mfa_recovery_codes (user_id, code_hash)
    values (me, encode(digest(raw, 'sha256'), 'hex'));

    return next formatted;
  end loop;
end;
$$;

revoke all on function generate_mfa_recovery_codes() from public, anon;
grant execute on function generate_mfa_recovery_codes() to authenticated;

/*
 * How many unused codes are left, for the screen to show without ever seeing
 * a hash.
 */
create or replace function mfa_recovery_codes_left()
returns integer
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select count(*)::int from mfa_recovery_codes
  where user_id = auth.uid() and used_at is null;
$$;

revoke all on function mfa_recovery_codes_left() from public, anon;
grant execute on function mfa_recovery_codes_left() to authenticated;

/*
 * Spend one, and take the authenticator off.
 *
 * Rate-limited like the pairing code: five wrong tries in fifteen minutes and
 * it stops answering, so the ~40-bit code cannot be ground down in a loop by
 * somebody who has only the password. A good code clears the count and
 * removes the factor rows, which both my_couple_id()'s gate and GoTrue's own
 * assurance-level maths read live, so the account is usable again at once.
 */
create or replace function redeem_mfa_recovery_code(code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  me uuid := auth.uid();
  normalised text := upper(replace(replace(trim(code), '-', ''), ' ', ''));
  recent integer;
  target bigint;
begin
  if me is null then
    return false;
  end if;

  delete from mfa_recovery_attempts where attempted_at < now() - interval '1 day';

  select count(*) into recent
  from mfa_recovery_attempts
  where user_id = me and attempted_at > now() - interval '15 minutes';

  if recent >= 5 then
    raise exception 'Too many tries. Wait fifteen minutes and try again.';
  end if;

  select id into target
  from mfa_recovery_codes
  where user_id = me
    and used_at is null
    and code_hash = encode(digest(normalised, 'sha256'), 'hex')
  limit 1;

  if target is null then
    insert into mfa_recovery_attempts (user_id) values (me);
    return false;
  end if;

  update mfa_recovery_codes set used_at = now() where id = target;
  delete from mfa_recovery_attempts where user_id = me;

  -- The lost factor comes off, so the next request is at the password's level
  -- and the couple's data is reachable again.
  delete from auth.mfa_factors where user_id = me;

  return true;
end;
$$;

revoke all on function redeem_mfa_recovery_code(text) from public, anon;
grant execute on function redeem_mfa_recovery_code(text) to authenticated;

notify pgrst, 'reload schema';
