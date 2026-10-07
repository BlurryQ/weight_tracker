import { diffDays, shortDate, today as todayIso } from '../../lib/dates'
import { KCAL_PER_LB_GAIN, KCAL_PER_LB_LOSS, estimateMaintenance, type MaintenanceEstimate, type NutritionEntry } from '../../lib/energy'
import { fitQualityLabel, leastSquaresFit, phaseSpans, type Entry, type FitResult, type PhaseLogEntry } from '../../lib/math'
import { useApp } from '../../store/AppContext'

// Trends/Energy module — "how a window's number is built". Home's Energy card only ever shows
// the *result* of estimateMaintenance() for the current window; this module reuses that exact
// same call (no new formula, no tunables) and renders the raw inputs and arithmetic that produced
// it, so the number can be checked by hand. The reusable chart+arithmetic piece (WindowBreakdown)
// is also used by MaintenanceTrendModule to expand an arbitrary historical window inline.

const MONO = '"IBM Plex Mono", monospace'
const COND = '"Barlow Condensed", sans-serif'

function label(text: string) {
  return (
    <div style={{ font: `600 9px/1 ${COND}`, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
      {text}
    </div>
  )
}

type WeightPt = { date: string; x: number; y: number }
type CalPt = { date: string; x: number; kcal: number }

/** Two stacked mini-charts sharing one x-axis (window day 0..N), rather than a single dual-axis
 * chart — lbs and kcal ranges are too far apart to share a y-axis without one series flattening
 * to a line. Weight panel: raw weigh-in points + the least-squares fit line (the same line that
 * produces weightChangeLbs). Calorie panel: raw logged-calorie days as bars + a dashed line at
 * meanIntake. Renders whatever points exist even when the window is insufficient overall. */
function WindowChart({
  weightPts,
  calPts,
  fit,
  fitXRange,
  meanIntake,
  totalDays,
}: {
  weightPts: WeightPt[]
  calPts: CalPt[]
  fit: FitResult | null
  fitXRange: [number, number] | null
  meanIntake: number | null
  totalDays: number
}) {
  const W = 280
  const padX = 6
  const padY = 9
  const Hw = 66
  const Hc = 66
  const gap = 14
  const domain = Math.max(1, totalDays)

  const x = (dx: number) => padX + (dx / domain) * (W - 2 * padX)

  const hasWeight = weightPts.length > 0
  const wVals = weightPts.map((p) => p.y)
  const wLo = hasWeight ? Math.min(...wVals) : 0
  const wHi = hasWeight ? Math.max(...wVals) : 1
  const wRange = Math.max(0.1, wHi - wLo)
  const yW = (v: number) => padY + (1 - (v - wLo) / wRange) * (Hw - 2 * padY)

  const hasCal = calPts.length > 0
  const cVals = calPts.map((p) => p.kcal).concat(meanIntake != null ? [meanIntake] : [])
  const cLo = cVals.length ? Math.min(...cVals) : 0
  const cHi = cVals.length ? Math.max(...cVals) : 1
  const cRange = Math.max(1, cHi - cLo)
  const yC = (v: number) => padY + (1 - (v - cLo) / cRange) * (Hc - 2 * padY)

  const totalH = Hw + gap + Hc

  return (
    <svg viewBox={`0 0 ${W} ${totalH}`} width="100%" height={totalH} style={{ marginTop: 10, display: 'block', overflow: 'visible' }}>
      {/* weight panel */}
      <line x1={padX} y1={Hw - padY} x2={W - padX} y2={Hw - padY} stroke="var(--divider)" strokeWidth={1} />
      {hasWeight && (
        <>
          <text x={padX} y={Math.max(8, yW(wHi) - 3)} fill="var(--text-dim)" style={{ font: `500 8px ${MONO}` }}>
            max {wHi.toFixed(1)}
          </text>
          <text x={padX} y={Math.min(Hw - 2, yW(wLo) + 9)} fill="var(--text-dim)" style={{ font: `500 8px ${MONO}` }}>
            min {wLo.toFixed(1)}
          </text>
          {fit && fitXRange && (
            <line
              x1={x(fitXRange[0])}
              y1={yW(fit.intercept + fit.slope * fitXRange[0])}
              x2={x(fitXRange[1])}
              y2={yW(fit.intercept + fit.slope * fitXRange[1])}
              stroke="var(--accent)"
              strokeWidth={1.5}
            />
          )}
          {weightPts.map((p) => (
            <circle key={p.date} cx={x(p.x)} cy={yW(p.y)} r={2.4} fill="var(--accent)" />
          ))}
        </>
      )}
      <text x={W - padX} y={Hw - padY + 8} textAnchor="end" fill="var(--text-muted)" style={{ font: `600 7px ${COND}`, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        weight (lb)
      </text>

      {/* calorie panel */}
      <g transform={`translate(0, ${Hw + gap})`}>
        <line x1={padX} y1={Hc - padY} x2={W - padX} y2={Hc - padY} stroke="var(--divider)" strokeWidth={1} />
        {hasCal && (
          <>
            <text x={padX} y={Math.max(8, yC(cHi) - 3)} fill="var(--text-dim)" style={{ font: `500 8px ${MONO}` }}>
              max {Math.round(cHi)}
            </text>
            <text x={padX} y={Math.min(Hc - 2, yC(cLo) + 9)} fill="var(--text-dim)" style={{ font: `500 8px ${MONO}` }}>
              min {Math.round(cLo)}
            </text>
            {meanIntake != null && (
              <line
                x1={padX}
                y1={yC(meanIntake)}
                x2={W - padX}
                y2={yC(meanIntake)}
                stroke="var(--amber)"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
            )}
            {calPts.map((p) => (
              <rect
                key={p.date}
                x={x(p.x) - 1.5}
                y={yC(p.kcal)}
                width={3}
                height={Math.max(0, Hc - padY - yC(p.kcal))}
                fill="var(--amber)"
                opacity={0.55}
              />
            ))}
          </>
        )}
        <text x={W - padX} y={Hc - padY + 8} textAnchor="end" fill="var(--text-muted)" style={{ font: `600 7px ${COND}`, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          calories (kcal)
        </text>
      </g>
    </svg>
  )
}

export interface WindowBreakdownProps {
  /** A MaintenanceEstimate for the window being shown — from estimateMaintenance(), for either
   * today (CurrentWindowModule) or an arbitrary past window-end date (a tapped #8 series row). */
  est: MaintenanceEstimate
  /** The `today` date that was passed to estimateMaintenance() to produce `est` — the window's
   * end date. Named distinctly from "today" since it's frequently a past date. */
  windowEnd: string
  entries: Entry[]
  nutrition: NutritionEntry[]
  phaseLog: PhaseLogEntry[]
}

/** The reusable "chart + worked arithmetic" piece behind any one maintenance-estimate window —
 * shared by CurrentWindowModule (always today's window) and MaintenanceTrendModule's per-row
 * drill-down (any window in the #8 series). Takes the MaintenanceEstimate plus the raw data
 * needed to rebuild the chart's points for that window's own [windowStart, windowEnd] range. */
export function WindowBreakdown({ est, windowEnd, entries, nutrition, phaseLog }: WindowBreakdownProps) {
  const inWindow = (d: string) => d >= est.windowStart && d <= windowEnd
  const weightPts: WeightPt[] = entries
    .filter((e) => inWindow(e.date))
    .map((e) => ({ date: e.date, x: diffDays(est.windowStart, e.date), y: e.lbs }))
    .sort((a, b) => a.x - b.x)
  const calPts: CalPt[] = nutrition
    .filter((n) => inWindow(n.date) && n.kcal > 0)
    .map((n) => ({ date: n.date, x: diffDays(est.windowStart, n.date), kcal: n.kcal }))
    .sort((a, b) => a.x - b.x)

  // Local fit/mean for the chart — computed the same way estimateMaintenance() does internally,
  // but shown even when the official estimate is 'insufficient' for some *other* gate (e.g.
  // enough weigh-ins but too few calorie-days still draws the weight fit).
  const fit = weightPts.length >= 2 ? leastSquaresFit(weightPts.map((p) => ({ x: p.x, y: p.y }))) : null
  const fitXRange: [number, number] | null = weightPts.length >= 2
    ? [Math.min(...weightPts.map((p) => p.x)), Math.max(...weightPts.map((p) => p.x))]
    : null
  const localMeanIntake = calPts.length ? calPts.reduce((s, p) => s + p.kcal, 0) / calPts.length : null

  const totalDays = Math.max(0, diffDays(est.windowStart, windowEnd))

  // Same phase lookup estimateMaintenance() uses internally to pick kcal/lb — recomputed here
  // (not returned by the estimate) so the arithmetic below can name which value was used and why.
  const lastSpan = phaseSpans(phaseLog).filter((s) => s.start <= windowEnd).slice(-1)[0]
  const gaining = lastSpan ? lastSpan.dir === 'Bulk' : (est.weightChangeLbs ?? 0) > 0
  const kcalPerLb = gaining ? KCAL_PER_LB_GAIN : KCAL_PER_LB_LOSS
  const phaseSource = lastSpan ? `${lastSpan.dir} phase` : 'no phase history — using observed direction'

  const canCompute = est.maintenance != null && est.weightChangeLbs != null && est.meanIntake != null

  return (
    <div>
      <div style={{ font: `500 9.5px/1.5 ${MONO}`, color: 'var(--text-dim)' }}>
        {shortDate(est.windowStart)} → {shortDate(windowEnd)} ({totalDays + 1} days)
      </div>

      <div style={{ marginTop: 6, display: 'flex', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: 'var(--accent)', display: 'inline-block' }} />
          <span style={{ font: `500 9px ${MONO}`, color: 'var(--text-muted)' }}>Weigh-ins + fit</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: 'var(--amber)', display: 'inline-block' }} />
          <span style={{ font: `500 9px ${MONO}`, color: 'var(--text-muted)' }}>Calories + mean</span>
        </div>
      </div>

      <WindowChart
        weightPts={weightPts}
        calPts={calPts}
        fit={fit}
        fitXRange={fitXRange}
        meanIntake={localMeanIntake}
        totalDays={totalDays}
      />

      {est.kind === 'insufficient' ? (
        <div style={{ marginTop: 10, font: `500 11px/1.6 ${MONO}`, color: 'var(--text-dim)' }}>
          {est.note}
        </div>
      ) : (
        canCompute && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--divider)' }}>
            {label('The arithmetic')}
            {(() => {
              const weightChangeLbs = est.weightChangeLbs as number
              const meanIntake = est.meanIntake as number
              const spanDays = est.windowDays
              const ratePerWeek = (weightChangeLbs / spanDays) * 7
              const deficitPerDay = -(weightChangeLbs * kcalPerLb) / spanDays
              const changeWord = weightChangeLbs < 0 ? 'Lost' : weightChangeLbs > 0 ? 'Gained' : 'Held'
              const opWord = deficitPerDay >= 0 ? 'deficit' : 'surplus'
              const opSign = deficitPerDay >= 0 ? '+' : '−'
              const opMag = Math.round(Math.abs(deficitPerDay))
              return (
                <div style={{ marginTop: 6, font: `500 11px/1.7 ${MONO}`, color: 'var(--text-secondary)' }}>
                  {changeWord} <strong style={{ color: 'var(--text-primary)' }}>{Math.abs(weightChangeLbs).toFixed(1)} lb</strong> over{' '}
                  {spanDays} days → <strong style={{ color: 'var(--text-primary)' }}>{ratePerWeek >= 0 ? '+' : '−'}{Math.abs(ratePerWeek).toFixed(2)} lb/wk</strong>
                  <br />
                  At <strong style={{ color: 'var(--text-primary)' }}>{kcalPerLb} kcal/lb</strong> ({phaseSource}) that's a{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{opMag} cal/day {opWord}</strong>
                  <br />
                  Mean logged intake <strong style={{ color: 'var(--text-primary)' }}>{Math.round(meanIntake)}</strong> {opSign} {opMag} ={' '}
                  <strong style={{ color: 'var(--accent)' }}>{est.maintenance} cal/day</strong>
                  <br />
                  <span style={{ color: 'var(--text-dim)' }}>
                    Fit: {fitQualityLabel(est.r2).toLowerCase()} (R² {est.r2.toFixed(2)}) · {est.calorieDays} calorie-days logged
                  </span>
                  {est.kind === 'unreliable' && (
                    <>
                      <br />
                      <span style={{ color: 'var(--amber)' }}>{est.note}</span>
                    </>
                  )}
                </div>
              )
            })()}
          </div>
        )
      )}
    </div>
  )
}

/** Thin wrapper: always today's window via estimateMaintenance(), rendered through the shared
 * WindowBreakdown. */
export function CurrentWindowModule() {
  const { state } = useApp()
  const { entries, nutrition, phaseLog } = state
  const today = todayIso()

  const est = estimateMaintenance(entries, nutrition, phaseLog, today)

  return (
    <div>
      <div style={{ font: `700 15px/1 ${COND}`, color: 'var(--accent)' }}>Current window</div>
      <div style={{ marginTop: 2 }}>{label("How today's number is built")}</div>

      <div style={{ marginTop: 8 }}>
        <WindowBreakdown est={est} windowEnd={today} entries={entries} nutrition={nutrition} phaseLog={phaseLog} />
      </div>
    </div>
  )
}
