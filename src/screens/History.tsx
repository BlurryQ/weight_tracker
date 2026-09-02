import type { ReactNode } from 'react'
import { DAY_NAMES, fullDate, today as todayIso, weekCommencingLabel } from '../lib/dates'
import { weeklyKcal } from '../lib/energy'
import { formatWeekForClipboard, sgn, toDisplay } from '../lib/format'
import {
  currentDir,
  groupWeeksBySpan,
  phaseAt,
  phaseSpans,
  phaseTotal,
  signColor,
  weeklyAverages,
  type PhaseSpan,
  type SignColor,
  type WeeklyAverage,
} from '../lib/math'
import { useApp } from '../store/AppContext'
import type { Unit } from '../store/types'
import { WeekRow } from '../components/history/WeekRow'

const SIGN_COLOR: Record<SignColor, string> = {
  lime: 'var(--sign-good)',
  red: 'var(--sign-bad)',
  grey: 'var(--text-muted)',
}

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

/** One bordered card per Cut/Bulk span, wrapping its weeks. Deload/Maintain weeks fold into the
 * enclosing span here — no card of their own, since they're one-week events — but still surface
 * as their own tag on the individual collapsed WeekRow (see the caller). The header states the
 * phase and total, so the redundant per-row Cut/Bulk tag is dropped inside. */
function PhaseCard({
  span,
  weeks,
  isLive,
  unit,
  children,
}: {
  span: PhaseSpan
  /** Most-recent-first, matching the row order rendered below — reversed back to chronological
   * order here before any first/last/total math, or the total comes out negated. */
  weeks: WeeklyAverage[]
  isLive: boolean
  unit: Unit
  children: ReactNode
}) {
  const color = span.dir === 'Cut' ? 'var(--cut)' : 'var(--bulk)'
  const chronological = weeks.slice().reverse()
  const { changeLbs, avgRateLbs } = phaseTotal(chronological)
  const first = chronological[0]
  const last = chronological[chronological.length - 1]

  return (
    <div
      style={{
        marginTop: 24,
        padding: 14,
        borderRadius: 18,
        border: `1.5px solid color-mix(in oklch, ${color} 30%, var(--divider))`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                font: '700 15px/1 "Barlow Condensed", sans-serif',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color,
              }}
            >
              {span.dir}
            </span>
            {isLive && (
              <span
                style={{
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: color,
                  color: 'var(--on-accent)',
                  font: '700 8px/1 "Barlow Condensed", sans-serif',
                  letterSpacing: '0.1em',
                }}
              >
                LIVE
              </span>
            )}
          </div>
          <div style={{ marginTop: 4, font: '500 9.5px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
            {fullDate(first.monday)} – {isLive ? 'ongoing' : fullDate(last.monday)} · {weeks.length} wk{weeks.length === 1 ? '' : 's'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ font: '700 22px/1 "Barlow Condensed", sans-serif', color: SIGN_COLOR[signColor(changeLbs, span.dir)] }}>
            {sgn(toDisplay(changeLbs, unit))}
          </div>
          <div style={{ marginTop: 3, font: '500 9.5px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
            {sgn(toDisplay(avgRateLbs, unit), 2)} /wk
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>{children}</div>
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

  // The most recent Cut/Bulk span (phaseSpans' last entry) is the one still open-ended — its
  // card gets the LIVE pill and an "ongoing" end date instead of its last shown week's date.
  const liveSpan = phaseSpans(phaseLog).at(-1) ?? null

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

      {groups.map((group) => {
        const rows = group.weeks.map((week) => {
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
        })

        if (!group.span) return <div key="pre-tracking">{rows}</div>

        const isLive = liveSpan != null && group.span.start === liveSpan.start && group.span.dir === liveSpan.dir
        return (
          <PhaseCard key={group.span.start} span={group.span} weeks={group.weeks} isLive={isLive} unit={unit}>
            {rows}
          </PhaseCard>
        )
      })}
    </div>
  )
}
