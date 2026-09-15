-- Wants to try.
--
-- An idea you liked the look of but not tonight. Saved for the couple, not
-- the person: the point of a save is that it turns up when EITHER of you
-- opens the planner on a free Saturday, and "I saved that one" is a small
-- thing to hear. The idea itself lives in the app, so only its id is stored.
--
-- Run AFTER solo-start.sql. Safe to run more than once.

create table if not exists date_idea_saves (
  couple_id uuid not null references couples(id) on delete cascade,
  idea_id text not null,
  saved_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (couple_id, idea_id)
);

alter table date_idea_saves enable row level security;

drop policy if exists "Couple reads saved ideas" on date_idea_saves;
create policy "Couple reads saved ideas" on date_idea_saves
  for select to authenticated using (couple_id = my_couple_id());

drop policy if exists "Couple saves ideas" on date_idea_saves;
create policy "Couple saves ideas" on date_idea_saves
  for insert to authenticated
  with check (couple_id = my_couple_id() and saved_by = auth.uid());

-- Either of you can take one off the list. A save is not a claim.
drop policy if exists "Couple unsaves ideas" on date_idea_saves;
create policy "Couple unsaves ideas" on date_idea_saves
  for delete to authenticated using (couple_id = my_couple_id());

grant select, insert, delete on date_idea_saves to authenticated;

notify pgrst, 'reload schema';
