-- What makes each of you feel valued.
--
-- The point of this is that your partner reads it. That is not a side effect
-- to be managed, it is the entire feature, and it is why the app has to say so
-- before a single question is answered rather than after.
--
-- One row per person, readable by both partners, writable only by its owner.
-- Deliberately NOT a score, a percentage, or a compatibility rating. A number
-- invites a couple to feel bad about a number, and there is no version of
-- "your relationship is 74%" that helps anybody.
--
-- Safe to run more than once.

create table if not exists valued_answers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  couple_id uuid not null references couples(id) on delete cascade,

  -- The five ways people commonly name. Stored as an ORDER, most to least,
  -- rather than one winner: everybody wants all five sometimes, and picking
  -- one flattens the thing you were trying to say.
  ranking text[] not null default '{}',

  -- The part that actually gets read. Their own words beat any framework.
  feels_valued text,
  little_things text,
  hard_week text,

  shared boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table valued_answers enable row level security;

-- Readable by your partner only once you have said so. An answer half-written
-- on a Tuesday is not something the other person should be reading on the
-- Wednesday, and the switch is what makes the promise on the first screen
-- true rather than merely stated.
drop policy if exists "Read own or a shared partner answer" on valued_answers;
create policy "Read own or a shared partner answer" on valued_answers
  for select using (
    user_id = auth.uid()
    or (couple_id = my_couple_id() and shared = true)
  );

drop policy if exists "Write own answers" on valued_answers;
create policy "Write own answers" on valued_answers
  for insert with check (user_id = auth.uid() and couple_id = my_couple_id());

drop policy if exists "Update own answers" on valued_answers;
create policy "Update own answers" on valued_answers
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and couple_id = my_couple_id());

drop policy if exists "Delete own answers" on valued_answers;
create policy "Delete own answers" on valued_answers
  for delete using (user_id = auth.uid());

-- Deleting your account takes these with it, like everything else personal.
-- purge_personal_data() in leaving.sql handles tables that existed when it was
-- written; this one did not, so it is covered by the cascade on user_id above.

notify pgrst, 'reload schema';
