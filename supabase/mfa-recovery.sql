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
-- Run AFTER two-factor.sql. Safe to run more than once.

create table if not exists mfa_recovery_codes (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mfa_recovery_user on mfa_recovery_codes (user_id) where used_at is null;

alter table mfa_recovery_codes enable row level security;

-- The person may see how many codes they have left, and nothing more: the
-- hashes reveal nothing, and there is deliberately no client insert, update
-- or delete. Everything that writes goes through the definer functions.
drop policy if exists "See own recovery code count" on mfa_recovery_codes;
create policy "See own recovery code count" on mfa_recovery_codes
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on mfa_recovery_codes from anon, authenticated;
grant select on mfa_recovery_codes to authenticated;

/*
 * Mint a fresh set, returning the plaintext once.
 *
 * Any old codes are dropped first, so a regenerate genuinely replaces rather
 * than piling up. The plaintext is returned to the caller a single time and
 * never stored; only the SHA-256 of each is kept.
 */
create or replace function generate_mfa_recovery_codes()
returns setof text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  me uuid := auth.uid();
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  raw text;
  formatted text;
  i integer;
  j integer;
begin
  if me is null then
    raise exception 'Not signed in.';
  end if;

  delete from mfa_recovery_codes where user_id = me;

  for i in 1..8 loop
    raw := '';
    for j in 1..8 loop
      raw := raw || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;

    -- Shown as two readable groups; stored without the dash so redeeming is
    -- forgiving about it.
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
 * Spend one, and take the authenticator off.
 *
 * Returns true when the code was good. The factor rows are deleted directly,
 * which both my_couple_id()'s gate and GoTrue's own assurance-level maths read
 * from, so the account is immediately usable again at the password's level.
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
  target bigint;
begin
  if me is null then
    return false;
  end if;

  select id into target
  from mfa_recovery_codes
  where user_id = me
    and used_at is null
    and code_hash = encode(digest(normalised, 'sha256'), 'hex')
  limit 1;

  if target is null then
    return false;
  end if;

  update mfa_recovery_codes set used_at = now() where id = target;

  -- The whole point: the lost factor comes off, so the next request is at the
  -- password's own level and the couple's data is reachable again.
  delete from auth.mfa_factors where user_id = me;

  return true;
end;
$$;

revoke all on function redeem_mfa_recovery_code(text) from public, anon;
grant execute on function redeem_mfa_recovery_code(text) to authenticated;

notify pgrst, 'reload schema';
