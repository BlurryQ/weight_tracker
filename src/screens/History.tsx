import { DAY_NAMES, fullDate, today as todayIso, weekCommencingLabel } from '../lib/dates'
import { weeklyKcal } from '../lib/energy'
import { formatWeekForClipboard } from '../lib/format'
import { currentDir, groupWeeksBySpan, phaseAt, signColor, weeklyAverages, type PhaseSpan, type WeeklyAverage } from '../lib/math'
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

/** One section header per Cut/Bulk span — Deload/Maintain weeks fold into the enclosing span
 * here (they still surface as their own tag on the individual WeekRow, via phaseAt below) rather
 * than getting their own section, since they're one-week events, not spans of their own. */
function GroupHeader({ span }: { span: PhaseSpan }) {
  const color = span.dir === 'Cut' ? 'var(--cut)' : 'var(--bulk)'
  return (
    <div style={{ marginTop: 24, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flex: 'none' }} />
      <span
        style={{
          font: '600 9.5px/1 "Barlow Condensed", sans-serif',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--text-dim)',
        }}
      >
        {span.dir} · since {fullDate(span.start)}
      </span>
    </div>
  )
}

export function History() {
  const { state, dispatch } = useApp()
  const { entries, nutrition, phase, phaseLog, unit, openWeek, weeklyTarget } = state
  const today = todayIso()

  const weekly = weeklyAverages(entries)
  const kcalByMonday = new Map(weeklyKcal(nutrition).map((w) => [w.monday, w.kcal]))
  const dir = currentDir(phase, phaseLog)

  // Week-over-week deltas are computed on the ascending list first — the delta crosses group
  // boundaries freely (a phase change doesn't reset "vs last week"), only the *display* order
  // and grouping happen afterward.
  const deltaByMonday = new Map<string, number | null>()
  let prevWeek: WeeklyAverage | null = null
  for (const week of weekly) {
    deltaByMonday.set(week.monday, prevWeek ? week.lbs - prevWeek.lbs : null)
    prevWeek = week
  }

  const groups = groupWeeksBySpan(weekly, phaseLog)
    .slice()
    .reverse()
    .map((g) => ({ span: g.span, weeks: g.weeks.slice().reverse() }))

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

      {groups.map((group) => (
        <div key={group.span?.start ?? 'pre-tracking'}>
          {group.span && <GroupHeader span={group.span} />}
          {group.weeks.map((week) => {
            const deltaLbs = deltaByMonday.get(week.monday) ?? null
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
                hasPrev={deltaLbs != null}
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
      ))}
    </div>
  )
}
