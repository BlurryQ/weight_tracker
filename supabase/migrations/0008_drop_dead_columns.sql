-- settings.trend_horizon: dead since the Trends "if this continues" card it drove was replaced
-- by the Reach card (round 3 of the Neon redesign) — no code reads or writes it anymore.
alter table settings
  drop column if exists trend_horizon;

-- daily_nutrition.source: never read or written by the app — always defaulted to
-- 'health_connect', and the CSV-import path that would have set 'import'/'manual' was removed
-- before this ever shipped.
alter table daily_nutrition
  drop column if exists source;
