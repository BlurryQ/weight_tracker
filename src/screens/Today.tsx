import { buildChartGeometry } from '../lib/chartGeometry'
import { diffDays, mondayOf, shortDate, today as todayIso } from '../lib/dates'
import { formatWeight, sgn, toDisplay, unitLabel } from '../lib/format'
import {
  avg,
  currentDir,
  fitSlope,
  foldedWeeks,
  paceStatus,
  phaseSpans,
  projectionWeeks,
  signColor,
  solveByDate,
  solveByWeight,
  weeklyAverages,
} from '../lib/math'
import { useApp } from '../store/AppContext'
import { Chip } from '../components/ui/Chip'
import { WeightChart } from '../components/chart/WeightChart'
import { ReachCard } from '../components/entry/ReachCard'
import { PaceRing } from './today/PaceRing'
import { StatCards } from './today/StatCards'

const SIGN_COLOR = { lime: 'var(--lime)', red: 'var(--red)', grey: 'var(--text-muted)' } as const

const CHIP_COLORS = {
  Cut: {
    bg: 'oklch(0.82 0.17 128 / .13)',
    border: 'oklch(0.82 0.17 128 / .3)',
    dot: 'var(--lime)',
    text: 'var(--lime-text)',
  },
  Bulk: {
    bg: 'oklch(0.76 0.13 235 / .14)',
    border: 'oklch(0.76 0.13 235 / .35)',
    dot: 'var(--blue)',
    text: 'var(--blue)',
  },
}

export function Today() {
  const { state, dispatch } = useApp()
  const { entries, phase, phaseStart, phaseLog, weeklyTarget, unit, solveMode, targetLbs, targetWeeks } = state
  const today = todayIso()

  if (entries.length === 0) {
    return (
      <div style={{ padding: '20px 20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 120 }}>
        <div style={{ font: '500 12px "IBM Plex Mono", monospace', color: 'var(--text-dim)', textAlign: 'center' }}>
          No weigh-ins yet.
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: today })}
          style={{
            padding: '13px 20px',
            borderRadius: 999,
            background: 'var(--lime)',
            color: '#0b0c0b',
            font: '700 13px/1 "Barlow Condensed", sans-serif',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Log your first weigh-in
        </button>
      </div>
    )
  }

  const a7 = avg(entries, 7, today)
  const a7prev = avg(entries, 7, today, 7)
  const a14 = avg(entries, 14, today)
  const a30 = avg(entries, 30, today)
  const wowLbs = a7 != null && a7prev != null ? a7 - a7prev : 0

  const weekly = weeklyAverages(entries)
  const fit4 = fitSlope(weekly, 4)
  const dir = currentDir(phase, phaseLog)
  const lastWeekly = weekly[weekly.length - 1]
  const current = lastWeekly ? lastWeekly.lbs : (a7 ?? 0)
  const lastMonday = lastWeekly ? lastWeekly.monday : mondayOf(today)
  const reachCtx = { current, slopeLbs: fit4.slope, lastMonday }
  const weightResult = solveByWeight(reachCtx, targetLbs)
  const dateResult = solveByDate(reachCtx, targetWeeks)
  const solveWeeks = projectionWeeks(solveMode, targetWeeks, weightResult)

  const spans = phaseSpans(phaseLog)
  const geometry = buildChartGeometry(
    weekly,
    spans,
    { W: 320, H: 128, gutter: 28, showN: 26, fitK: 4, fwd: solveWeeks, gridN: 4 },
    (lbs) => toDisplay(lbs, unit),
    foldedWeeks(phaseLog),
  )

  const pace = paceStatus(fit4.slope, weeklyTarget)
  const phaseWeek = Math.floor(diffDays(mondayOf(phaseStart), today) / 7) + 1
  const chipColors = CHIP_COLORS[dir]

  return (
    <div style={{ padding: '0 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Chip
          label={`${phase} · week ${phaseWeek}`}
          bg={chipColors.bg}
          border={chipColors.border}
          dotColor={chipColors.dot}
          textColor={chipColors.text}
          onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'setup' })}
        />
        <span style={{ font: '500 11px "IBM Plex Mono", monospace', color: '#5c6159' }}>{shortDate(today)}</span>
      </div>

      <div style={{ marginTop: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div
            style={{
              font: '600 9.5px/1 "Barlow Condensed", sans-serif',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
            }}
          >
            7-day average
          </div>
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ font: '700 78px/0.8 "Barlow Condensed", sans-serif', letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
              {formatWeight(a7, unit)}
            </span>
            <span
              style={{
                font: '600 13px/1 "Barlow Condensed", sans-serif',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--text-dim)',
              }}
            >
              {unitLabel(unit)}
            </span>
          </div>
          <div style={{ marginTop: 8, font: '500 11.5px "IBM Plex Mono", monospace', color: SIGN_COLOR[signColor(wowLbs, dir)] }}>
            {sgn(toDisplay(wowLbs, unit))} on the week
          </div>
        </div>
        <PaceRing status={pace} />
      </div>

      <div style={{ marginTop: 20 }}>
        <StatCards
          a14={formatWeight(a14, unit)}
          a30={formatWeight(a30, unit)}
          rateLbs={fit4.slope}
          rateColor={signColor(fit4.slope, dir)}
          unit={unit}
        />
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              font: '600 9.5px/1 "Barlow Condensed", sans-serif',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
            }}
          >
            Weekly average
          </span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'trends' })}
            style={{ font: '500 10.5px "IBM Plex Mono", monospace', color: 'var(--lime)', cursor: 'pointer' }}
          >
            all trends →
          </button>
        </div>
        <div style={{ marginTop: 14 }}>
          <WeightChart geometry={geometry} W={320} H={128} gutter={28} variant="today" />
        </div>
      </div>

      <ReachCard
        unit={unit}
        solveMode={solveMode}
        onSolveModeChange={(mode) => dispatch({ type: 'SET_SOLVE_MODE', mode })}
        targetLbs={targetLbs}
        targetWeeks={targetWeeks}
        onEditTarget={() => dispatch({ type: 'OPEN_SHEET', sheet: 'target' })}
        onWeeksChange={(weeks) => dispatch({ type: 'SET_TARGET_WEEKS', value: weeks })}
        current={current}
        slopeLbs={fit4.slope}
        weightResult={weightResult}
        dateResult={dateResult}
      />
    </div>
  )
}
