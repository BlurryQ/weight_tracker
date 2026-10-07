import { useState } from 'react'
import { diffDays, mondayOf, today as todayIso, weekCommencingLabel } from '../../lib/dates'
import {
  ESTIMATE_WINDOW_DAYS,
  MAINTENANCE_HISTORY_STEP_DAYS,
  computeMaintenanceHistory,
  estimateMaintenance,
  type InsufficientReason,
  type NutritionEntry,
} from '../../lib/energy'
import { leastSquaresFit, type Entry, type PhaseLogEntry } from '../../lib/math'
import { useApp } from '../../store/AppContext'
import { WindowBreakdown } from './CurrentWindowModule'

/** Compact have/need tag for the series table's status cell — e.g. "8/14 CAL". The clamp detail
 * and full sentence live only in the row's title attribute (via `p.note`), not inline — a phase
 * clamp note is unbounded length and was the main cause of row wrap on a phone-width grid. */
function terseTag(r: InsufficientReason): string {
  const gate = r.check === 'calorie-days' ? 'CAL' : r.check === 'weigh-ins' ? 'WGT' : 'SPAN'
  return `${r.have}/${r.need} ${gate}`
}

// Lab module #8 — metabolic adaptation trend. No new formula: estimateMaintenance() called on a
// rolling basis (every `step` days, over a trailing `window`) and the {date, maintenance, kind}
// series collected — recomputed live, no new persistence. Step + window are the tunables that
// "need the most care on window choice", so both are adjustable here. Raw series only, no
// alerting: the drift you can see by eye is the point.

const MONO = '"IBM Plex Mono", monospace'
const COND = '"Barlow Condensed", sans-serif'

const STEP_MIN = 7
const STEP_MAX = 28
const WINDOW_MIN = 14
const WINDOW_MAX = 56

function label(text: string) {
  return (
    <div style={{ font: `600 9px/1 ${COND}`, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
      {text}
    </div>
  )
}

function Stepper({ name, value, suffix, onStep }: { name: string; value: string; suffix: string; onStep: (dir: 1 | -1) => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1 }}>
        {label(name)}
        <div style={{ marginTop: 5, font: `700 16px/1 ${COND}`, color: 'var(--accent)' }}>
          {value} <span style={{ font: `500 9px/1 ${MONO}`, color: 'var(--text-dim)' }}>{suffix}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {([-1, 1] as const).map((dir) => (
          <button
            key={dir}
            type="button"
            onClick={() => onStep(dir)}
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              cursor: 'pointer',
              border: '1px solid var(--divider)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              font: `700 15px/1 ${COND}`,
            }}
          >
            {dir === 1 ? '+' : '−'}
          </button>
        ))}
      </div>
    </div>
  )
}

type ChartPoint = { date: string; maintenance: number | null; kind: string; seriesFlag: 'outlier' | null }

/** Tiny inline line chart of the gated maintenance series. The trend line connects only the
 * non-outlier gated points; series outliers are drawn as amber rings, and non-gated windows
 * with a number (unreliable) as hollow grey markers — so both stay visible without bending the
 * line. */
function SeriesChart({ points, today }: { points: ChartPoint[]; today: string }) {
  const withVal = points.filter((p) => p.maintenance != null) as (ChartPoint & { maintenance: number })[]
  if (withVal.length < 2) return null

  const W = 280
  const H = 96
  const padX = 6
  const padY = 10
  const first = points[0].date
  const spanDays = Math.max(1, diffDays(first, today))
  const vals = withVal.map((p) => p.maintenance)
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const range = Math.max(1, hi - lo)

  const x = (d: string) => padX + (diffDays(first, d) / spanDays) * (W - 2 * padX)
  const y = (v: number) => padY + (1 - (v - lo) / range) * (H - 2 * padY)

  const trend = withVal.filter((p) => p.kind === 'ok' && p.seriesFlag === null)
  const linePts = trend.map((p) => `${x(p.date).toFixed(1)},${y(p.maintenance).toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ marginTop: 10, display: 'block', overflow: 'visible' }}>
      <line x1={padX} y1={y(hi)} x2={W - padX} y2={y(hi)} stroke="var(--divider)" strokeWidth={1} />
      <line x1={padX} y1={y(lo)} x2={W - padX} y2={y(lo)} stroke="var(--divider)" strokeWidth={1} />
      <text x={padX} y={y(hi) - 3} fill="var(--text-dim)" style={{ font: `500 8px ${MONO}` }}>{Math.round(hi)}</text>
      <text x={padX} y={y(lo) + 9} fill="var(--text-dim)" style={{ font: `500 8px ${MONO}` }}>{Math.round(lo)}</text>
      {trend.length >= 2 && <polyline points={linePts} fill="none" stroke="var(--accent)" strokeWidth={1.5} />}
      {withVal.map((p) => {
        const outlier = p.kind === 'ok' && p.seriesFlag === 'outlier'
        const gated = p.kind === 'ok' && p.seriesFlag === null
        return (
          <circle
            key={p.date}
            cx={x(p.date)}
            cy={y(p.maintenance)}
            r={outlier ? 3.2 : 2.6}
            fill={gated ? 'var(--accent)' : outlier ? 'transparent' : 'transparent'}
            stroke={outlier ? 'var(--amber)' : gated ? 'none' : 'var(--text-muted)'}
            strokeWidth={outlier ? 1.6 : 1}
          />
        )
      })}
    </svg>
  )
}

/** A tapped series row's own window, recomputed on demand (cheap — one more estimateMaintenance
 * call) and rendered through the same WindowBreakdown CurrentWindowModule uses for today's
 * window, just anchored to this row's own date instead. */
function ExpandedWindow({
  date,
  entries,
  nutrition,
  phaseLog,
}: {
  date: string
  entries: Entry[]
  nutrition: NutritionEntry[]
  phaseLog: PhaseLogEntry[]
}) {
  const est = estimateMaintenance(entries, nutrition, phaseLog, date)
  return <WindowBreakdown est={est} windowEnd={date} entries={entries} nutrition={nutrition} phaseLog={phaseLog} />
}

export function MaintenanceTrendModule() {
  const { state, dispatch } = useApp()
  const { entries, nutrition, phaseLog, openMaintenanceWindow } = state
  const today = todayIso()

  const [stepDays, setStepDays] = useState(MAINTENANCE_HISTORY_STEP_DAYS)
  const [windowDays, setWindowDays] = useState(ESTIMATE_WINDOW_DAYS)

  const history = computeMaintenanceHistory(entries, nutrition, phaseLog, today, stepDays, windowDays)
  const { points, gated, trend } = history
  const outlierCount = gated.length - trend.length

  // Adaptation slope + net drift, both over the *trend* set (gated, series outliers dropped) so
  // a first-estimate water-weight blip can't tilt the fit or land as an endpoint. kcal/day of
  // drift per 4 weeks — the same 28-day yardstick the window uses.
  let adaptPer28: number | null = null
  let netDrift: number | null = null
  if (trend.length >= 2) {
    const base = trend[0].date
    const fit = leastSquaresFit(trend.map((p) => ({ x: diffDays(base, p.date), y: p.maintenance as number })))
    adaptPer28 = fit.slope * 28
    netDrift = (trend[trend.length - 1].maintenance as number) - (trend[0].maintenance as number)
  }
  const latest = trend.length ? trend[trend.length - 1] : gated.length ? gated[gated.length - 1] : null

  const stepStep = (dir: 1 | -1) => setStepDays((v) => Math.min(STEP_MAX, Math.max(STEP_MIN, v + dir * 7)))
  const winStep = (dir: 1 | -1) => setWindowDays((v) => Math.min(WINDOW_MAX, Math.max(WINDOW_MIN, v + dir * 7)))

  const drift = (n: number | null) => (n == null ? '—' : `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n))}`)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ font: `700 15px/1 ${COND}`, color: 'var(--accent)' }}>8</span>
        <span style={{ font: `600 9px/1 ${COND}`, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
          Metabolic adaptation
        </span>
      </div>

      {gated.length < 2 ? (
        <div style={{ marginTop: 10, font: `500 11px/1.6 ${MONO}`, color: 'var(--text-dim)' }}>
          Need at least 2 gated windows in the series — have {gated.length}. Keep logging weight and
          calories across a full {windowDays}-day window.
        </div>
      ) : (
        <>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              {label('Latest maint.')}
              <div style={{ marginTop: 5, font: `700 18px/1 ${COND}`, color: 'var(--text-secondary)' }}>
                {latest ? latest.maintenance : '—'} <span style={{ font: `500 9px/1 ${MONO}`, color: 'var(--text-dim)' }}>cal/day</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              {label('Drift / 4 wk')}
              <div
                style={{
                  marginTop: 5,
                  font: `700 18px/1 ${COND}`,
                  color: adaptPer28 != null && Math.abs(adaptPer28) >= 20 ? 'var(--sign-bad)' : 'var(--text-secondary)',
                }}
              >
                {drift(adaptPer28)} <span style={{ font: `500 9px/1 ${MONO}`, color: 'var(--text-dim)' }}>cal</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              {label('Net drift')}
              <div style={{ marginTop: 5, font: `700 18px/1 ${COND}`, color: 'var(--text-secondary)' }}>
                {drift(netDrift)} <span style={{ font: `500 9px/1 ${MONO}`, color: 'var(--text-dim)' }}>cal</span>
              </div>
            </div>
          </div>

          <SeriesChart points={points} today={mondayOf(today)} />
        </>
      )}

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--divider)' }}>
        {label(
          `Series · ${points.length} windows, ${gated.length} gated` +
            (outlierCount ? `, ${outlierCount} outlier` : ''),
        )}
        <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'auto auto 1fr auto', gap: '3px 10px', font: `500 10px/1.5 ${MONO}` }}>
          {points.map((p) => {
            const outlier = p.kind === 'ok' && p.seriesFlag === 'outlier'
            // Short, fixed-width-ish tag for the always-visible cell — the full sentence (incl.
            // any phase-clamp note, which is unbounded length) only ever lives in the title
            // tooltip below, so this reliably stays on one line at phone width.
            const status = outlier
              ? 'OUTLIER'
              : p.kind === 'insufficient'
                ? p.insufficientReason
                  ? `INSUFF ${terseTag(p.insufficientReason)}`
                  : 'INSUFF'
                : p.kind === 'unreliable'
                  ? 'UNRELIABLE'
                  : 'OK'
            const isOpen = openMaintenanceWindow === p.date
            return (
              <div key={p.date} style={{ display: 'contents' }}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => dispatch({ type: 'TOGGLE_MAINTENANCE_WINDOW', date: p.date })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') dispatch({ type: 'TOGGLE_MAINTENANCE_WINDOW', date: p.date })
                  }}
                  style={{ display: 'contents', cursor: 'pointer' }}
                  title={
                    outlier
                      ? 'Gated and plausible on its own, but far off the median of the rest of the series — kept out of the drift maths and the calc-2 reference.'
                      : p.kind !== 'ok'
                        ? p.note
                        : undefined
                  }
                >
                  <span style={{ color: 'var(--text-dim)' }}>{weekCommencingLabel(p.date)}</span>
                  <span style={{ color: p.maintenance == null ? 'var(--text-muted)' : 'var(--text-secondary)', textAlign: 'right' }}>
                    {p.maintenance == null ? '—' : `${p.maintenance}`}
                  </span>
                  <span
                    style={{
                      color: outlier ? 'var(--amber)' : p.kind === 'ok' ? 'var(--accent-text)' : 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {status}
                  </span>
                  <span style={{ color: 'var(--text-disabled)', textAlign: 'right' }}>{isOpen ? '▾' : '▸'}</span>
                </div>
                {isOpen && (
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      marginTop: 4,
                      marginBottom: 6,
                      padding: '10px 0 2px',
                      borderTop: '1px solid var(--divider)',
                    }}
                  >
                    <ExpandedWindow date={p.date} entries={entries} nutrition={nutrition} phaseLog={phaseLog} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--divider)', display: 'flex', gap: 16 }}>
        <Stepper name="Step" value={`${stepDays}`} suffix="days" onStep={stepStep} />
        <Stepper name="Window" value={`${windowDays}`} suffix="days" onStep={winStep} />
      </div>
    </div>
  )
}
