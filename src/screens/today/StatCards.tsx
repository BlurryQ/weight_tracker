import { sgn, toDisplay } from '../../lib/format'
import type { Unit } from '../../store/types'
import type { SignColor } from '../../lib/math'

const SIGN_COLOR: Record<SignColor, string> = {
  lime: 'var(--lime)',
  red: 'var(--red)',
  grey: 'var(--text-muted)',
}

interface StatCardsProps {
  a14: string
  a30: string
  rateLbs: number
  rateColor: SignColor
  unit: Unit
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
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
    </div>
  )
}

export function StatCards({ a14, a30, rateLbs, rateColor, unit }: StatCardsProps) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <StatCard label="14 day" value={a14} />
      <StatCard label="30 day" value={a30} />
      <StatCard label="Rate/wk" value={sgn(toDisplay(rateLbs, unit))} color={SIGN_COLOR[rateColor]} />
    </div>
  )
}
