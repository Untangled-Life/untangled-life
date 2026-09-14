-- A real calendar: events that belong to someone, and choose whose phone they
-- land on.
--
-- planned_events already existed for "Book it on both phones", where both was
-- the only option and the event belonged to the couple. A calendar you can
-- actually run your life on needs two more things:
--
--   owner_user_id -- whose it is. Null means "Us". Colour on the calendar
--                    follows this, not who typed it in: Roy putting Alyssa's
--                    dentist appointment in should show as hers.
--   push_to       -- whose PHONE calendar it goes to, as its own choice. Not
--                    derived from the owner, because the two genuinely differ:
--                    a shared dinner belongs to both of you and wants to be on
--                    both phones, while "Alyssa - school pickup" is hers but
--                    you might well want it in your own diary too.
--
-- Also gives each partner a colour, used everywhere the app draws their stuff.
--
-- Run after planned-events.sql and couples.sql.

alter table planned_events
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

-- `on delete set null` is deliberate: when someone deletes their account their
-- events become the couple's rather than vanishing. leaving.sql does the same
-- thing for unpairing, so the two behave alike.

-- Added NULLABLE and backfilled before the default and the not-null go on.
--
-- The obvious version -- add it with a default of '{}' and then backfill
-- `where push_to = '{}'` -- is not safe to re-run, and every other statement
-- in this file is, which is exactly what invites someone to run it twice. An
-- empty push_to is a real choice the editor offers ("Off means it stays in
-- Untangled Life"), so a second run would read every deliberately-private
-- event as un-backfilled and push it to both phones. Someone's therapy
-- appointment appearing in their partner's calendar because a migration was
-- re-run is not a mistake worth leaving available.
--
-- A null can only mean "this row predates the column", so the backfill below
-- is idempotent by construction: after the first run there are no nulls left.
alter table planned_events add column if not exists push_to uuid[];

-- Everything created before this column existed was a "Book it on both
-- phones" plan, and both phones already have it. Saying so keeps push_to
-- consistent with the link rows that already exist -- otherwise the next sync
-- would read an empty push_to and strip those events off both calendars.
update planned_events pe
set push_to = coalesce(
  (select array_agg(p.id) from profiles p where p.couple_id = pe.couple_id),
  '{}'
)
where push_to is null;

alter table planned_events alter column push_to set default '{}';
alter table planned_events alter column push_to set not null;

create index if not exists planned_events_owner on planned_events (couple_id, owner_user_id);

-- Each partner's colour, from the palette in mobile/lib/palette.ts. Null means
-- they haven't picked, and the app falls back to a stable default derived from
-- their id rather than leaving two people the same colour.
alter table profiles add column if not exists color text;

alter table profiles drop constraint if exists profiles_color_check;
alter table profiles
  add constraint profiles_color_check
  check (color is null or color = lower(color));

-- The palette itself is not enumerated here on purpose. A check constraint
-- listing 24 names would mean a database migration to add a colour, and the
-- worst case of an unrecognised value is the app falling back to its default
-- -- which resolveColor already does for null.

-- owner_user_id and push_to must name people in the couple.
--
-- A check constraint can't ask another table, so this is a trigger. Neither
-- column is a leak on its own -- a stranger named in push_to still can't read
-- planned_events, so nothing reaches their phone -- but an owner who isn't in
-- the couple renders as the partner's name in the partner's colour, which is
-- worse than an error.
create or replace function planned_events_members_only()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  stranger uuid;
begin
  if new.owner_user_id is not null
     and not exists (
       select 1 from profiles p
       where p.id = new.owner_user_id and p.couple_id = new.couple_id
     )
  then
    raise exception 'An event can only belong to someone in the couple.';
  end if;

  select id into stranger
  from unnest(new.push_to) as id
  where not exists (
    select 1 from profiles p where p.id = id and p.couple_id = new.couple_id
  )
  limit 1;

  if stranger is not null then
    raise exception 'An event can only be pushed to a phone in the couple.';
  end if;

  return new;
end;
$$;

drop trigger if exists planned_events_members_only_trigger on planned_events;
create trigger planned_events_members_only_trigger
  before insert or update on planned_events
  for each row execute function planned_events_members_only();

notify pgrst, 'reload schema';
