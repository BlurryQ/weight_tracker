import { DAY_NAMES, today as todayIso, weekCommencingLabel } from '../lib/dates'
import { weeklyKcal } from '../lib/energy'
import { formatWeekForClipboard } from '../lib/format'
import { currentDir, phaseAt, signColor, weeklyAverages, type WeeklyAverage } from '../lib/math'
import { useApp } from '../store/AppContext'
import { WeekRow } from '../components/history/WeekRow'

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for contexts where the async Clipboard API is unavailable.
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    } catch {
      return false
    }
  }
}

export function History() {
  const { state, dispatch } = useApp()
  const { entries, nutrition, phase, phaseLog, unit, openWeek, weeklyTarget } = state
  const today = todayIso()

  const weekly = weeklyAverages(entries)
  const kcalByMonday = new Map(weeklyKcal(nutrition).map((w) => [w.monday, w.kcal]))
  const dir = currentDir(phase, phaseLog)
  const reversed = weekly.slice().reverse()

  async function copyWeek(week: WeeklyAverage, deltaLbs: number | null) {
    const text = formatWeekForClipboard({
      monday: week.monday,
      weeklyLbs: week.lbs,
      deltaLbs,
      weeklyTargetLbs: weeklyTarget,
      unit,
      entries,
      nutrition,
    })
    const ok = await copyToClipboard(text)
    dispatch({ type: 'SHOW_TOAST', message: ok ? `Copied ${weekCommencingLabel(week.monday)}` : 'Copy failed' })
  }

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
        const phaseAtWeek = phaseAt(week.monday, phaseLog)
        // Grade each week's delta by the phase direction it actually happened in, not by
        // whatever phase you're in today — a gain during a real Bulk week was the goal, and
        // should read lime there even while looking at History mid-Cut.
        const rowDir = phaseAtWeek.dir ?? dir
        return (
          <WeekRow
            key={week.monday}
            monday={week.monday}
            weeklyLbs={week.lbs}
            n={week.n}
            deltaLbs={deltaLbs}
            hasPrev={!!prev}
            signColorOf={(v) => signColor(v, rowDir)}
            phase={phaseAtWeek}
            open={openWeek === week.monday}
            onToggle={() => dispatch({ type: 'TOGGLE_WEEK', monday: week.monday })}
            entries={entries}
            weekKcal={kcalByMonday.get(week.monday) ?? null}
            nutrition={nutrition}
            unit={unit}
            today={today}
            dayNames={DAY_NAMES}
            onEditDay={(date) => dispatch({ type: 'OPEN_SHEET', sheet: date })}
            onCopy={() => copyWeek(week, deltaLbs)}
          />
        )
      })}
    </div>
  )
}
