-- How was it?
--
-- The only thing in this category nobody else has: a date that has happened
-- is not finished. Asked once, quietly, and never asked again.
--
-- Ratings are PER PERSON rather than per couple. "We both loved the coast
-- walk" and "one of us loved it" are different facts, and averaging them into
-- a single number for the couple loses the only interesting one.
--
-- Safe to run more than once.

create table if not exists date_reviews (
  planned_event_id uuid not null references planned_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  couple_id uuid not null references couples(id) on delete cascade,

  -- Three answers, not five stars. A five-point scale on an evening with your
  -- partner invites a precision nobody has, and "it was fine" is a real answer
  -- that a 3/5 makes look like a complaint.
  verdict text not null check (verdict in ('loved', 'good', 'not_again')),
  note text,

  created_at timestamptz not null default now(),
  primary key (planned_event_id, user_id)
);

create index if not exists date_reviews_couple on date_reviews (couple_id, verdict);

alter table date_reviews enable row level security;

-- Both partners see both answers. The point of asking is that you find out
-- they did not enjoy the thing you thought they enjoyed, and hiding that would
-- make the feature pointless.
drop policy if exists "Couple reads reviews" on date_reviews;
create policy "Couple reads reviews" on date_reviews
  for select using (couple_id = my_couple_id());

drop policy if exists "Write own review" on date_reviews;
create policy "Write own review" on date_reviews
  for insert with check (user_id = auth.uid() and couple_id = my_couple_id());

drop policy if exists "Update own review" on date_reviews;
create policy "Update own review" on date_reviews
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Delete own review" on date_reviews;
create policy "Delete own review" on date_reviews
  for delete using (user_id = auth.uid());

/*
 * Dates that have finished and not been asked about.
 *
 * Only the last month: an app that asks how a date in March went, in
 * September, was not paying attention at the time. Only one is ever shown at
 * once, which the app does rather than the query.
 */
create or replace function dates_awaiting_review()
returns table (
  planned_event_id uuid,
  title text,
  start_at timestamptz,
  end_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.title, e.start_at, e.end_at
  from planned_events e
  where e.couple_id = my_couple_id()
    and e.cancelled = false
    and e.end_at < now()
    and e.end_at > now() - interval '30 days'
    -- A repeat has no single "it happened", so it is not asked about. Rating
    -- occurrence forty-one of a weekly dinner is admin, not a memory.
    and e.repeat_every = 'none'
    and not exists (
      select 1 from date_reviews r
      where r.planned_event_id = e.id and r.user_id = auth.uid()
    )
  order by e.end_at desc;
$$;

revoke all on function dates_awaiting_review() from public, anon;
grant execute on function dates_awaiting_review() to authenticated;

/*
 * The ones worth doing again.
 *
 * Both of you saying "loved" is the signal. One of you loving it is a
 * different and much less useful fact, so it is not offered as a suggestion.
 */
create or replace function dates_you_both_loved()
returns table (planned_event_id uuid, title text, last_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.title, e.end_at
  from planned_events e
  join date_reviews r on r.planned_event_id = e.id
  where e.couple_id = my_couple_id()
  group by e.id, e.title, e.end_at
  having count(*) filter (where r.verdict = 'loved') >= 2
  order by e.end_at desc
  limit 10;
$$;

revoke all on function dates_you_both_loved() from public, anon;
grant execute on function dates_you_both_loved() to authenticated;

notify pgrst, 'reload schema';
