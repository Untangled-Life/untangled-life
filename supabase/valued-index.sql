-- One index, on the path the app actually queries.
--
-- valued_answers has only its primary key on user_id, but Home never looks a
-- row up by user id: it asks for the partner's, which is "everything in my
-- couple that is not mine". The RLS predicate is on couple_id too. So every
-- Home load was a sequential scan of the whole table.
--
-- Safe to run more than once.

create index if not exists valued_answers_couple on valued_answers (couple_id);
