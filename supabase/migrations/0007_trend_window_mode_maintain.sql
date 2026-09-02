-- Adds "lastMaintain" as a third phase-anchor mode for Trends' window, alongside the existing
-- "phaseStart"/"lastDeload" (see phaseAnchoredShowN in src/lib/math.ts). Widens 0006's CHECK
-- constraint rather than replacing the column.

alter table settings
  drop constraint if exists settings_trend_window_mode_check;

alter table settings
  add constraint settings_trend_window_mode_check
    check (trend_window_mode in ('weeks', 'phaseStart', 'lastDeload', 'lastMaintain'));
