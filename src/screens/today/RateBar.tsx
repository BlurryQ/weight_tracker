import { paceLabel, paceStatus } from '../../lib/math'
import { sgn, toDisplay } from '../../lib/format'
import type { Unit } from '../../store/types'

// The fill/tick scale is 0-150% of target (matching paceStatus().pct's own clamp) rather than
// 0-100%, so the fill can visibly run past the target tick when running ahead of it, and stop
// short of the tick when behind — the tick itself always sits at the "exactly on target" mark.
const TRACK_MAX_PCT = 150
const TICK_PCT = (100 / TRACK_MAX_PCT) * 100

/** Replaces the old "% of pace" readout with a labelled rate bar: a track with a target tick,
 * the actual 4-week rate and the target printed underneath it, and a short status phrase above
 * (see paceLabel — same slope/target inputs paceStatus already used for the fill). */
export function RateBar({ slopeLbs, weeklyTarget, unit }: { slopeLbs: number; weeklyTarget: number; unit: Unit }) {
  const status = paceStatus(slopeLbs, weeklyTarget)
  const label = paceLabel(slopeLbs, weeklyTarget)
  const fillPct = (Math.max(0, Math.min(TRACK_MAX_PCT, status.pct)) / TRACK_MAX_PCT) * 100
  // State-driven, not string-matched: off pace gets the magenta "not going the way you want"
  // token (same idea as the Trends weekly-change bars' --wchange-against), on pace stays neutral.
  const labelColor = status.onPace ? 'var(--text-secondary)' : 'var(--pace-off)'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span
          style={{
            font: '600 9.5px/1 "Barlow Condensed", sans-serif',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--text-dim)',
          }}
        >
          Rate
        </span>
        <span style={{ font: '500 10px "IBM Plex Mono", monospace', color: labelColor }}>{label}</span>
      </div>

      <div style={{ marginTop: 8, position: 'relative', height: 8, borderRadius: 999, background: 'var(--raised)' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${fillPct}%`,
            borderRadius: 999,
            background: 'var(--accent)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${TICK_PCT}%`,
            top: -3,
            bottom: -3,
            width: 2,
            borderRadius: 1,
            background: 'var(--text-dim)',
          }}
        />
      </div>

      <div style={{ marginTop: 7, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ font: '600 12px "IBM Plex Mono", monospace', color: 'var(--text-primary)' }}>
          {sgn(toDisplay(slopeLbs, unit), 2)} /wk
        </span>
        <span style={{ font: '500 10px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
          target {sgn(toDisplay(weeklyTarget, unit), 1)}
        </span>
      </div>
    </div>
  )
}
