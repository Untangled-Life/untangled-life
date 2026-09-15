-- Getting in before there is anybody to share it with.
--
-- Pairing was the first wall anybody met: sign up, and the app immediately
-- asked for a code from a partner who had not been invited yet, with nothing
-- else reachable. So the first thing a new person saw was a locked door, and
-- the only way through it was somebody else's phone.
--
-- Everybody now gets a couple of their own the moment they sign up, which is
-- what the app already did the moment you generated an invite code -- just
-- earlier, and without being asked. A couple of one is a perfectly good
-- couple as far as every table here is concerned: the rows belong to it, the
-- policies scope by it, and when somebody else joins, they join the thing
-- that is already there.
--
-- Run AFTER couples.sql, pairing-fix.sql, birthday-subject.sql, leaving.sql,
-- date-nudge.sql, date-flag.sql and every table that has a couple_id.
--
-- pairing-fix.sql matters more than it looks: the original create_couple_invite
-- in couples.sql refuses outright if you already have a couple_id -- which,
-- after this file, is everybody, from the moment they sign up. Without it
-- nobody can ever generate an invite code again.
--
-- Safe to run more than once.

/*
 * A couple for whoever is asking, if they have not got one.
 *
 * Called by the app on the way in, so an account made before this file ran
 * gets one on next open rather than staying locked out of its own data.
 */
create or replace function ensure_couple()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing uuid;
  made uuid;
begin
  -- for update, because the app asks this twice on the way in: once from
  -- the stored session and once from the INITIAL_SESSION event. Without the
  -- lock both see null, both make a couple, and the one that loses the race
  -- still hands its id back to the client -- which then spends the session
  -- sending a couple_id that my_couple_id() disagrees with, so every write
  -- is refused by RLS until the app is restarted.
  select couple_id into existing from profiles where id = auth.uid() for update;

  if existing is not null then
    return existing;
  end if;

  insert into couples default values returning id into made;

  update profiles set couple_id = made where id = auth.uid();

  if not found then
    -- No profile to attach it to, so do not leave a couple nobody is in.
    delete from couples where id = made;
    return null;
  end if;

  return made;
end;
$$;

revoke all on function ensure_couple() from public, anon;
grant execute on function ensure_couple() to authenticated;

/*
 * And the same at sign-up, so the app almost never has to ask.
 *
 * Unchanged from couples.sql apart from the couple.
 */
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  made uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;

  -- After the profile, and only when there is not one already: the insert
  -- above does nothing on conflict, so making the couple first would leave
  -- an unreferenced couple behind every time the trigger re-fired.
  if exists (select 1 from profiles where id = new.id and couple_id is null) then
    insert into couples default values returning id into made;
    update profiles set couple_id = made where id = new.id;
  end if;

  return new;
end;
$$;

-- Accounts that already exist and never paired. One each.
do $$
declare
  orphan record;
  made uuid;
begin
  for orphan in select id from profiles where couple_id is null loop
    insert into couples default values returning id into made;
    update profiles set couple_id = made where id = orphan.id;
  end loop;
end $$;

-- An earlier, blunter version of the key_dates constraint: one anniversary
-- AND one birthday per couple, with no room for two people's birthdays.
-- birthday-subject.sql drops it and replaces it with a pair that allows one
-- birthday each, but on a database where that file has not run, the first
-- pairing of two solo users fails on somebody's birthday.
drop index if exists key_dates_singleton_kind;

/*
 * Joining somebody now means bringing your things with you.
 *
 * Until now a person redeeming a code had nothing to bring: they could not
 * reach the app at all before pairing. Now they can have a fortnight of
 * to-dos, their own working hours and half a wishlist, and moving their
 * profile across on its own would leave every one of those rows behind in a
 * couple nobody is in -- which pairing-escape.sql then deletes, taking the
 * lot with it.
 *
 * So the rows move first, and the empty couple goes afterwards. What cannot
 * move is what the couples row itself carries -- the free-time window, the
 * cover photo -- because the couple they are joining already has its own
 * answers to those and one of the two has to win. The one being joined keeps
 * theirs.
 */
create or replace function redeem_couple_invite(invite_code text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
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

  select couple_id into old_couple from profiles where id = auth.uid();

  update profiles set couple_id = inv.couple_id where id = auth.uid();
  update couple_invites set status = 'redeemed' where id = inv.id;

  if old_couple is not null and old_couple <> inv.couple_id then
    select count(*) into left_behind from profiles where couple_id = old_couple;

    -- Only when they were the only one in it. A couple with somebody still
    -- in it is a real couple, and this is not the place to unpick one.
    if left_behind = 0 then
      -- One anniversary per couple, enforced by a unique index. Both of them
      -- can now set one alone -- the setup card on Home asks for it -- and
      -- carrying a second across raises a constraint error that aborts the
      -- whole thing, so pairing fails with a Postgres string on screen and
      -- no way to recover short of guessing which row to delete.
      --
      -- The couple being joined keeps theirs, on the same principle as the
      -- free-time window and the cover photo: the joiner moves in.
      delete from key_dates
        where couple_id = old_couple
          and kind = 'anniversary'
          and exists (
            select 1 from key_dates keep
            where keep.couple_id = inv.couple_id and keep.kind = 'anniversary'
          );

      update todos set couple_id = inv.couple_id where couple_id = old_couple;
      update wishlists set couple_id = inv.couple_id where couple_id = old_couple;
      update wishlist_items set couple_id = inv.couple_id where couple_id = old_couple;
      update key_dates set couple_id = inv.couple_id where couple_id = old_couple;
      update planned_events set couple_id = inv.couple_id where couple_id = old_couple;
      update busy_blocks set couple_id = inv.couple_id where couple_id = old_couple;
      update work_patterns set couple_id = inv.couple_id where couple_id = old_couple;
      update work_shifts set couple_id = inv.couple_id where couple_id = old_couple;
      update valued_answers set couple_id = inv.couple_id where couple_id = old_couple;
      update date_reviews set couple_id = inv.couple_id where couple_id = old_couple;

      -- Proposals are the exception: an offer of three times, made to
      -- nobody, is not something to carry into a real relationship.
      delete from date_proposals where couple_id = old_couple;

      -- The cover photo is stored under the couple id, and both storage
      -- policies scope on it -- so a file left behind under a couple that no
      -- longer exists cannot be read or deleted by anybody, ever, including
      -- the person who uploaded it. leaving.sql does this for the same
      -- reason. The walkthrough now asks for a cover before pairing, so this
      -- is the ordinary path rather than an edge case.
      delete from storage.objects
        where bucket_id = 'photos'
          and (storage.foldername(name))[1] = 'covers'
          and (storage.foldername(name))[2] = old_couple::text;

      -- Takes any invite code they had out with it, which is the point: a
      -- code that still worked would send somebody into an empty couple.
      delete from couples where id = old_couple;
    end if;
  end if;
end;
$$;

revoke all on function redeem_couple_invite(text) from public, anon;
grant execute on function redeem_couple_invite(text) to authenticated;

/*
 * The invite code you already have, if you have one.
 *
 * create_couple_invite() MAKES one, which was the right thing to call when a
 * couple_id could only mean "I already generated a code". Now everybody has a
 * couple from the moment they sign up, so calling it on the way into the
 * pairing screen would mint a code for somebody who came there holding their
 * partner's -- and put them in front of a spinner saying "waiting for them to
 * enter it" instead of the box they were looking for.
 */
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
  order by i.created_at desc
  limit 1;
$$;

revoke all on function my_pending_invite() from public, anon;
grant execute on function my_pending_invite() to authenticated;

/*
 * And a couple of one is not a couple that has drifted.
 *
 * The app stopped showing the fortnightly nudge to somebody on their own, but
 * this is what actually sends it, and it counted every couple with nothing
 * booked -- which since this file is every solo account in the database. The
 * only thing masking it is that a never-paired phone has no push token
 * registered; somebody who has just unpaired keeps theirs, and would get
 * "keep the fire alive" about a relationship they ended last week.
 *
 * Unchanged from date-flag.sql apart from the having clause.
 */
create or replace function couples_due_a_nudge()
returns table (couple_id uuid, member_ids uuid[])
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    array_agg(p.id)
  from couples c
  join profiles p on p.couple_id = c.id
  where
    (c.date_nudged_at is null or c.date_nudged_at < now() - interval '14 days')

    and not exists (
      select 1 from planned_events e
      where e.couple_id = c.id
        and e.cancelled = false
        and e.is_date
        and e.created_at >= now() - interval '14 days'
    )

    and not exists (
      select 1 from planned_events e
      where e.couple_id = c.id
        and e.cancelled = false
        and e.is_date
        and (
          (e.repeat_every = 'none' and e.start_at between now() and now() + interval '14 days')
          or (e.repeat_every <> 'none'
              and (e.repeat_until is null or e.repeat_until >= current_date))
        )
    )
  group by c.id
  -- There has to be somebody to have a date with.
  having count(p.id) > 1;
$$;

revoke all on function couples_due_a_nudge() from public, anon, authenticated;

/*
 * Unpairing from nobody.
 *
 * leave_couple() deletes the couple when it is the last one out, which is
 * right for two people parting and catastrophic for one person alone: it
 * cascades away every key date, to-do, wishlist, planned event and working
 * hour they have. That was unreachable while pairing was a gate -- Settings
 * was behind it -- and is now one tap for anybody who has not paired yet.
 *
 * The Unpair row is hidden for them in the app. This is the same answer in
 * the place it cannot be got around, because a wipe with no confirmation
 * worth the name should not be reachable at all.
 *
 * delete_own_account() still needs the destructive path and calls the inner
 * one, which is unchanged.
 */
create or replace function leave_couple_internal()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  my_couple uuid;
  remaining uuid;
  member_count integer;
begin
  if me is null then
    raise exception 'Not signed in.';
  end if;

  select couple_id into my_couple from profiles where id = me;

  if my_couple is null then
    return; -- already unpaired; nothing to do
  end if;

  -- Serialise on the couple row before reading who is in it.
  --
  -- Without this, both partners unpairing at once each read the other as
  -- "remaining", so neither deletes the couple -- and every key date, to-do
  -- and wishlist keeps a couple_id that nobody's my_couple_id() will ever
  -- match again. The rows become permanently unreadable and undeletable, which
  -- is the exact outcome the delete below exists to prevent.
  perform 1 from couples where id = my_couple for update;

  remaining := reassign_shared_to_partner(me, my_couple);
  perform purge_personal_data(me, keep_device := true);

  update profiles set couple_id = null where id = me;

  -- Any invite still outstanding for that couple is meaningless now.
  delete from couple_invites where couple_id = my_couple and status = 'pending';

  -- Re-count rather than trusting the earlier read: under the lock this is the
  -- authoritative answer, and it is taken AFTER our own couple_id is cleared.
  select count(*) into member_count from profiles where couple_id = my_couple;

  -- Last one out deletes the couple, which cascades the shared tables.
  if member_count = 0 then
    -- The cover photo belongs to the couple, so it goes when the couple does.
    -- It has to happen here: once couples is gone, my_couple_id() is null for
    -- everyone and the storage policy denies that path forever, so a file left
    -- behind can never be removed by anybody.
    delete from storage.objects
    where bucket_id = 'photos'
      and (storage.foldername(name))[1] = 'covers'
      and (storage.foldername(name))[2] = my_couple::text;

    delete from couples where id = my_couple;
  end if;
end;
$$;

revoke all on function leave_couple_internal() from public, anon, authenticated;

/*
 * The one the app calls. Refuses when there is nobody to leave.
 */
create or replace function leave_couple()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  member_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  select count(*) into member_count
  from profiles
  where couple_id = (select couple_id from profiles where id = auth.uid());

  if member_count < 2 then
    raise exception 'There is nobody to unpair from.';
  end if;

  perform leave_couple_internal();
end;
$$;

revoke all on function leave_couple() from public, anon;
grant execute on function leave_couple() to authenticated;

create or replace function delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in.';
  end if;

  -- Hands shared things over, purges personal ones, and tidies the couple.
  perform leave_couple_internal();

  -- leave_couple keeps the push token, because unpairing shouldn't unregister
  -- your device. Deleting the account should.
  delete from push_tokens where user_id = me;

  -- The avatar goes with the account, and the pointer goes with it: leaving
  -- avatar_path set means the app signs a URL for an object that no longer
  -- exists (createSignedUrl signs a path without checking it), so <Image> gets
  -- a non-null URL that 404s and the initials fallback never fires.
  update profiles set avatar_path = null where id = me;

  -- Scoped to avatars rather than `owner = me`: deleting everything this user
  -- owns would take the couple's cover photo with it, which is not theirs to
  -- destroy on the way out. leave_couple has already handed that over or
  -- deleted it with the couple.
  --
  -- This removes the metadata row, which is what a storage object still owned
  -- by the user blocks the delete below on -- projects where
  -- storage.objects.owner still has a foreign key to auth.users. It does NOT
  -- remove the file from the object store; only the Storage API does that, so
  -- the app deletes the file before calling this and this is the backstop.
  delete from storage.objects
  where bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = me::text;

  -- profiles cascades from auth.users, and so does everything still pointing
  -- at this user.
  delete from auth.users where id = me;

  -- A SECURITY DEFINER function that lacks the privilege to touch auth.users
  -- deletes zero rows and raises nothing. Without this the app would sign the
  -- user out, show the sign-in screen, and report success -- while the account,
  -- its identities and its email still exist. That is a failed Apple
  -- requirement and retained personal data, reported as done.
  if not found then
    raise exception 'Account deletion did not complete. Nothing has been removed from your sign-in.';
  end if;
end;
$$;

revoke all on function delete_own_account() from public, anon;
grant execute on function delete_own_account() to authenticated;

notify pgrst, 'reload schema';
