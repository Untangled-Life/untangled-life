-- Pairing fix.
--
-- create_couple_invite() sets your couple_id the moment you generate a code,
-- so "has a couple_id" was never the same thing as "is paired" -- it's true
-- from the moment you invite, while you're still waiting for anyone to join.
-- Two things fell out of that:
--
--   1. Calling create_couple_invite() again raised "You are already paired
--      with a partner", so anyone who closed the app before their partner
--      joined could never get their own code back.
--   2. The app let a couple-of-one straight into the main tabs, with no
--      partner and no route back to the pairing screen.
--
-- Being paired now means the couple actually has two members. Run any time
-- after couples.sql; it only replaces the one function.

create or replace function create_couple_invite()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_couple uuid;
  member_count integer;
  existing_code text;
  new_couple_id uuid;
  new_code text;
begin
  select couple_id into existing_couple from profiles where id = auth.uid();

  if existing_couple is not null then
    select count(*) into member_count from profiles where couple_id = existing_couple;

    if member_count >= 2 then
      raise exception 'You are already paired with a partner.';
    end if;

    -- A couple of one: still waiting for the partner. Hand back the pending
    -- code if there is one, otherwise mint a fresh code for the couple that
    -- already exists rather than creating a second one.
    select code into existing_code
    from couple_invites
    where couple_id = existing_couple and status = 'pending'
    order by created_at desc
    limit 1;

    if existing_code is not null then
      return existing_code;
    end if;

    loop
      new_code := generate_invite_code();
      begin
        insert into couple_invites (code, created_by, couple_id, status)
        values (new_code, auth.uid(), existing_couple, 'pending');
        exit;
      exception when unique_violation then
        null; -- code collision, try another
      end;
    end loop;

    return new_code;
  end if;

  insert into couples default values returning id into new_couple_id;

  loop
    new_code := generate_invite_code();
    begin
      insert into couple_invites (code, created_by, couple_id, status)
      values (new_code, auth.uid(), new_couple_id, 'pending');
      exit;
    exception when unique_violation then
      null; -- code collision, try another
    end;
  end loop;

  update profiles set couple_id = new_couple_id where id = auth.uid();

  return new_code;
end;
$$;

revoke all on function create_couple_invite() from public;
grant execute on function create_couple_invite() to authenticated;
