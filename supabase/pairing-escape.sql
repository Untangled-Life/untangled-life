-- SUPERSEDED by supabase/solo-start.sql, which redefines this same function to
-- carry the joiner's rows across before deleting the couple they left. Once
-- people can use the app before pairing there ARE rows to carry, and deleting
-- without moving them first would take somebody's to-dos and key dates with
-- it. Run solo-start.sql after this one, or instead of it.

-- Redeeming a code when you already have a couple of your own.
--
-- create_couple_invite() puts you in a couple the moment you generate a code,
-- so somebody who makes a code and then decides to enter their partner's
-- instead is already in a couple of one. redeem_couple_invite() moved them out
-- of it and said nothing about what they left behind:
--
--   * the abandoned couple row stayed, with nobody in it;
--   * its invite stayed 'pending', so the code they had already sent still
--     worked -- and now that the app can actually send it, it usually has
--     been sent.
--
-- The failure that produces is quiet and complete. A creates a code and sends
-- it. A changes their mind and redeems B's code, joining B's couple. B then
-- redeems A's code, which is still live, and lands in A's abandoned couple --
-- alone. Both people believe they are paired. Neither is with the other, and
-- each is looking at an empty diary waiting for the other to turn up.
--
-- Everything else is unchanged from couples.sql.
-- Run AFTER couples.sql. Safe to run more than once.

create or replace function redeem_couple_invite(invite_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  member_count integer;
  old_couple uuid;
  left_behind integer;
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

  -- Where they are now, before we move them.
  select couple_id into old_couple from profiles where id = auth.uid();

  update profiles set couple_id = inv.couple_id where id = auth.uid();
  update couple_invites set status = 'redeemed' where id = inv.id;

  -- NEW: clear up the one they left, if they were the only one in it.
  --
  -- Deleted rather than emptied: couple_invites cascades from couples, so
  -- this takes the live code with it, which is the whole point. A couple with
  -- somebody still in it is left exactly as it was -- that is a real couple
  -- and this is not the place to unpick one.
  if old_couple is not null and old_couple <> inv.couple_id then
    select count(*) into left_behind from profiles where couple_id = old_couple;

    if left_behind = 0 then
      delete from couples where id = old_couple;
    end if;
  end if;
end;
$$;

revoke all on function redeem_couple_invite(text) from public, anon;
grant execute on function redeem_couple_invite(text) to authenticated;

notify pgrst, 'reload schema';
