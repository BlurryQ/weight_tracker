import { addDays, shortDate } from '../../lib/dates'
import {
  ESTIMATE_WINDOW_DAYS,
  estimateMaintenance,
  intakeAdjustment,
  targetIntake,
  type NutritionEntry,
} from '../../lib/energy'
import type { Entry, PhaseLogEntry } from '../../lib/math'

const kcal = (n: number) => Math.round(n).toLocaleString('en-US')

interface EnergyCardProps {
  entries: Entry[]
  nutrition: NutritionEntry[]
  phaseLog: PhaseLogEntry[]
  weeklyTargetLbs: number
  today: string
}

/** Adaptive-TDEE / calorie-target card. Three states off `estimateMaintenance`:
 *  - `insufficient` (maintenance == null): shows why, one of two reasons via `est.note`
 *    (too few food-log days vs. too few weigh-ins). Recurs for ~2 weeks after any phase
 *    change — copy must not read as first-run-only.
 *  - `unreliable`: shows the number dimmed + a "treat with caution" tag.
 *  - `ok`: number + target intake + a "trim/add" or "about where you are now" line. */
export function EnergyCard({ entries, nutrition, phaseLog, weeklyTargetLbs, today }: EnergyCardProps) {
  const est = estimateMaintenance(entries, nutrition, phaseLog, today)

  const clampedAt =
    est.windowStart > addDays(today, -(ESTIMATE_WINDOW_DAYS - 1)) ? shortDate(est.windowStart) : null
  const windowLine = `${ESTIMATE_WINDOW_DAYS}-day window${clampedAt ? ` · clamped at ${clampedAt}` : ''}`

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
          Needs ~2 weeks of overlapping weigh-ins and MyFitnessPal days in the current phase.
          <br />
          <span style={{ color: 'var(--text-muted)' }}>{windowLine}</span>
        </div>
      ) : (
        <>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              style={{
                font: '700 36px/1 "Barlow Condensed", sans-serif',
                color: est.kind === 'unreliable' ? 'var(--text-dim)' : 'var(--text-primary)',
              }}
            >
              {kcal(est.maintenance)}
            </span>
            <span style={{ font: '500 11px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
              cal/day to maintain
            </span>
          </div>

          {(() => {
            const target = targetIntake(est.maintenance, weeklyTargetLbs)
            const adj = intakeAdjustment(est, weeklyTargetLbs)
            const rate = `${weeklyTargetLbs > 0 ? '+' : '−'}${Math.abs(weeklyTargetLbs).toFixed(1)} lb/wk`
            const move =
              adj == null || Math.abs(adj) < 25
                ? 'about where you are now'
                : adj < 0
                  ? `trim ~${kcal(-adj)}/day from your recent ${kcal(est.meanIntake ?? 0)}`
                  : `add ~${kcal(adj)}/day to your recent ${kcal(est.meanIntake ?? 0)}`
            return (
              <div style={{ marginTop: 8, font: '500 11px/1.6 "IBM Plex Mono", monospace', color: 'var(--text-secondary)' }}>
                Target {rate} → <strong style={{ color: 'var(--accent)' }}>{kcal(target)} cal/day</strong>
                <br />
                <span style={{ color: 'var(--text-dim)' }}>{move}</span>
              </div>
            )
          })()}

          <div style={{ marginTop: 8, font: '500 9.5px/1.5 "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
            {est.note} · {est.calorieDays} of {est.windowDays + 1} days logged
            {est.kind === 'unreliable' ? ' · treat with caution' : ''}
            <br />
            {windowLine}
          </div>
        </>
      )}
    </div>
  )
}
