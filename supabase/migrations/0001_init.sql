-- Weight Tracker schema: one row per day (entries), one row per phase change (phase_log),
-- and a single settings row per user. All three are RLS-scoped to auth.uid() since this is a
-- real multi-device app for one user, not a shared table.

create table if not exists entries (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  lbs numeric(5,1) not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table entries enable row level security;
create policy "own rows" on entries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists phase_log (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- always the ISO Monday of the phase change; the client dedupes by ISO week before writing.
  start date not null,
  name text not null check (name in ('Cut', 'Bulk', 'Maintain', 'Deload')),
  updated_at timestamptz not null default now(),
  primary key (user_id, start)
);
alter table phase_log enable row level security;
create policy "own rows" on phase_log for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  phase text not null default 'Cut' check (phase in ('Cut', 'Bulk', 'Maintain', 'Deload')),
  phase_start date not null,
  weekly_target numeric not null default -1.0,
  unit text not null default 'lb' check (unit in ('lb', 'kg')),
  trend_window smallint not null default 26 check (trend_window in (8, 13, 26, 99)),
  trend_horizon smallint not null default 6 check (trend_horizon in (4, 6, 12)),
  solve_mode text not null default 'weight' check (solve_mode in ('weight', 'date')),
  target_lbs numeric not null default 175,
  target_weeks smallint not null default 6 check (target_weeks between 1 and 52),
  updated_at timestamptz not null default now()
);
alter table settings enable row level security;
create policy "own row" on settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Keep updated_at current on every write.
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger entries_set_updated_at before update on entries
  for each row execute function set_updated_at();
create trigger phase_log_set_updated_at before update on phase_log
  for each row execute function set_updated_at();
create trigger settings_set_updated_at before update on settings
  for each row execute function set_updated_at();
