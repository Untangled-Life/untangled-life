-- Wishlists get a picture, and the tab gets a second half: travel.
--
-- A wishlist is a list of things somebody wants, and "Camping gear" tells you
-- less at a glance than a photograph of the tent. A trip is the same idea one
-- size up: the flights, where you are staying, the things you said you would
-- do -- most of which start life as a screenshot of something not booked yet.
--
-- Three new columns, two new tables, and the storage policies widened to
-- cover them. Everything is scoped to the couple like everything else here.
--
-- Run AFTER relationship-features.sql, photos.sql, leaving.sql and
-- solo-start.sql. Safe to run more than once.

alter table wishlists add column if not exists cover_path text;
alter table key_dates add column if not exists photo_path text;
alter table couples add column if not exists wishlists_seeded boolean not null default false;

/*
 * A trip.
 *
 * Dates are optional on purpose. Half the trips that matter start as "Japan,
 * maybe April", and a form that will not take that until you have booked
 * something is a form you fill in after the fact, which is too late to be
 * any use.
 */
create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,

  title text not null,
  destination text,
  start_date date,
  end_date date,
  notes text,

  -- covers/<couple_id>/... in the photos bucket, like the home screen's.
  cover_path text,

  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint trips_dates_in_order
    check (start_date is null or end_date is null or end_date >= start_date)
);

create index if not exists trips_couple on trips (couple_id, start_date);

/*
 * Everything inside one.
 *
 * One table rather than five, because a flight and a restaurant differ in
 * what you call them and almost nothing else: both are a name, a time, a
 * reference number you will need at a counter, and usually a screenshot.
 * Five tables would be five sets of policies and five screens to keep in
 * step, for one column's worth of difference.
 *
 * `booked` is the distinction that actually matters on a trip, and it is not
 * the same as having a date: a flight you have paid for and a flight you have
 * a screenshot of look identical in a list until something says which is
 * which.
 */
create table if not exists trip_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,

  kind text not null check (kind in ('flight', 'stay', 'tour', 'todo', 'food', 'prep', 'note')),

  title text not null,
  detail text,

  at_date date,
  -- Local time where it happens, so no zone. A flight at 06:40 is at 06:40
  -- wherever you are reading it.
  at_time time,

  reference text,
  url text,

  -- trips/<couple_id>/... A boarding pass, a booking email, a screenshot of
  -- an itinerary somebody sent you.
  photo_path text,

  booked boolean not null default false,

  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists trip_items_trip on trip_items (trip_id, kind, at_date);

alter table trips enable row level security;
alter table trip_items enable row level security;

drop policy if exists "Couple can view trips" on trips;
create policy "Couple can view trips" on trips
  for select to authenticated using (couple_id = my_couple_id());
drop policy if exists "Couple can add trips" on trips;
create policy "Couple can add trips" on trips
  for insert to authenticated with check (couple_id = my_couple_id() and created_by = auth.uid());
drop policy if exists "Couple can update trips" on trips;
create policy "Couple can update trips" on trips
  for update to authenticated using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
drop policy if exists "Couple can delete trips" on trips;
create policy "Couple can delete trips" on trips
  for delete to authenticated using (couple_id = my_couple_id());

drop policy if exists "Couple can view trip items" on trip_items;
create policy "Couple can view trip items" on trip_items
  for select to authenticated using (couple_id = my_couple_id());
drop policy if exists "Couple can add trip items" on trip_items;
create policy "Couple can add trip items" on trip_items
  for insert to authenticated with check (couple_id = my_couple_id() and added_by = auth.uid());
drop policy if exists "Couple can update trip items" on trip_items;
create policy "Couple can update trip items" on trip_items
  for update to authenticated using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
drop policy if exists "Couple can delete trip items" on trip_items;
create policy "Couple can delete trip items" on trip_items
  for delete to authenticated using (couple_id = my_couple_id());

/*
 * The photos bucket now holds four kinds of thing, not two.
 *
 * covers/<couple_id>     the home screen photo
 * wishlists/<couple_id>  a picture for a list
 * trips/<couple_id>      a cover, a boarding pass, a screenshot of a hotel
 * dates/<couple_id>      the face that belongs to a birthday or an anniversary
 *
 * All three new folders follow the same rule the cover already did: either of
 * you writes it, both of you read it, nobody outside the couple sees it. The
 * policies are rewritten rather than added to, because a second policy on the
 * same command ORs with the first and the file would stop being readable as
 * one answer to "who can touch what".
 */
drop policy if exists "Read photos in my couple" on storage.objects;
create policy "Read photos in my couple" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (
      (
        (storage.foldername(name))[1] = 'avatars'
        and exists (
          select 1 from profiles p
          where p.id::text = (storage.foldername(name))[2]
            and (p.id = auth.uid() or p.couple_id = my_couple_id())
        )
      )
      or
      (
        (storage.foldername(name))[1] in ('covers', 'wishlists', 'trips', 'dates')
        and (storage.foldername(name))[2] = my_couple_id()::text
      )
    )
  );

drop policy if exists "Write photos in my couple" on storage.objects;
create policy "Write photos in my couple" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (
      -- Only you may write your own avatar. A partner replacing your profile
      -- picture is not a feature.
      ((storage.foldername(name))[1] = 'avatars'
        and (storage.foldername(name))[2] = auth.uid()::text)
      or
      ((storage.foldername(name))[1] in ('covers', 'wishlists', 'trips', 'dates')
        and (storage.foldername(name))[2] = my_couple_id()::text)
    )
  );

drop policy if exists "Replace photos in my couple" on storage.objects;
create policy "Replace photos in my couple" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos'
    and (
      ((storage.foldername(name))[1] = 'avatars'
        and (storage.foldername(name))[2] = auth.uid()::text)
      or
      ((storage.foldername(name))[1] in ('covers', 'wishlists', 'trips', 'dates')
        and (storage.foldername(name))[2] = my_couple_id()::text)
    )
  );

drop policy if exists "Remove photos in my couple" on storage.objects;
create policy "Remove photos in my couple" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and (
      ((storage.foldername(name))[1] = 'avatars'
        and (storage.foldername(name))[2] = auth.uid()::text)
      or
      ((storage.foldername(name))[1] in ('covers', 'wishlists', 'trips', 'dates')
        and (storage.foldername(name))[2] = my_couple_id()::text)
    )
  );

/*
 * The lists every couple turns out to want.
 *
 * Seeded once, on first sight of the wishlists screen, and flagged on the
 * couple so somebody who deletes all three does not find them back the next
 * morning. The names come from the app rather than from here, because one of
 * them has a person's name in it.
 */
create or replace function seed_default_wishlists(names text[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  the_couple uuid := my_couple_id();
  already boolean;
  one text;
begin
  if the_couple is null then
    return;
  end if;

  -- Locked, because both phones can open this screen at the same moment and
  -- two runs would give the couple six lists.
  select wishlists_seeded into already from couples where id = the_couple for update;

  if already then
    return;
  end if;

  -- And not for a couple who already has lists: this is a starting point for
  -- an empty screen, not an opinion about somebody's existing ones.
  if exists (select 1 from wishlists where couple_id = the_couple) then
    update couples set wishlists_seeded = true where id = the_couple;
    return;
  end if;

  foreach one in array names loop
    insert into wishlists (couple_id, name, created_by)
    values (the_couple, one, auth.uid());
  end loop;

  update couples set wishlists_seeded = true where id = the_couple;
end;
$$;

revoke all on function seed_default_wishlists(text[]) from public, anon;
grant execute on function seed_default_wishlists(text[]) to authenticated;

/*
 * Unpairing, now that a couple can own trips.
 *
 * Copied from leaving.sql with the two new tables added to the handover.
 * A trip belongs to the couple rather than to whoever typed it in, so it
 * stays with whoever stays -- the same rule the to-dos and the wishlists
 * already follow.
 */
create or replace function reassign_shared_to_partner(leaving_user uuid, the_couple uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
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
  update trips set created_by = remaining
    where couple_id = the_couple and created_by = leaving_user;
  update trip_items set added_by = remaining
    where couple_id = the_couple and added_by = leaving_user;

  -- The couple's photos stay -- but they can't stay owned by someone about to
  -- be deleted. On projects where storage.objects.owner still references
  -- auth.users, leaving them would make the account deletion fail outright;
  -- on the rest they would dangle.
  --
  -- All four folders, not just covers: a wishlist cover, a trip photo, a
  -- boarding pass and a birthday photograph are all things one person
  -- uploaded into a couple that is staying.
  update storage.objects set owner = remaining
    where bucket_id = 'photos'
      and (storage.foldername(name))[1] in ('covers', 'wishlists', 'trips', 'dates')
      and (storage.foldername(name))[2] = the_couple::text
      and owner = leaving_user;

  -- Newer Supabase projects carry owner_id (text) alongside the deprecated
  -- owner (uuid). Guarded because older projects have no such column, and a
  -- plain reference to it would fail to parse there.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner_id'
  ) then
    execute format(
      'update storage.objects set owner_id = %L
         where bucket_id = ''photos''
           and (storage.foldername(name))[1] in (''covers'', ''wishlists'', ''trips'', ''dates'')
           and (storage.foldername(name))[2] = %L
           and owner_id = %L',
      remaining::text, the_couple::text, leaving_user::text
    );
  end if;

  -- planned_events carries three more references to a person, and all three
  -- have to let go.
  --
  -- This matters more than it looks. planned_events_members_only() refuses any
  -- write naming somebody outside the couple, so an event still owned by the
  -- person who left cannot be edited by the one who stayed -- and because the
  -- app deletes by CANCELLING, which is an update, it cannot be removed
  -- either. The event sticks on the shared calendar permanently with no way
  -- to touch it. Account deletion is fine on its own (the FK is `on delete
  -- set null`); unpairing has no such mechanism, which is exactly why it needs
  -- one here.
  update planned_events set owner_user_id = null
    where couple_id = the_couple and owner_user_id = leaving_user;
  update planned_events set push_to = array_remove(push_to, leaving_user)
    where couple_id = the_couple and leaving_user = any(push_to);
  update planned_events set updated_by = null
    where couple_id = the_couple and updated_by = leaving_user;

  -- A to-do assigned to the person leaving becomes unassigned rather than
  -- silently becoming the other person's job.
  update todos set assigned_to = null
    where couple_id = the_couple and assigned_to = leaving_user;

  -- Your birthday is about you. It has no meaning once you've gone, and it
  -- would cascade away anyway the moment the account is deleted -- doing it
  -- here means unpairing behaves the same as deleting.
  -- Their birthday goes, and so does the photograph on it: the row is what
  -- pointed at the file, and after this nothing can reach it.
  delete from storage.objects
    where bucket_id = 'photos'
      and (storage.foldername(name))[1] = 'dates'
      and (storage.foldername(name))[2] = the_couple::text
      and name in (
        select k.photo_path from key_dates k
        where k.couple_id = the_couple
          and k.subject_user_id = leaving_user
          and k.photo_path is not null
      );

  delete from key_dates
    where couple_id = the_couple and subject_user_id = leaving_user;

  -- The three tables added after this function was first written.
  --
  -- Account DELETION was always fine: every one of them cascades from
  -- auth.users. Unpairing is not, because the couple row survives, and a row
  -- left behind with the old couple_id stays readable by whoever is still in
  -- that couple. Worse, couples are reused: B invites D into the same couple,
  -- and the app's "what your partner said" query then matches TWO rows, so B
  -- can be shown their EX's most private answer under the heading "What D
  -- said".
  --
  -- Deleted rather than reassigned, because none of it means anything
  -- detached from the person who wrote it. "What makes me feel valued" is not
  -- transferable, and a verdict on a date is an opinion rather than a record
  -- of it.
  delete from valued_answers
    where user_id = leaving_user and couple_id = the_couple;

  delete from date_reviews
    where user_id = leaving_user and couple_id = the_couple;

  -- Withdrawn rather than deleted: the partner may be looking at it right
  -- now, and a row that vanishes mid-read is worse than one that says it was
  -- withdrawn. Either way it stops being answerable, which is the point --
  -- otherwise answer_date_proposal() would cheerfully create a real event in
  -- both diaries on behalf of somebody who has gone.
  update date_proposals
    set status = 'withdrawn', answered_at = now()
    where couple_id = the_couple
      and proposed_by = leaving_user
      and status = 'open';

  return remaining;
end;
$$;

revoke all on function reassign_shared_to_partner(uuid, uuid) from public;

/*
 * Joining somebody, now that there are trips to bring with you.
 *
 * Copied from solo-start.sql with trips and their contents added to the
 * move, and the storage sweep widened to the folders that exist now: a file
 * under a couple that no longer exists can never be read or deleted by
 * anybody, because every policy checks that id.
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
      update trips set couple_id = inv.couple_id where couple_id = old_couple;
      update trip_items set couple_id = inv.couple_id where couple_id = old_couple;
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

      -- Every photo path has the OLD couple's id in it, and every storage
      -- policy checks that segment -- so the rows that just moved are now
      -- pointing at files their new couple can never read. The files go, and
      -- the columns are cleared with them: a path to a file that is not
      -- there renders as a blank tile rather than as the invitation to add
      -- one, which is worse than having no photo.
      --
      -- Losing them is the honest outcome of a rename we cannot do in SQL.
      -- Note that this removes the storage ROW; the bytes themselves are
      -- only reachable through the Storage API, so they are orphaned rather
      -- than reclaimed. Nobody can read them either way -- every policy
      -- checks the couple segment -- but a cleanup job is what would
      -- actually free the space.
      -- The couple's own cover is the exception: the app carries those bytes
      -- across before calling this (see carryCoverInto in lib/photos.ts).
      update wishlists set cover_path = null where couple_id = inv.couple_id and cover_path like 'wishlists/' || old_couple::text || '/%';
      update trips set cover_path = null where couple_id = inv.couple_id and cover_path like 'trips/' || old_couple::text || '/%';
      update trip_items set photo_path = null where couple_id = inv.couple_id and photo_path like 'trips/' || old_couple::text || '/%';
      update key_dates set photo_path = null where couple_id = inv.couple_id and photo_path like 'dates/' || old_couple::text || '/%';

      delete from storage.objects
        where bucket_id = 'photos'
          and (storage.foldername(name))[1] in ('covers', 'wishlists', 'trips', 'dates')
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
 * And the same when the last one out closes the couple.
 *
 * Copied from solo-start.sql with the storage sweep widened. The comment
 * there explains why it has to happen before the couple row goes.
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
      and (storage.foldername(name))[1] in ('covers', 'wishlists', 'trips', 'dates')
      and (storage.foldername(name))[2] = my_couple::text;

    delete from couples where id = my_couple;
  end if;
end;
$$;

revoke all on function leave_couple_internal() from public, anon, authenticated;

notify pgrst, 'reload schema';
