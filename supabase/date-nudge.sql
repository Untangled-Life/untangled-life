-- NOTE: couples_due_a_nudge() is redefined again in supabase/date-flag.sql, which adds the
-- is_date column and teaches it about it. date-flag.sql must run AFTER this
-- file, and re-running this one on its own will quietly put the older,
-- unfiltered version back.

-- The "it's been a while" nudge.
--
-- Two conditions, and both have to hold: nothing BOOKED in the next fortnight
-- and nothing PLANNED in the last one. Either on its own gets it wrong. A
-- couple with a holiday booked for March has an empty next two weeks and does
-- not need telling; a couple who booked six things on Sunday have a quiet
-- fortnight behind them by definition.
--
-- Mirrors mobile/lib/dateNudge.ts, which decides the wording of the card on
-- Home. The card and the push have to agree or the app contradicts itself.
--
-- Safe to run more than once.

alter table couples add column if not exists date_nudged_at timestamptz;

-- Which couples are due a nudge right now.
--
-- SECURITY DEFINER and callable only by the service role: it reads across every
-- couple, which no signed-in user may do. The Edge Function is the only caller.
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
        and e.created_at >= now() - interval '14 days'
    )

    -- Nothing coming up in the next fortnight. A repeat that is still running
    -- counts as coming up whatever its first occurrence was -- a weekly date
    -- night is the opposite of drifting.
    and not exists (
      select 1 from planned_events e
      where e.couple_id = c.id
        and e.cancelled = false
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

-- Stamp a couple as nudged. Same reasoning: service role only.
create or replace function mark_couple_nudged(target uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update couples set date_nudged_at = now() where id = target;
$$;

revoke all on function mark_couple_nudged(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
