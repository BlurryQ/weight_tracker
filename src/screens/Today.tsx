import { diffDays, mondayOf, shortDate, today as todayIso } from '../lib/dates'
import { formatWeight, sgn, toDisplay, unitLabel } from '../lib/format'
import { avg, currentDir, currentStreak, fitSlope, signColor, weeklyAverages } from '../lib/math'
import { useApp } from '../store/AppContext'
import { Chip } from '../components/ui/Chip'
import { RateBar } from './today/RateBar'
import { DayStrip } from './today/DayStrip'
import { EnergyCard } from './today/EnergyCard'
import { StatCards } from './today/StatCards'

const SIGN_COLOR = { lime: 'var(--sign-good)', red: 'var(--sign-bad)', grey: 'var(--text-muted)' } as const

const CHIP_COLORS = {
  Cut: {
    bg: 'color-mix(in oklch, var(--cut) 13%, transparent)',
    border: 'color-mix(in oklch, var(--cut) 30%, transparent)',
    dot: 'var(--cut)',
    text: 'var(--accent-text)',
  },
  Bulk: {
    bg: 'color-mix(in oklch, var(--bulk) 14%, transparent)',
    border: 'color-mix(in oklch, var(--bulk) 35%, transparent)',
    dot: 'var(--bulk)',
    text: 'var(--bulk-text)',
  },
}

export function Today() {
  const { state, dispatch } = useApp()
  const { entries, nutrition, phase, phaseStart, phaseLog, weeklyTarget, unit } = state
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
            background: 'var(--accent)',
            color: 'var(--on-accent)',
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

  const phaseWeek = Math.floor(diffDays(mondayOf(phaseStart), today) / 7) + 1
  const chipColors = CHIP_COLORS[dir]
  const streak = currentStreak(entries, today)

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
        <span style={{ font: '500 11px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>{shortDate(today)}</span>
      </div>

      <div style={{ marginTop: 8, font: '500 10px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
        <span style={{ color: 'var(--accent-text)', fontWeight: 600 }}>{streak}</span> day{streak === 1 ? '' : 's'} streak
      </div>

      <div style={{ marginTop: 16 }}>
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

      <div style={{ marginTop: 18, padding: '14px 15px', borderRadius: 14, background: 'var(--surface)' }}>
        <RateBar slopeLbs={fit4.slope} weeklyTarget={weeklyTarget} unit={unit} />
      </div>

      <div style={{ marginTop: 16 }}>
        <DayStrip entries={entries} today={today} unit={unit} />
      </div>

      <div style={{ marginTop: 16 }}>
        <StatCards
          a14={formatWeight(a14, unit)}
          a30={formatWeight(a30, unit)}
          rateLbs={fit4.slope}
          rateColor={signColor(fit4.slope, dir)}
          unit={unit}
        />
      </div>

      <EnergyCard
        entries={entries}
        nutrition={nutrition}
        phaseLog={phaseLog}
        weeklyTargetLbs={weeklyTarget}
        today={today}
      />

      <button
        type="button"
        onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'trends' })}
        style={{
          marginTop: 12,
          marginBottom: 8,
          width: '100%',
          textAlign: 'center',
          cursor: 'pointer',
          font: '500 10.5px "IBM Plex Mono", monospace',
          color: 'var(--accent)',
        }}
      >
        see where this lands, plotted → Trends
      </button>
    </div>
  )
}
