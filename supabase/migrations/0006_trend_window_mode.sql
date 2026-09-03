-- Trends' window can now be anchored to a phase-log event instead of a fixed week count.
-- Separate field rather than widening `trend_window`'s enum — 'phaseStart'/'lastDeload' scope
-- the chart dynamically (see phaseAnchoredShowN in src/lib/math.ts) and ignore trend_window
-- entirely while active, so folding them into the same column would conflate two different
-- kinds of value under one CHECK constraint.

alter table settings
  add column if not exists trend_window_mode text not null default 'weeks'
    check (trend_window_mode in ('weeks', 'phaseStart', 'lastDeload'));
