import { sgn, toDisplay } from '../../lib/format'
import type { Unit } from '../../store/types'
import type { SignColor } from '../../lib/math'

const SIGN_COLOR: Record<SignColor, string> = {
  lime: 'var(--sign-good)', // +/- deltas stay green/red, independent of the accent hue
  red: 'var(--sign-bad)',
  grey: 'var(--text-muted)',
}

interface StatCardsProps {
  a14: string
  /** Last completed ISO week's average, formatted — '—' when there's no completed week yet. */
  lastWeek: string
  /** Signed delta vs the week before that, formatted — omitted (no note line) when there's
   * nothing to compare against. */
  lastWeekDelta?: string
  lastWeekDeltaColor?: SignColor
  rateLbs: number
  rateColor: SignColor
  unit: Unit
}

function StatCard({ label, value, color, note, noteColor }: { label: string; value: string; color?: string; note?: string; noteColor?: string }) {
  return (
    <div style={{ flex: 1, padding: '12px 12px 13px', borderRadius: 14, background: 'var(--surface)' }}>
      <div
        style={{
          font: '600 9px/1 "Barlow Condensed", sans-serif',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--text-dim)',
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 7, font: '700 25px/1 "Barlow Condensed", sans-serif', color: color ?? 'var(--text-secondary)' }}>
        {value}
      </div>
      {note && (
        <div style={{ marginTop: 3, font: '500 9px "IBM Plex Mono", monospace', color: noteColor ?? 'var(--text-dim)' }}>
          {note}
        </div>
      )}
    </div>
  )
}

export function StatCards({ a14, lastWeek, lastWeekDelta, lastWeekDeltaColor, rateLbs, rateColor, unit }: StatCardsProps) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <StatCard label="14 day" value={a14} />
      <StatCard
        label="Last week"
        value={lastWeek}
        note={lastWeekDelta}
        noteColor={lastWeekDeltaColor ? SIGN_COLOR[lastWeekDeltaColor] : undefined}
      />
      <StatCard label="Rate/wk" value={sgn(toDisplay(rateLbs, unit))} color={SIGN_COLOR[rateColor]} />
    </div>
  )
}
