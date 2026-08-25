import { DAY_NAMES, today as todayIso } from '../lib/dates'
import { currentDir, phaseAt, signColor, weeklyAverages } from '../lib/math'
import { useApp } from '../store/AppContext'
import { WeekRow } from '../components/history/WeekRow'

export function History() {
  const { state, dispatch } = useApp()
  const { entries, phase, phaseLog, unit, openWeek } = state
  const today = todayIso()

  const weekly = weeklyAverages(entries)
  const dir = currentDir(phase, phaseLog)
  const reversed = weekly.slice().reverse()

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
          History
        </span>
        <span style={{ font: '500 10.5px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
          {entries.length} entries
        </span>
      </div>
      <div style={{ marginTop: 6, marginBottom: 16, font: '500 10px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
        tap a week to open its days · tap a day to edit
      </div>

      {reversed.map((week, i) => {
        const prev = weekly[weekly.length - 1 - i - 1]
        const deltaLbs = prev ? week.lbs - prev.lbs : null
        return (
          <WeekRow
            key={week.monday}
            monday={week.monday}
            weeklyLbs={week.lbs}
            n={week.n}
            deltaLbs={deltaLbs}
            hasPrev={!!prev}
            signColorOf={(v) => signColor(v, dir)}
            phase={phaseAt(week.monday, phaseLog)}
            open={openWeek === week.monday}
            onToggle={() => dispatch({ type: 'TOGGLE_WEEK', monday: week.monday })}
            entries={entries}
            unit={unit}
            today={today}
            dayNames={DAY_NAMES}
            onEditDay={(date) => dispatch({ type: 'OPEN_SHEET', sheet: date })}
          />
        )
      })}
    </div>
  )
}
