-- One-time reconstruction of the user's real phase history (bulk/cut/deload/maintain),
-- from user-supplied deload dates cross-checked against the week-counter resets already
-- present in the CSV week labels. Safe to re-run: upserts by (user_id, start).
--
-- 2026-06-01 (Maintain) was not in the user's original deload list, but was inferred: the cut
-- starting 2026-04-20 ran 14 weeks before its first labeled deload (2026-07-27), exceeding the
-- ~12-week cadence rule, and week 6 of that span (2026-06-01) lines up exactly one week before
-- the CSV's own "Week 1" counter reset at 2026-06-08 — strong evidence a maintenance week
-- landed there. 2026-04-20 covers both "deload" and "start cut" in the user's account of
-- events; only 'Cut' is logged for that week since a week can carry one phase label.

insert into phase_log (user_id, start, name) values
  ('73d19a65-767c-4547-b510-19b8700c8fb8', '2025-10-06', 'Bulk'),
  ('73d19a65-767c-4547-b510-19b8700c8fb8', '2025-10-13', 'Deload'),
  ('73d19a65-767c-4547-b510-19b8700c8fb8', '2025-12-29', 'Deload'),
  ('73d19a65-767c-4547-b510-19b8700c8fb8', '2026-02-16', 'Deload'),
  ('73d19a65-767c-4547-b510-19b8700c8fb8', '2026-03-02', 'Deload'),
  ('73d19a65-767c-4547-b510-19b8700c8fb8', '2026-04-20', 'Cut'),
  ('73d19a65-767c-4547-b510-19b8700c8fb8', '2026-06-01', 'Maintain'),
  ('73d19a65-767c-4547-b510-19b8700c8fb8', '2026-07-27', 'Deload')
on conflict (user_id, start) do update set name = excluded.name, updated_at = now();

-- Current phase/settings row. phase_start = 2026-08-03 matches the CSV's most recent "Week 1"
-- counter reset (the app shows "Week 4" today, 2026-08-25, which checks out: floor(22/7)+1 = 4).
-- Every other column is left to its schema default (weekly_target -1.0 lbs/wk, target_lbs 175,
-- etc.) — placeholders only, adjust for real in the Setup screen once you're signed in.
insert into settings (user_id, phase, phase_start) values
  ('73d19a65-767c-4547-b510-19b8700c8fb8', 'Cut', '2026-08-03')
on conflict (user_id) do update set phase = excluded.phase, phase_start = excluded.phase_start, updated_at = now();
