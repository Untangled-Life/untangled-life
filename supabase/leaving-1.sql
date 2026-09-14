-- Leaving a couple, and deleting an account.
--
-- Apple requires in-app account deletion, so this is a launch blocker rather
-- than a nicety. Unpairing shares almost all of its logic, so both live here.
--
-- The interesting part is what happens to shared things. Every table hangs off
-- auth.users with `on delete cascade`, which is right for your own data and
-- badly wrong for the couple's: deleting your account would take the
-- anniversary, every wishlist you happened to create, and every to-do you
-- added down with it, off your partner's phone, without either of you being
-- told. A couple's history should not be destroyed by the person who happened
-- to type it in.
--
-- So before an account is deleted, anything shared that is attributed to you
-- is handed to your partner, and only then are you removed. What goes is what
-- is genuinely yours alone: your busy blocks, your calendar choices, your
-- working hours, your push token, your profile. Your birthday goes too -- it
-- is about you, and it is meaningless once you are gone.
--
-- Run after work-hours.sql (any time; it only adds functions).

-- Hand everything shared to the remaining partner. Returns the partner's id,
-- or null if there wasn't one -- in which case there is nobody to hand things
-- to and the cascades can have them.
create or replace function reassign_shared_to_partner(leaving_user uuid, the_couple uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining uuid;
begin
  select id into remaining
  from profiles
  where couple_id = the_couple and id <> leaving_user
  limit 1;

  if remaining is null then
    return null;
  end if;

  update key_dates set created_by = remaining
    where couple_id = the_couple and created_by = leaving_user;
  update todos set created_by = remaining
    where couple_id = the_couple and created_by = leaving_user;
  update wishlists set created_by = remaining
    where couple_id = the_couple and created_by = leaving_user;
  update wishlist_items set added_by = remaining
    where couple_id = the_couple and added_by = leaving_user;
  update planned_events set created_by = remaining
    where couple_id = the_couple and created_by = leaving_user;

  -- A to-do assigned to the person leaving becomes unassigned rather than
  -- silently becoming the other person's job.
  update todos set assigned_to = null
    where couple_id = the_couple and assigned_to = leaving_user;

  -- Your birthday is about you. It has no meaning once you've gone, and it
  -- would cascade away anyway the moment the account is deleted -- doing it
  -- here means unpairing behaves the same as deleting.
  delete from key_dates
    where couple_id = the_couple and subject_user_id = leaving_user;

  return remaining;
end;
$$;

revoke all on function reassign_shared_to_partner(uuid, uuid) from public;

-- Clear out everything that is only ever about one person.
create or replace function purge_personal_data(the_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from busy_blocks where user_id = the_user;
  delete from calendar_prefs where user_id = the_user;
  delete from work_shifts where user_id = the_user;
  delete from work_patterns where user_id = the_user;
  delete from push_tokens where user_id = the_user;
  delete from planned_event_calendar_links where user_id = the_user;
end;
$$;

revoke all on function purge_personal_data(uuid) from public;

-- Leave the couple, keeping your account.
--
-- The other person keeps the shared history. You keep your sign-in, and land
-- back on the pairing screen able to pair again.
create or replace function leave_couple()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_couple uuid;
  remaining uuid;
begin
  if me is null then
    raise exception 'Not signed in.';
  end if;

  select couple_id into my_couple from profiles where id = me;

  if my_couple is null then
    return; -- already unpaired; nothing to do
  end if;

  remaining := reassign_shared_to_partner(me, my_couple);
  perform purge_personal_data(me);

  update profiles set couple_id = null where id = me;

  -- Any invite still outstanding for that couple is meaningless now.
  delete from couple_invites where couple_id = my_couple and status = 'pending';

  -- Last one out deletes the couple, which cascades the shared tables. Leaving
  -- an empty couple behind would strand its rows with nobody able to read them
  -- -- every policy is scoped to my_couple_id().
  if remaining is null then
    delete from couples where id = my_couple;
  end if;
end;
$$;

revoke all on function leave_couple() from public;
grant execute on function leave_couple() to authenticated;

-- Delete your account outright.
--
-- SECURITY DEFINER so it can reach auth.users, which the anon and authenticated
-- roles cannot touch. It only ever deletes auth.uid(), so there is no id to
-- pass and no way to aim it at somebody else.
create or replace function delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in.';
  end if;

  -- Hands shared things over, purges personal ones, and tidies the couple.
  perform leave_couple();

  -- profiles cascades from auth.users, and so does everything still pointing
  -- at this user.
  delete from auth.users where id = me;
end;
$$;

revoke all on function delete_own_account() from public;
grant execute on function delete_own_account() to authenticated;

notify pgrst, 'reload schema';
