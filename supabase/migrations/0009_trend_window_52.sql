-- Trends gained a 1Y chip (trend_window = 52), but settings.trend_window was still restricted to
-- (8, 13, 26, 99). Every settings upsert was rejected, which stalled the client's write queue.
-- Idempotent: safe to re-run, and safe if the constraint was already widened by hand.
alter table settings
  drop constraint if exists settings_trend_window_check;

alter table settings
  add constraint settings_trend_window_check
    check (trend_window in (8, 13, 26, 52, 99));
