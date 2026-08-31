-- Daily calories-consumed totals, one row per day, sourced from Health Connect (which
-- MyFitnessPal writes into). Health Connect only retains ~30 days locally, so the app copies
-- each day's total in here as it reads it — this table is the durable history.
--
-- Same shape and RLS model as `entries`: one row per (user_id, date), scoped to auth.uid().

create table if not exists daily_nutrition (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  kcal integer not null check (kcal >= 0 and kcal < 20000),
  -- where the number came from, for debugging a bad import or a double-count later.
  source text not null default 'health_connect' check (source in ('health_connect', 'import', 'manual')),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table daily_nutrition enable row level security;
create policy "own rows" on daily_nutrition for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger daily_nutrition_set_updated_at before update on daily_nutrition
  for each row execute function set_updated_at();
