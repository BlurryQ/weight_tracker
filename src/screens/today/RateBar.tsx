import type { PaceStatus } from '../../lib/math'

/** Replaces the old PaceRing — same data (`paceStatus()`, unchanged), a horizontal bar instead
 * of a ring. Fill is visually clamped at 100% (pct can run past that when ahead of pace); the
 * number alongside always shows the real, unclamped value. */
export function RateBar({ status }: { status: PaceStatus }) {
  const fillPct = Math.max(0, Math.min(100, status.pct))
  const color = status.onPace ? 'var(--accent)' : 'var(--amber)'

  return (
    <div style={{ width: 96, flexShrink: 0 }}>
      <div style={{ height: 7, borderRadius: 999, background: 'var(--raised)', overflow: 'hidden' }}>
        <div style={{ width: `${fillPct}%`, height: '100%', borderRadius: 999, background: color }} />
      </div>
      <div style={{ marginTop: 7, display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ font: '700 17px/1 "Barlow Condensed", sans-serif', color: 'var(--text-primary)' }}>{status.pct}%</span>
        <span
          style={{
            font: '600 7.5px/1 "Barlow Condensed", sans-serif',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--text-dim)',
          }}
        >
          of pace
        </span>
      </div>
    </div>
  )
}
