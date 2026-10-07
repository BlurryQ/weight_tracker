import { addDays, shortDate } from '../../lib/dates'
import {
  ESTIMATE_WINDOW_DAYS,
  computeMaintenanceHistory,
  estimateMaintenance,
  intakeAdjustment,
  targetIntake,
  type NutritionEntry,
} from '../../lib/energy'
import { phaseSpans, type Entry, type PhaseLogEntry } from '../../lib/math'

const kcal = (n: number) => Math.round(n).toLocaleString('en-US')

interface EnergyCardProps {
  entries: Entry[]
  nutrition: NutritionEntry[]
  phaseLog: PhaseLogEntry[]
  weeklyTargetLbs: number
  today: string
  /** Opens Trends in Energy mode so the headline number above can be checked by hand — the
   * module behind it (CurrentWindowModule/MaintenanceTrendModule) now lives there. */
  onSeeCalculation: () => void
}

/** Adaptive-TDEE / calorie-target card. Three states off `estimateMaintenance`:
 *  - `insufficient` (maintenance == null): shows why, one of two reasons via `est.note`
 *    (too few food-log days vs. too few weigh-ins). Recurs for ~2 weeks after any phase
 *    change — copy must not read as first-run-only.
 *  - `unreliable`: shows the number dimmed + a "treat with caution" tag.
 *  - `ok`: number + target intake + a "trim/add" or "about where you are now" line. */
export function EnergyCard({ entries, nutrition, phaseLog, weeklyTargetLbs, today, onSeeCalculation }: EnergyCardProps) {
  const est = estimateMaintenance(entries, nutrition, phaseLog, today)

  const clampedAt =
    est.windowStart > addDays(today, -(ESTIMATE_WINDOW_DAYS - 1)) ? shortDate(est.windowStart) : null
  const windowLine = `${ESTIMATE_WINDOW_DAYS}-day window${clampedAt ? ` · clamped at ${clampedAt}` : ''}`

  // Smoothed figure from Lab #8's outlier-aware rolling series — same method as that module's
  // "Latest maint." readout (the most recent trend-set point; the trend set excludes both
  // ungated windows and gated-but-series-outlier windows, e.g. a single water-weight-skewed
  // week). This is normally the more dependable day-to-day number, so it's the primary headline
  // below — EXCEPT right after a Cut/Bulk phase change, when the series' newest point can still
  // describe the *old* phase (the new phase hasn't accumulated ~14 calorie-days of its own yet
  // to earn its own gated point). The raw single-window `est.maintenance`, by contrast, is
  // already phase-clamped internally by estimateMaintenance (its window start is pulled forward
  // to the phase change when that's more recent), so it's the one actually current in that
  // window — hence the freshness check and fallback below.
  const { trend } = computeMaintenanceHistory(entries, nutrition, phaseLog, today)
  const currentPhaseSpan = phaseSpans(phaseLog).filter((s) => s.start <= today).slice(-1)[0]
  const latestTrend = trend.length >= 2 ? trend[trend.length - 1] : null
  // No phase history at all -> nothing for the smoothed point to be stale relative to.
  const smoothedFresh = latestTrend != null && (!currentPhaseSpan || latestTrend.date >= currentPhaseSpan.start)
  const smoothedValue = smoothedFresh ? latestTrend!.maintenance : null

  return (
    <div style={{ marginTop: 16, padding: '14px 15px', borderRadius: 14, background: 'var(--surface)' }}>
      <div
        style={{
          font: '600 9.5px/1 "Barlow Condensed", sans-serif',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--text-dim)',
        }}
      >
        Energy balance
      </div>

      {est.maintenance == null ? (
        <div style={{ marginTop: 10, font: '500 11px/1.6 "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
          {est.note}
          <br />
          Needs ~2 weeks of overlapping weigh-ins and Health Connect days in the current phase.
          <br />
          <span style={{ color: 'var(--text-muted)' }}>{windowLine}</span>
        </div>
      ) : (
        <>
          {(() => {
            // Primary = smoothed trend point when there's enough series history AND it's fresh
            // relative to the current phase; otherwise fall back to the raw window (which is
            // itself phase-clamped, so it's the current one right after a phase change). Only
            // show a secondary reference number in the normal (smoothed) case — a stale smoothed
            // figure isn't worth surfacing as a "reference" once it's already the fallback.
            const usingSmoothed = smoothedValue != null
            const primary = smoothedValue ?? est.maintenance
            const secondary = usingSmoothed ? est.maintenance : null
            // targetIntake/intakeAdjustment should key off whichever figure is primary.
            // intakeAdjustment takes the full estimate (it also reads meanIntake off it), so
            // feed it a shallow copy with maintenance overridden rather than a raw number.
            const estForTarget = usingSmoothed ? { ...est, maintenance: primary } : est
            const target = targetIntake(primary, weeklyTargetLbs)
            const adj = intakeAdjustment(estForTarget, weeklyTargetLbs)
            const rate = `${weeklyTargetLbs > 0 ? '+' : '−'}${Math.abs(weeklyTargetLbs).toFixed(1)} lb/wk`
            const move =
              adj == null || Math.abs(adj) < 25
                ? 'about where you are now'
                : adj < 0
                  ? `trim ~${kcal(-adj)}/day from your recent ${kcal(est.meanIntake ?? 0)}`
                  : `add ~${kcal(adj)}/day to your recent ${kcal(est.meanIntake ?? 0)}`
            return (
              <>
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span
                      style={{
                        font: '700 36px/1 "Barlow Condensed", sans-serif',
                        color: !usingSmoothed && est.kind === 'unreliable' ? 'var(--text-dim)' : 'var(--text-primary)',
                      }}
                    >
                      {kcal(primary)}
                    </span>
                    <span style={{ font: '500 11px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>cal/day</span>
                  </div>
                  <div style={{ marginTop: 2, font: '500 9.5px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
                    {usingSmoothed ? `to maintain · smoothed, ${trend.length}-window series` : 'to maintain'}
                  </div>
                </div>

                {secondary != null && (
                  <div style={{ marginTop: 3, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ font: '700 20px/1 "Barlow Condensed", sans-serif', color: 'var(--text-secondary)' }}>
                      {kcal(secondary)}
                    </span>
                    <span style={{ font: '500 9.5px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
                      cal/day · this window (raw)
                    </span>
                  </div>
                )}

                <div style={{ marginTop: 8, font: '500 11px/1.6 "IBM Plex Mono", monospace', color: 'var(--text-secondary)' }}>
                  Target {rate} → <strong style={{ color: 'var(--accent)' }}>{kcal(target)} cal/day</strong>
                  <br />
                  <span style={{ color: 'var(--text-dim)' }}>{move}</span>
                </div>
              </>
            )
          })()}

          <div style={{ marginTop: 8, font: '500 9.5px/1.5 "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
            {est.note} · {est.calorieDays} of {est.windowDays + 1} days logged
            {est.kind === 'unreliable' ? ' · treat with caution' : ''}
            <br />
            {windowLine}
          </div>

          <button
            type="button"
            onClick={onSeeCalculation}
            style={{
              display: 'block',
              marginTop: 10,
              padding: '10px 0 0',
              border: 'none',
              borderTop: '1px solid var(--divider)',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              background: 'transparent',
              font: '600 9.5px/1 "IBM Plex Mono", monospace',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
            }}
          >
            See how this is calculated ›
          </button>
        </>
      )}
    </div>
  )
}
