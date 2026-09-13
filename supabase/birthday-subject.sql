-- Fix: a birthday belongs to a person, not to a couple.
--
-- key_dates held ONE birthday row per couple, and the app labelled it with
-- whoever the viewer's partner happened to be. So the row Roy entered as
-- "Alyssa's Birthday" rendered as "Roy's Birthday" on Alyssa's phone -- same
-- row, same date, wrong name, depending who was looking.
--
-- Birthdays now record whose they are, so both partners see the same label,
-- and a couple can hold two of them (one each). Run after key-dates-kind.sql.

alter table key_dates
  add column if not exists subject_user_id uuid references auth.users(id) on delete cascade;

-- Existing birthday rows were entered by one partner for the other (the field
-- was labelled "<Partner>'s Birthday"), so the subject is whoever didn't
-- create the row.
update key_dates kd
set subject_user_id = (
  select p.id
  from profiles p
  where p.couple_id = kd.couple_id
    and p.id <> kd.created_by
  limit 1
)
where kd.kind = 'birthday'
  and kd.subject_user_id is null;

-- The old index allowed only one birthday per couple. Anniversary stays
-- one-per-couple; birthdays become one per person.
drop index if exists key_dates_singleton_kind;

create unique index if not exists key_dates_one_anniversary_per_couple
  on key_dates (couple_id)
  where kind = 'anniversary';

create unique index if not exists key_dates_one_birthday_per_person
  on key_dates (couple_id, subject_user_id)
  where kind = 'birthday';
