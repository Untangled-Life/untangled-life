create table if not exists busy_blocks (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists busy_blocks_couple_window on busy_blocks (couple_id, start_at);

alter table busy_blocks enable row level security;

create policy "Couple can view busy blocks" on busy_blocks
  for select to authenticated using (couple_id = my_couple_id());

create policy "User can add own busy blocks" on busy_blocks
  for insert to authenticated
  with check (couple_id = my_couple_id() and user_id = auth.uid());

create policy "User can update own busy blocks" on busy_blocks
  for update to authenticated
  using (couple_id = my_couple_id() and user_id = auth.uid())
  with check (couple_id = my_couple_id() and user_id = auth.uid());

create policy "User can delete own busy blocks" on busy_blocks
  for delete to authenticated
  using (couple_id = my_couple_id() and user_id = auth.uid());
