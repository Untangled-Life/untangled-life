-- Proposing a date, instead of just booking one.
--
-- Booking is unilateral by design and stays that way: sometimes you have the
-- babysitter and you just want it in the diary. But the commonest failure in
-- a couple's calendar is not disagreement, it is nobody going first. A
-- proposal is going first without committing the other person to a time they
-- have not seen.
--
-- One row per proposal, with the options as a jsonb array rather than their
-- own table. They are only ever read and written together, they never exist
-- without their proposal, and nothing joins to them.
--
-- Safe to run more than once.

create table if not exists date_proposals (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  proposed_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  note text,
  -- [{ "start_at": "...", "end_at": "..." }]. Two or three, normally.
  options jsonb not null default '[]'::jsonb,
  -- Which option was taken, as an index into options. Null while it is open.
  chosen_index integer,
  -- The event it became, so the proposal and the plan are not two versions of
  -- the truth. Null while open or declined.
  planned_event_id uuid references planned_events(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create index if not exists date_proposals_couple on date_proposals (couple_id, status);

alter table date_proposals enable row level security;

-- Both partners can see and answer; only the proposer can withdraw. The
-- policies are deliberately symmetric on select so a proposal is never
-- visible to one of you and not the other.
drop policy if exists "Couple reads proposals" on date_proposals;
create policy "Couple reads proposals" on date_proposals
  for select using (couple_id = my_couple_id());

drop policy if exists "Couple creates proposals" on date_proposals;
create policy "Couple creates proposals" on date_proposals
  for insert with check (couple_id = my_couple_id() and proposed_by = auth.uid());

-- Either partner may update: the other one accepts or declines, the proposer
-- withdraws. Which of those they are ALLOWED to do is a question about the
-- status they are writing, and Postgres cannot see the old row's proposer in
-- a with-check, so it is enforced in answer_date_proposal() below rather than
-- here. This policy only says "it has to be your couple's".
drop policy if exists "Couple answers proposals" on date_proposals;
create policy "Couple answers proposals" on date_proposals
  for update using (couple_id = my_couple_id())
  with check (couple_id = my_couple_id());

drop policy if exists "Proposer deletes proposals" on date_proposals;
create policy "Proposer deletes proposals" on date_proposals
  for delete using (couple_id = my_couple_id() and proposed_by = auth.uid());

/*
 * Accepting a proposal, as one transaction.
 *
 * Three things have to happen together or not at all: the event is created,
 * the proposal is marked accepted, and the two are linked. Doing it from the
 * client in three calls means a dropped connection can leave a proposal that
 * says "accepted" pointing at nothing, or an event nobody proposed.
 *
 * It also enforces the one rule the RLS policy cannot: you may not accept
 * your own proposal. Accepting is the other person agreeing, and a proposer
 * who wants it in the diary regardless should book it, which is a button that
 * already exists.
 */
create or replace function answer_date_proposal(
  proposal uuid,
  option_index integer,
  decision text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  row date_proposals;
  chosen jsonb;
  new_event uuid;
begin
  if decision not in ('accepted', 'declined') then
    raise exception 'decision must be accepted or declined';
  end if;

  select * into row from date_proposals
    where id = proposal and couple_id = my_couple_id()
    for update;

  if not found then
    raise exception 'no such proposal';
  end if;

  if row.status <> 'open' then
    raise exception 'that proposal has already been answered';
  end if;

  if row.proposed_by = auth.uid() then
    raise exception 'you cannot answer your own proposal';
  end if;

  if decision = 'declined' then
    update date_proposals
      set status = 'declined', answered_at = now()
      where id = proposal;
    return null;
  end if;

  chosen := row.options -> option_index;
  if chosen is null then
    raise exception 'that option does not exist';
  end if;

  -- created_by is the PROPOSER, not whoever accepted. They are the one who
  -- thought of it, and the notification about any later change has to go to
  -- the other person.
  insert into planned_events (couple_id, title, start_at, end_at, notes, created_by, push_to)
  values (
    row.couple_id,
    row.title,
    (chosen ->> 'start_at')::timestamptz,
    (chosen ->> 'end_at')::timestamptz,
    row.note,
    row.proposed_by,
    -- Both phones. A date two people agreed on belongs in both diaries.
    array(select p.id from profiles p where p.couple_id = row.couple_id)
  )
  returning id into new_event;

  update date_proposals
    set status = 'accepted',
        chosen_index = option_index,
        planned_event_id = new_event,
        answered_at = now()
    where id = proposal;

  return new_event;
end;
$$;

revoke all on function answer_date_proposal(uuid, integer, text) from public, anon;
grant execute on function answer_date_proposal(uuid, integer, text) to authenticated;

notify pgrst, 'reload schema';
