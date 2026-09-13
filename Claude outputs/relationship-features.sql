-- To-dos, wishlists, and key-date countdowns: the "more than a calendar"
-- features (Me/Partner/Us to-dos, wishlists, anniversary countdowns) that
-- couples-app competitors like Cupla build on top of calendar sync.
-- Run this in the Supabase SQL editor after couples.sql.

create table if not exists key_dates (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  title text not null,
  date date not null,
  recurring boolean not null default true, -- true = repeats every year (birthdays, anniversaries)
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  title text not null,
  assigned_to uuid references auth.users(id) on delete set null, -- null = shared ("Us")
  due_date date, -- null = "Someday"
  completed boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists wishlists (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists wishlist_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  wishlist_id uuid not null references wishlists(id) on delete cascade,
  title text not null,
  url text,
  notes text,
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table key_dates enable row level security;
alter table todos enable row level security;
alter table wishlists enable row level security;
alter table wishlist_items enable row level security;

-- Same shape on all four: both partners get full CRUD, scoped to their own
-- couple via my_couple_id() (defined in couples.sql), never someone else's.

create policy "Couple can view key dates" on key_dates
  for select to authenticated using (couple_id = my_couple_id());
create policy "Couple can add key dates" on key_dates
  for insert to authenticated with check (couple_id = my_couple_id() and created_by = auth.uid());
create policy "Couple can update key dates" on key_dates
  for update to authenticated using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
create policy "Couple can delete key dates" on key_dates
  for delete to authenticated using (couple_id = my_couple_id());

create policy "Couple can view todos" on todos
  for select to authenticated using (couple_id = my_couple_id());
create policy "Couple can add todos" on todos
  for insert to authenticated with check (couple_id = my_couple_id() and created_by = auth.uid());
create policy "Couple can update todos" on todos
  for update to authenticated using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
create policy "Couple can delete todos" on todos
  for delete to authenticated using (couple_id = my_couple_id());

create policy "Couple can view wishlists" on wishlists
  for select to authenticated using (couple_id = my_couple_id());
create policy "Couple can add wishlists" on wishlists
  for insert to authenticated with check (couple_id = my_couple_id() and created_by = auth.uid());
create policy "Couple can update wishlists" on wishlists
  for update to authenticated using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
create policy "Couple can delete wishlists" on wishlists
  for delete to authenticated using (couple_id = my_couple_id());

create policy "Couple can view wishlist items" on wishlist_items
  for select to authenticated using (couple_id = my_couple_id());
create policy "Couple can add wishlist items" on wishlist_items
  for insert to authenticated with check (couple_id = my_couple_id() and added_by = auth.uid());
create policy "Couple can update wishlist items" on wishlist_items
  for update to authenticated using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
create policy "Couple can delete wishlist items" on wishlist_items
  for delete to authenticated using (couple_id = my_couple_id());
