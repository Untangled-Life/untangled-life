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

alter table planned_events
  add column if not exists push_to uuid[] not null default '{}';

-- Everything created before this column existed was a "Book it on both
-- phones" plan, and both phones already have it. Saying so keeps the links
-- that exist consistent with what push_to claims -- otherwise the next sync
-- would read an empty push_to and strip those events off both calendars.
update planned_events pe
set push_to = coalesce(
  (select array_agg(p.id) from profiles p where p.couple_id = pe.couple_id),
  '{}'
)
where push_to = '{}';

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

notify pgrst, 'reload schema';
