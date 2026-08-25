import type { PaceStatus } from '../../lib/math'

const CIRCUMFERENCE = 188.5 // 2 * PI * r, r=30

export function PaceRing({ status }: { status: PaceStatus }) {
  const fraction = Math.min(1, status.pct / 100)
  const dash = `${(fraction * CIRCUMFERENCE).toFixed(1)} 400`
  const color = status.onPace ? 'var(--lime)' : 'var(--amber)'

  return (
    <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
      <svg width={72} height={72}>
        <circle cx={36} cy={36} r={30} fill="none" stroke="var(--raised)" strokeWidth={7} />
        <circle
          cx={36}
          cy={36}
          r={30}
          fill="none"
          stroke={color}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={dash}
          transform="rotate(-90 36 36)"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <span style={{ font: '700 17px/1 "Barlow Condensed", sans-serif', color: 'var(--text-primary)' }}>
          {status.pct}%
        </span>
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
