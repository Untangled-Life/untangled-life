-- Two-factor, enforced where it counts.
--
-- Supabase Auth does the enrolment, the QR code and the six-digit check. What
-- it does not do on its own is stop a session that has NOT passed the second
-- step from reading anything. A signed-in session is "aal1" until the code
-- is entered, then "aal2", and nothing refuses aal1 unless a policy does.
--
-- Rather than touch every policy in the schema, this teaches the one
-- function nearly all of them go through. my_couple_id() answers null for a
-- session that has a verified factor but has not used it, and every
-- couple-scoped policy fails closed on null. Somebody who has not turned
-- two-factor on is unaffected: the second branch is true for them.
--
-- Your own profile row is deliberately still readable at aal1, because the
-- app has to load it to know who you are before it can ask for the code.
--
-- Safe to run more than once. Run AFTER couples.sql; nothing else redefines
-- this function.

create or replace function my_couple_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.couple_id
  from profiles p
  where p.id = auth.uid()
    and (
      coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1
        from auth.mfa_factors f
        where f.user_id = auth.uid()
          and f.status = 'verified'
      )
    );
$$;

revoke all on function my_couple_id() from public;
grant execute on function my_couple_id() to authenticated;

notify pgrst, 'reload schema';
