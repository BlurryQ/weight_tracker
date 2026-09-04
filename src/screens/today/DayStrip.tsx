import { addDays, DAY_NAMES, mondayOf } from '../../lib/dates'
import { formatWeight } from '../../lib/format'
import type { Entry } from '../../lib/math'
import type { Unit } from '../../store/types'

interface DayStripProps {
  entries: Entry[]
  today: string
  unit: Unit
}

/** Seven cells for the current ISO week — the logged weight replaces the day letter once
 * there's an entry for that date; today's cell is ringed. */
export function DayStrip({ entries, today, unit }: DayStripProps) {
  const monday = mondayOf(today)

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {DAY_NAMES.map((dn, i) => {
        const date = addDays(monday, i)
        const entry = entries.find((e) => e.date === date)
        const isToday = date === today
        return (
          <div
            key={date}
            className={isToday ? 'accent-el' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 0',
              borderRadius: 10,
              background: 'var(--surface)',
              border: isToday ? '1.5px solid var(--accent)' : '1.5px solid transparent',
            }}
          >
            <span
              style={
                entry
                  ? { font: '600 10px/1 "IBM Plex Mono", monospace', color: 'var(--text-secondary)' }
                  : {
                      font: '600 9px/1 "Barlow Condensed", sans-serif',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: isToday ? 'var(--accent-text)' : 'var(--text-dim)',
                    }
              }
            >
              {entry ? formatWeight(entry.lbs, unit) : dn}
            </span>
          </div>
        )
      })}
    </div>
  )
}
