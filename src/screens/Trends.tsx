import { buildChartGeometry } from '../lib/chartGeometry'
import { fullDate, today as todayIso } from '../lib/dates'
import { sgn, toDisplay, toLbs, unitLabel } from '../lib/format'
import { currentDir, fitSlope, foldedWeeks, phaseSpans, signColor, weeklyAverages, type SignColor } from '../lib/math'
import { useApp } from '../store/AppContext'
import type { TrendHorizon, TrendWindow } from '../store/types'
import { WeightChart } from '../components/chart/WeightChart'
import { SegmentedControl } from '../components/ui/SegmentedControl'

const SIGN_COLOR: Record<SignColor, string> = {
  lime: 'var(--lime)',
  red: 'var(--red)',
  grey: 'var(--text-muted)',
}

const WINDOW_OPTIONS: { value: TrendWindow; label: string }[] = [
  { value: 8, label: '8W' },
  { value: 13, label: '3M' },
  { value: 26, label: '6M' },
  { value: 99, label: 'ALL' },
]

const HORIZON_OPTIONS: { value: TrendHorizon; label: string }[] = [
  { value: 4, label: '4W' },
  { value: 6, label: '6W' },
  { value: 12, label: '12W' },
]

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

export function Trends() {
  const { state, dispatch } = useApp()
  const { entries, phase, phaseLog, unit, trendWindow, trendHorizon } = state
  const today = todayIso()

  const weekly = weeklyAverages(entries)
  const dir = currentDir(phase, phaseLog)
  const fitK = trendWindow === 99 ? weekly.length : Math.max(4, Math.round(trendWindow / 2))
  const fit = fitSlope(weekly, fitK)
  const spans = phaseSpans(phaseLog)

  const geometry = buildChartGeometry(
    weekly,
    spans,
    { W: 316, H: 184, gutter: 32, showN: trendWindow, fitK, fwd: trendHorizon, gridN: 5 },
    (lbs) => toDisplay(lbs, unit),
    foldedWeeks(phaseLog),
  )

  // geometry.last/first/slope/projVal are already in display units (the chart fits and
  // projects on converted points — the one deliberate exception to "convert only at the
  // display boundary"), so these must NOT be run through toDisplay again.
  const change = geometry.last - geometry.first
  const projectedDisplay = geometry.line ? geometry.projVal.toFixed(1) : '—'

  return (
    <div style={{ padding: '0 20px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span
          style={{
            font: '700 25px/1 "Barlow Condensed", sans-serif',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            color: 'var(--text-primary)',
          }}
        >
          Trends
        </span>
        <span style={{ font: '500 10.5px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
          {Math.min(trendWindow, weekly.length)} weeks shown
        </span>
      </div>

      <div style={{ marginTop: 28 }}>
        <WeightChart geometry={geometry} W={316} H={184} gutter={32} variant="trends" />
      </div>

      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            font: '600 9.5px/1 "Barlow Condensed", sans-serif',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--text-dim)',
          }}
        >
          Window
        </span>
        <SegmentedControl value={trendWindow} onChange={(window) => dispatch({ type: 'SET_TREND_WINDOW', window })} options={WINDOW_OPTIONS} />
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <StatCard label="Change" value={sgn(change)} color={SIGN_COLOR[signColor(toLbs(change, unit), dir)]} />
        <StatCard label="Fit slope" value={sgn(toDisplay(fit.slope, unit), 2) + '/wk'} color={SIGN_COLOR[signColor(fit.slope, dir)]} />
        <StatCard label="R²" value={fit.r2.toFixed(2)} />
      </div>

      <div style={{ marginTop: 12, padding: '14px 15px', borderRadius: 14, background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              font: '600 9.5px/1 "Barlow Condensed", sans-serif',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
            }}
          >
            If this continues
          </span>
          <SegmentedControl
            value={trendHorizon}
            onChange={(horizon) => dispatch({ type: 'SET_TREND_HORIZON', horizon })}
            options={HORIZON_OPTIONS}
          />
        </div>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ font: '700 36px/1 "Barlow Condensed", sans-serif', color: 'var(--text-primary)' }}>
            {projectedDisplay}
          </span>
          <span style={{ font: '500 11px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
            {unitLabel(unit)} by {fullDate(geometry.projDate || today)}
          </span>
        </div>
        <div style={{ marginTop: 6, font: '500 10px/1.5 "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
          Fit over the last {trendWindow === 99 ? 'whole log' : `${fitK} weeks`}, R² {fit.r2.toFixed(2)}. Target{' '}
          {sgn(toDisplay(state.weeklyTarget, unit), 2)} {unitLabel(unit)}/wk.
        </div>
      </div>
    </div>
  )
}
