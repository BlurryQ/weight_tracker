import type { ReachByDateResult, ReachByWeightResult } from '../../lib/math'
import { formatWeight, sgn, toDisplay, unitLabel } from '../../lib/format'
import { fullDate } from '../../lib/dates'
import type { SolveMode, Unit } from '../../store/types'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Stepper } from '../ui/Stepper'

interface ReachCardProps {
  unit: Unit
  solveMode: SolveMode
  onSolveModeChange: (mode: SolveMode) => void
  targetLbs: number
  targetWeeks: number
  onEditTarget: () => void
  onWeeksChange: (weeks: number) => void
  current: number
  slopeLbs: number
  weightResult: ReachByWeightResult
  dateResult: ReachByDateResult
}

export function ReachCard({
  unit,
  solveMode,
  onSolveModeChange,
  targetLbs,
  targetWeeks,
  onEditTarget,
  onWeeksChange,
  current,
  slopeLbs,
  weightResult,
  dateResult,
}: ReachCardProps) {
  const U = unitLabel(unit)
  const slopeDisplay = toDisplay(slopeLbs, unit)

  let outputLabel: string
  let outputValue: string
  let outputColor: string
  let outputSub = ''
  let note: string

  if (solveMode === 'weight') {
    outputLabel = 'You get there'
    if (weightResult.kind === 'flat') {
      outputValue = 'Flat'
      outputColor = 'var(--text-muted)'
      note = 'The last four weeks are flat — no date to give yet.'
    } else if (weightResult.kind === 'unreachable') {
      outputValue = 'Not on this trend'
      outputColor = 'var(--red)'
      note = `At ${sgn(slopeDisplay, 2)} ${U}/wk you are moving away from ${formatWeight(targetLbs, unit)} ${U}.`
    } else {
      outputValue = fullDate(weightResult.date)
      outputColor = 'var(--text-primary)'
      outputSub = `${weightResult.roundedWeeks} week${weightResult.roundedWeeks === 1 ? '' : 's'} away`
      note = `From ${formatWeight(current, unit)} ${U} at ${sgn(slopeDisplay, 2)} ${U}/wk.`
    }
  } else {
    outputLabel = 'You would weigh'
    outputValue = formatWeight(dateResult.weight, unit)
    outputColor = 'var(--text-primary)'
    outputSub = `${U} on ${fullDate(dateResult.date)}`
    note =
      dateResult.kind === 'flat'
        ? 'Flat trend — that is roughly where you are now.'
        : `From ${formatWeight(current, unit)} ${U} at ${sgn(slopeDisplay, 2)} ${U}/wk.`
  }

  return (
    <div style={{ marginTop: 16, padding: '14px 15px 15px', borderRadius: 14, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            font: '600 9.5px/1 "Barlow Condensed", sans-serif',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--text-dim)',
          }}
        >
          Reach
        </span>
        <SegmentedControl
          value={solveMode}
          onChange={onSolveModeChange}
          options={[
            { value: 'weight', label: 'Set weight' },
            { value: 'date', label: 'Set date' },
          ]}
        />
      </div>

      {solveMode === 'weight' ? (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              font: '600 9px/1 "Barlow Condensed", sans-serif',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
            }}
          >
            Target weight
          </div>
          <button
            type="button"
            onClick={onEditTarget}
            style={{
              marginTop: 6,
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              cursor: 'pointer',
              borderBottom: '1.5px dashed oklch(0.82 0.17 128 / .6)',
              paddingBottom: 2,
              width: 'fit-content',
            }}
          >
            <span style={{ font: '700 36px/1 "Barlow Condensed", sans-serif', color: 'var(--text-primary)' }}>
              {formatWeight(targetLbs, unit)}
            </span>
            <span style={{ font: '500 10.5px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
              {U} · tap to change
            </span>
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              font: '600 9px/1 "Barlow Condensed", sans-serif',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
            }}
          >
            In how long
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Stepper
              size={38}
              disabled={targetWeeks <= 1 ? 'down' : targetWeeks >= 52 ? 'up' : null}
              onDecrement={() => onWeeksChange(Math.max(1, targetWeeks - 1))}
              onIncrement={() => onWeeksChange(Math.min(52, targetWeeks + 1))}
            />
            <span style={{ font: '700 36px/1 "Barlow Condensed", sans-serif', color: 'var(--text-primary)' }}>
              {targetWeeks}
            </span>
            <span style={{ font: '500 10.5px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
              {targetWeeks === 1 ? 'week' : 'weeks'}
            </span>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, borderTop: '1px solid var(--divider)', paddingTop: 12 }}>
        <div
          style={{
            font: '600 9px/1 "Barlow Condensed", sans-serif',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--text-dim)',
          }}
        >
          {outputLabel}
        </div>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ font: '700 30px/1 "Barlow Condensed", sans-serif', color: outputColor }}>{outputValue}</span>
          {outputSub && (
            <span style={{ font: '500 11px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>{outputSub}</span>
          )}
        </div>
        <div style={{ marginTop: 6, font: '500 10px/1.5 "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
          {note}
        </div>
      </div>
    </div>
  )
}
