-- Which of these is a date?
--
-- "Booked in" listed every planned event, so a dentist appointment and an
-- anniversary dinner sat in the same list under the same heading. They are not
-- the same thing: one is admin and one is the reason the app exists.
--
-- So an event now says whether it is a date, and Home shows only those. It is
-- a choice rather than a guess -- guessing from the title would be wrong often
-- enough to be annoying, and wrong in the direction that matters: quietly
-- filing your anniversary under errands.
--
-- Run AFTER planned-events.sql and date-history.sql.
-- Safe to run more than once.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'planned_events'
      and column_name = 'is_date'
  ) then
    alter table planned_events add column is_date boolean not null default false;

    -- Everything that already existed was being shown under "Booked in", so
    -- it was a date as far as anyone using the app was concerned. Taking that
    -- away on upgrade would empty the section without explanation.
    --
    -- Inside the guard deliberately: this runs once, when the column is
    -- created. Outside it, re-running the file would switch every event a
    -- couple had since turned OFF back on again.
    update planned_events set is_date = true;
  end if;
end $$;

-- Three things ask "which of this couple's events are dates": the review
-- prompt, both halves of the nudge rule, and the client's "when did we last
-- plan anything". Partial on cancelled = false because none of them ever
-- wants a cancelled row.
create index if not exists planned_events_couple_date
  on planned_events (couple_id, is_date)
  where cancelled = false;

/*
 * A date two people agreed on is a date.
 *
 * Copied from date-proposals.sql with one column added, rather than patched:
 * Postgres has no way to append to a function body, and two halves of one
 * function living in two files is how they drift.
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
  insert into planned_events (couple_id, title, start_at, end_at, notes, created_by, push_to, is_date)
  values (
    row.couple_id,
    row.title,
    (chosen ->> 'start_at')::timestamptz,
    (chosen ->> 'end_at')::timestamptz,
    row.note,
    row.proposed_by,
    -- Both phones. A date two people agreed on belongs in both diaries.
    array(select p.id from profiles p where p.couple_id = row.couple_id),
    -- Whatever the toggle said when it was suggested, two people agreeing
    -- on a time makes it a date.
    true
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

/*
 * And only a date gets asked how it went.
 *
 * "How was the dentist?" is the question that makes someone turn a feature
 * off. The rest of the rules are unchanged from date-history.sql.
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
    and e.is_date
    and e.cancelled = false
    and e.end_at < now()
    and e.end_at > now() - interval '30 days'
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
 * And the fortnightly nudge counts dates only.
 *
 * It asks whether you have drifted. Booking the car in for a service is not
 * evidence that you have not, so counting it would silence the one message
 * this feature exists to send. Copied from date-nudge.sql with that one
 * condition added to each half of the rule.
 */
create or replace function couples_due_a_nudge()
returns table (couple_id uuid, member_ids uuid[])
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    array_agg(p.id)
  from couples c
  join profiles p on p.couple_id = c.id
  where
    -- Not nudged recently. Also covers never nudged.
    (c.date_nudged_at is null or c.date_nudged_at < now() - interval '14 days')

    -- Nothing planned in the last fortnight.
    and not exists (
      select 1 from planned_events e
      where e.couple_id = c.id
        and e.cancelled = false
        and e.is_date
        and e.created_at >= now() - interval '14 days'
    )

    -- Nothing coming up in the next fortnight. A repeat that is still running
    -- counts as coming up whatever its first occurrence was -- a weekly date
    -- night is the opposite of drifting.
    and not exists (
      select 1 from planned_events e
      where e.couple_id = c.id
        and e.cancelled = false
        and e.is_date
        and (
          (e.repeat_every = 'none' and e.end_at >= now() and e.start_at <= now() + interval '14 days')
          or (
            e.repeat_every <> 'none'
            and (e.repeat_until is null or e.repeat_until >= current_date)
          )
        )
    )
  group by c.id;
$$;

revoke all on function couples_due_a_nudge() from public, anon, authenticated;

notify pgrst, 'reload schema';
