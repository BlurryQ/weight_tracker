import { buildChartGeometry } from '../lib/chartGeometry'
import { mondayOf, today as todayIso } from '../lib/dates'
import { sgn, toDisplay, toLbs } from '../lib/format'
import {
  completionRatio,
  currentDir,
  fitQualityLabel,
  fitSlope,
  foldedWeeks,
  hasFoldedWeek,
  phaseAnchoredShowN,
  phaseSpans,
  projectionWeeks,
  signColor,
  solveByDate,
  solveByWeight,
  weeklyAverages,
  type PhaseAnchorMode,
  type SignColor,
} from '../lib/math'
import { useApp } from '../store/AppContext'
import type { TrendWindow } from '../store/types'
import { WeightChart } from '../components/chart/WeightChart'
import { ReachCard } from '../components/entry/ReachCard'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { WeeklyChangeBars } from './trends/WeeklyChangeBars'

const SIGN_COLOR: Record<SignColor, string> = {
  lime: 'var(--sign-good)', // +/- deltas stay green/red, independent of the accent hue
  red: 'var(--sign-bad)',
  grey: 'var(--text-muted)',
}

const WINDOW_OPTIONS: { value: TrendWindow | 'phase'; label: string }[] = [
  { value: 8, label: '8W' },
  { value: 13, label: '3M' },
  { value: 26, label: '6M' },
  { value: 99, label: 'ALL' },
  { value: 'phase', label: 'PHASE' },
]

const ANCHOR_LABELS: Record<PhaseAnchorMode, string> = {
  phaseStart: 'this phase',
  lastDeload: 'last deload',
  lastMaintain: 'last maintain',
}

/** A thin single-line anchor picker — appears only while PHASE is the active window segment.
 * Unavailable anchors (no Deload/Maintain week logged yet) are hidden outright rather than shown
 * disabled, so the line never reserves space for a toggle that can't do anything. */
function PhaseAnchorLine({
  mode,
  onChange,
  available,
}: {
  mode: PhaseAnchorMode
  onChange: (mode: PhaseAnchorMode) => void
  available: Record<PhaseAnchorMode, boolean>
}) {
  const anchors = (['phaseStart', 'lastDeload', 'lastMaintain'] as const).filter((a) => available[a])

  return (
    <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 5, lineHeight: '18px', whiteSpace: 'nowrap' }}>
      <span style={{ font: '500 10px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>anchored:</span>
      {anchors.map((a, i) => (
        <span key={a} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
          <button
            type="button"
            onClick={() => onChange(a)}
            style={{
              cursor: 'pointer',
              font: mode === a ? '700 10px "IBM Plex Mono", monospace' : '500 10px "IBM Plex Mono", monospace',
              color: mode === a ? 'var(--accent)' : 'var(--text-dim)',
            }}
          >
            {ANCHOR_LABELS[a]}
          </button>
          {i < anchors.length - 1 && <span style={{ color: 'var(--text-dim)' }}>·</span>}
        </span>
      ))}
    </div>
  )
}

function StatCard({ label, value, color, note }: { label: string; value: string; color?: string; note?: string }) {
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
      {note && <div style={{ marginTop: 3, font: '500 9px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>{note}</div>}
    </div>
  )
}

export function Trends() {
  const { state, dispatch } = useApp()
  const { entries, phase, phaseLog, unit, trendWindow, trendWindowMode, solveMode, targetLbs, targetWeeks } = state
  const today = todayIso()

  const weekly = weeklyAverages(entries)
  const dir = currentDir(phase, phaseLog)
  const spans = phaseSpans(phaseLog)

  // The main chart's window: either the fixed chip count, or a span anchored to a phase-log
  // event (see phaseAnchoredShowN). fitK follows the same halving rule either way, capped at 13
  // under phase-anchor mode so the fit line stays recent rather than spanning a whole cut/bulk.
  const showN =
    trendWindowMode === 'weeks' ? trendWindow : phaseAnchoredShowN(weekly, phaseLog, trendWindowMode)
  const fitK =
    trendWindowMode === 'weeks'
      ? trendWindow === 99
        ? weekly.length
        : Math.max(4, Math.round(trendWindow / 2))
      : Math.min(13, Math.max(4, Math.round(showN / 2)))

  // Reach solving always runs off the recent 4-week rate, independent of the window chip above —
  // matches the original Today behavior this card is inherited from.
  const fit4 = fitSlope(weekly, 4)
  const lastWeekly = weekly[weekly.length - 1]
  const current = lastWeekly ? lastWeekly.lbs : 0
  const lastMonday = lastWeekly ? lastWeekly.monday : mondayOf(today)
  const reachCtx = { current, slopeLbs: fit4.slope, lastMonday }
  const weightResult = solveByWeight(reachCtx, targetLbs)
  const dateResult = solveByDate(reachCtx, targetWeeks)
  const solveWeeks = projectionWeeks(solveMode, targetWeeks, weightResult)

  const geometry = buildChartGeometry(
    weekly,
    spans,
    { W: 316, H: 184, gutter: 32, showN, fitK, fwd: solveWeeks, gridN: 5 },
    (lbs) => toDisplay(lbs, unit),
    foldedWeeks(phaseLog),
    state.weeklyTarget,
  )

  const anchorAvailable: Record<PhaseAnchorMode, boolean> = {
    phaseStart: true,
    lastDeload: hasFoldedWeek(phaseLog, 'Deload'),
    lastMaintain: hasFoldedWeek(phaseLog, 'Maintain'),
  }

  // completionRatio already clamps to the first-ever entry, so a big sentinel safely means "all".
  const completion = completionRatio(entries, trendWindowMode === 'weeks' && trendWindow === 99 ? 9999 : showN, today)

  // geometry.last/first/slope/projVal are already in display units (the chart fits and
  // projects on converted points — the one deliberate exception to "convert only at the
  // display boundary"), so these must NOT be run through toDisplay again.
  const change = geometry.last - geometry.first

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
        <span style={{ font: '500 10.5px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>what if</span>
      </div>

      <div style={{ marginTop: 10, font: '500 10px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
        {completion.logged}/{completion.possible} days · {completion.label}
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

      <div style={{ marginTop: 20 }}>
        <WeightChart geometry={geometry} W={316} H={184} gutter={32} variant="trends" />
      </div>

      <div style={{ marginTop: 20 }}>
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
      </div>

      <div style={{ marginTop: 8 }}>
        <SegmentedControl
          size="lg"
          value={trendWindowMode === 'weeks' ? trendWindow : 'phase'}
          onChange={(picked) => {
            if (picked === 'phase') {
              // Clicking PHASE while it's already the active segment leaves whichever anchor was
              // picked alone — only a fresh weeks -> phase transition needs a default.
              if (trendWindowMode === 'weeks') dispatch({ type: 'SET_TREND_WINDOW_MODE', mode: 'phaseStart' })
            } else {
              dispatch({ type: 'SET_TREND_WINDOW_MODE', mode: 'weeks' })
              dispatch({ type: 'SET_TREND_WINDOW', window: picked })
            }
          }}
          options={WINDOW_OPTIONS}
        />
      </div>

      {/* Collapses away entirely (no reserved space) outside PHASE mode. */}
      {trendWindowMode !== 'weeks' && (
        <PhaseAnchorLine
          mode={trendWindowMode}
          onChange={(mode) => dispatch({ type: 'SET_TREND_WINDOW_MODE', mode })}
          available={anchorAvailable}
        />
      )}

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <StatCard label="Change" value={sgn(change)} color={SIGN_COLOR[signColor(toLbs(change, unit), dir)]} />
        <StatCard
          label="Fit slope"
          value={sgn(geometry.slope, 2) + '/wk'}
          color={SIGN_COLOR[signColor(toLbs(geometry.slope, unit), dir)]}
        />
        <StatCard label="R²" value={geometry.r2.toFixed(2)} note={fitQualityLabel(geometry.r2)} />
      </div>

      <div style={{ marginTop: 12 }}>
        <WeeklyChangeBars weekly={weekly} dir={dir} />
      </div>
    </div>
  )
}
