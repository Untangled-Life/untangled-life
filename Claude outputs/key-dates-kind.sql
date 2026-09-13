-- Adds a "kind" to key_dates so Anniversary and <Partner>'s Birthday are
-- singleton, auto-labeled rows per couple, while Misc stays freeform.
-- Run this AFTER relationship-features.sql (that file must have already
-- created the key_dates table).

alter table key_dates add column if not exists kind text not null default 'misc';

alter table key_dates drop constraint if exists key_dates_kind_check;
alter table key_dates add constraint key_dates_kind_check
  check (kind in ('anniversary', 'birthday', 'misc'));

-- At most one Anniversary row and one Birthday row per couple; Misc is
-- unrestricted (a couple can add as many one-off/misc dates as they like).
create unique index if not exists key_dates_singleton_kind
  on key_dates (couple_id, kind)
  where kind in ('anniversary', 'birthday');
