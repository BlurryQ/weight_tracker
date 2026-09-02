import { addDays, DAY_NAMES, weekCommencingLabel } from '../../lib/dates'
import type { NutritionEntry } from '../../lib/energy'
import { formatKcal, formatWeight, sgn, toDisplay } from '../../lib/format'
import type { Entry, PhaseAt, SignColor } from '../../lib/math'
import type { Unit } from '../../store/types'

const SIGN_COLOR: Record<SignColor, string> = {
  lime: 'var(--sign-good)', // +/- deltas stay green/red, independent of the accent hue
  red: 'var(--sign-bad)',
  grey: 'var(--text-muted)',
}

interface WeekRowProps {
  monday: string
  weeklyLbs: number
  n: number
  deltaLbs: number | null
  hasPrev: boolean
  signColorOf: (v: number) => SignColor
  phase: PhaseAt
  open: boolean
  onToggle: () => void
  entries: Entry[]
  /** Mean daily calories for this week, or null if MyFitnessPal logged nothing. */
  weekKcal: number | null
  /** Every daily calorie total (all weeks) — the expanded day list looks up its own dates. */
  nutrition: NutritionEntry[]
  unit: Unit
  today: string
  dayNames: typeof DAY_NAMES
  onEditDay: (date: string) => void
  onCopy: () => void
}

export function WeekRow({
  monday,
  weeklyLbs,
  n,
  deltaLbs,
  hasPrev,
  signColorOf,
  phase,
  open,
  onToggle,
  entries,
  weekKcal,
  nutrition,
  unit,
  today,
  dayNames,
  onEditDay,
  onCopy,
}: WeekRowProps) {
  return (
    <div style={{ marginBottom: 8, borderRadius: 14, background: 'var(--surface)', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          padding: '13px 14px',
          width: '100%',
        }}
      >
        <span style={{ font: '500 11px "IBM Plex Mono", monospace', color: 'var(--text-dim)', width: 70, textAlign: 'left' }}>
          {weekCommencingLabel(monday)}
        </span>
        <span style={{ font: '700 20px/1 "Barlow Condensed", sans-serif', color: 'var(--text-secondary)', width: 52, textAlign: 'left' }}>
          {formatWeight(weeklyLbs, unit)}
        </span>
        <span
          style={{
            font: '500 10.5px "IBM Plex Mono", monospace',
            color: weekKcal && weekKcal > 0 ? 'var(--text-dim)' : 'var(--text-muted)',
            width: 46,
            textAlign: 'right',
          }}
          title="mean daily calories"
        >
          {formatKcal(weekKcal)}
        </span>
        {/* The enclosing PhaseCard's header already states Cut/Bulk, so a folded one-week
            Deload/Maintain event is the only thing worth tagging on the row itself. */}
        {(phase.raw === 'Deload' || phase.raw === 'Maintain') && (
          <span
            style={{
              font: '600 8.5px/1 "Barlow Condensed", sans-serif',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: phase.raw === 'Deload' ? 'var(--red)' : 'var(--amber)',
            }}
          >
            {phase.raw}
          </span>
        )}
        <span style={{ flex: 1, textAlign: 'right', font: '500 11.5px "IBM Plex Mono", monospace', color: hasPrev ? SIGN_COLOR[signColorOf(deltaLbs ?? 0)] : 'var(--text-muted)' }}>
          {hasPrev ? sgn(toDisplay(deltaLbs ?? 0, unit)) : '—'}
        </span>
        <span style={{ font: '500 9px/1 "IBM Plex Mono", monospace', color: 'var(--text-disabled)', width: 14, textAlign: 'right' }}>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 12px' }}>
          <div
            style={{
              borderTop: '1px solid var(--divider)',
              paddingTop: 10,
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ font: '500 10px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
              {(phase.raw ?? 'Logged') + ' · ' + n + ' of 7 days'}
              {weekKcal && weekKcal > 0 ? `  ·  Ø ${formatKcal(weekKcal)} cal/day` : ''}
            </span>
            <button
              type="button"
              onClick={onCopy}
              style={{
                font: '600 9.5px/1 "Barlow Condensed", sans-serif',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--on-accent)',
                background: 'var(--accent)',
                padding: '5px 10px',
                borderRadius: 999,
                cursor: 'pointer',
              }}
            >
              Copy
            </button>
          </div>
          {dayNames.map((dn, di) => {
            const date = addDays(monday, di)
            const entry = entries.find((e) => e.date === date)
            const dayKcal = nutrition.find((nn) => nn.date === date)?.kcal ?? null
            const future = date > today
            const isToday = date === today
            return (
              <div
                key={date}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}
              >
                <span style={{ width: 40, font: '500 13px "IBM Plex Mono", monospace', color: isToday ? 'var(--accent)' : 'var(--text-dim)' }}>
                  {dn}
                </span>
                <span style={{ flex: 1, font: '500 13px "IBM Plex Mono", monospace', color: entry ? 'var(--text-secondary)' : 'var(--text-disabled)' }}>
                  {entry ? `${formatWeight(entry.lbs, unit)} ${unit === 'kg' ? 'kg' : 'lbs'}` : '—'}
                </span>
                <span style={{ width: 72, whiteSpace: 'nowrap', textAlign: 'right', font: '500 12px "IBM Plex Mono", monospace', color: dayKcal ? 'var(--text-dim)' : 'var(--text-disabled)' }}>
                  {dayKcal ? `${formatKcal(dayKcal)} cal` : ''}
                </span>
                {!future && (
                  <button
                    type="button"
                    onClick={() => onEditDay(date)}
                    style={{
                      font: '500 11px "IBM Plex Mono", monospace',
                      color: 'var(--accent)',
                      opacity: 0.75,
                      cursor: 'pointer',
                      paddingRight: 10, // matches the Copy pill's own inset so the text lines up
                    }}
                  >
                    {entry ? 'edit' : 'add'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
