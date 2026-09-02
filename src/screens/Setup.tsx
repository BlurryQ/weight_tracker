import { useEffect, useState } from 'react'
import { healthConnectSupported, isCalorieAccessGranted, requestCalorieAccess, syncHealthConnect } from '../data/healthConnect'
import { dayLabel, diffDays, fullDate, mondayOf, today as todayIso } from '../lib/dates'
import { sgn, toDisplay, toLbs, unitLabel } from '../lib/format'
import { currentDir, type PhaseName } from '../lib/math'
import { useApp } from '../store/AppContext'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Stepper } from '../components/ui/Stepper'

// Deload is never a standing phase — it only ever makes sense as the one-week tag below, so it's
// not in this grid. Maintain still belongs here too: a genuine maintenance block (weeks, this
// grid) is a different thing from a single maintenance week folded into a Cut/Bulk (the tag row).
const PHASES: { name: PhaseName; hint: string }[] = [
  { name: 'Cut', hint: 'deficit, lose steady' },
  { name: 'Bulk', hint: 'surplus, gain slow' },
  { name: 'Maintain', hint: 'hold steady' },
]

function sectionLabel(text: string) {
  return (
    <div
      style={{
        font: '600 9.5px/1 "Barlow Condensed", sans-serif',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: 'var(--text-dim)',
      }}
    >
      {text}
    </div>
  )
}

function DataStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div
        style={{
          font: '600 9px/1 "Barlow Condensed", sans-serif',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--text-dim)',
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 5, font: '700 18px/1 "Barlow Condensed", sans-serif', color: 'var(--text-secondary)' }}>
        {value}
      </div>
    </div>
  )
}

export function Setup() {
  const { state, dispatch } = useApp()
  const { phase, phaseStart, phaseLog, weeklyTarget, unit, entries, nutrition } = state
  const today = todayIso()
  const dir = currentDir(phase, phaseLog)
  const phaseWeek = Math.floor(diffDays(mondayOf(phaseStart), today) / 7) + 1

  const [calories, setCalories] = useState<'unknown' | 'connected' | 'disconnected' | 'connecting'>('unknown')
  useEffect(() => {
    if (!healthConnectSupported()) return
    void isCalorieAccessGranted().then((ok) => setCalories(ok ? 'connected' : 'disconnected'))
  }, [])

  async function connectCalories() {
    setCalories('connecting')
    const ok = await requestCalorieAccess()
    setCalories(ok ? 'connected' : 'disconnected')
    if (ok) {
      dispatch({ type: 'SHOW_TOAST', message: 'Health Connect linked — pulling calories' })
      void syncHealthConnect(nutrition, dispatch)
    }
  }

  function stepTarget(direction: 1 | -1) {
    const step = unit === 'kg' ? 0.1 : 0.25
    const newDisplay = toDisplay(weeklyTarget, unit) + direction * step
    const newLbs = Math.round(toLbs(newDisplay, unit) * 10000) / 10000
    dispatch({ type: 'SET_WEEKLY_TARGET', value: Math.max(-2, Math.min(2, newLbs)) })
  }

  return (
    <div style={{ padding: '0 20px' }}>
      <span
        style={{
          font: '700 25px/1 "Barlow Condensed", sans-serif',
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          color: 'var(--text-primary)',
        }}
      >
        Setup
      </span>

      <div style={{ marginTop: 20 }}>
        {sectionLabel('Current phase')}
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {PHASES.map((p) => {
            const selected = phase === p.name
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  dispatch({ type: 'SET_PHASE', phase: p.name })
                  dispatch({ type: 'SHOW_TOAST', message: `${p.name} started — week 1` })
                }}
                style={{
                  cursor: 'pointer',
                  padding: '13px 14px',
                  borderRadius: 14,
                  background: selected ? 'color-mix(in oklch, var(--accent) 12%, transparent)' : 'var(--surface)',
                  border: selected ? '1.5px solid var(--accent)' : '1.5px solid var(--surface)',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    font: '700 16px/1.2 "Barlow Condensed", sans-serif',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: selected ? 'var(--accent-text)' : 'var(--text-secondary)',
                  }}
                >
                  {p.name}
                </div>
                <div style={{ marginTop: 4, font: '500 9.5px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
                  {p.hint}
                </div>
              </button>
            )
          })}
        </div>

        <div style={{ marginTop: 10, font: '500 10px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
          or tag just this week, without resetting the phase:
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
          {(['Deload', 'Maintain'] as const).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                dispatch({ type: 'LOG_FOLDED_WEEK', name })
                dispatch({ type: 'SHOW_TOAST', message: `${name} logged for this week` })
              }}
              style={{
                flex: 1,
                cursor: 'pointer',
                padding: '8px 12px',
                borderRadius: 999,
                border: '1px dashed var(--chart-marker)',
                background: 'transparent',
                font: '600 10px/1 "Barlow Condensed", sans-serif',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--text-dim)',
              }}
            >
              Log {name.toLowerCase()} week
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 20, padding: '14px 15px', borderRadius: 14, background: 'var(--surface)' }}>
        {sectionLabel('Weekly target')}
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ font: '700 25px/1 "Barlow Condensed", sans-serif', color: 'var(--accent)' }}>
            {sgn(toDisplay(weeklyTarget, unit), 2)} {unitLabel(unit)}/wk
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Stepper size={42} onDecrement={() => stepTarget(-1)} onIncrement={() => stepTarget(1)} />
          </div>
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 12 }}>
          {sectionLabel('Current week')}
          <span style={{ marginLeft: 'auto', font: '700 25px/1 "Barlow Condensed", sans-serif', color: 'var(--text-secondary)' }}>
            {phaseWeek}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Stepper
              size={42}
              disabled={phaseWeek <= 1 ? 'down' : null}
              onDecrement={() => dispatch({ type: 'SET_PHASE_WEEK', week: phaseWeek - 1 })}
              onIncrement={() => dispatch({ type: 'SET_PHASE_WEEK', week: phaseWeek + 1 })}
            />
          </div>
        </div>

        <div style={{ marginTop: 8, font: '500 10px/1.5 "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
          Week {phaseWeek} of this {phase.toLowerCase()}, started {dayLabel(phaseStart)}. Deloads and maintenance weeks
          stay inside the {dir.toLowerCase()} on the chart. Adjust the week directly if it drifts — e.g. right after
          picking up a phase already in progress.
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          dispatch({ type: 'RESTART_PHASE' })
          dispatch({ type: 'SHOW_TOAST', message: `${phase} started — week 1` })
        }}
        style={{
          marginTop: 8,
          width: '100%',
          cursor: 'pointer',
          padding: '13px 15px',
          borderRadius: 14,
          border: '1px dashed var(--chart-marker)',
          background: 'transparent',
          font: '500 11px "IBM Plex Mono", monospace',
          color: 'var(--text-muted)',
          textAlign: 'center',
        }}
      >
        Start this phase again from today (resets week count)
      </button>

      <div style={{ marginTop: 20, padding: '14px 15px', borderRadius: 14, background: 'var(--surface)' }}>
        {sectionLabel('Calories')}
        {healthConnectSupported() ? (
          <>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ font: '700 16px/1.2 "Barlow Condensed", sans-serif', letterSpacing: '0.04em', textTransform: 'uppercase', color: calories === 'connected' ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
                {calories === 'connected' ? 'Connected' : 'Not connected'}
              </span>
              {calories !== 'connected' && (
                <button
                  type="button"
                  onClick={connectCalories}
                  disabled={calories === 'connecting'}
                  style={{
                    marginLeft: 'auto',
                    cursor: 'pointer',
                    padding: '9px 16px',
                    borderRadius: 999,
                    background: 'var(--accent)',
                    color: 'var(--on-accent)',
                    font: '700 11px/1 "Barlow Condensed", sans-serif',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                  }}
                >
                  {calories === 'connecting' ? 'Requesting…' : 'Connect'}
                </button>
              )}
            </div>
            <div style={{ marginTop: 8, font: '500 10px/1.5 "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
              Reads your daily calorie totals from Health Connect, which MyFitnessPal writes to.
              Powers maintenance and target-intake on Trends, and the per-day figures in History.
            </div>
          </>
        ) : (
          <div style={{ marginTop: 8, font: '500 10px/1.5 "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
            Android only — calories sync from MyFitnessPal through Health Connect, which isn't
            available on this platform.
          </div>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        {sectionLabel('Display unit')}
        <div style={{ marginTop: 10 }}>
          <SegmentedControl
            value={unit}
            onChange={(u) => dispatch({ type: 'SET_UNIT', unit: u })}
            options={[
              { value: 'lb', label: 'Pounds' },
              { value: 'kg', label: 'Kilos' },
            ]}
          />
        </div>
      </div>

      <div style={{ marginTop: 10, marginBottom: 20, padding: '14px 15px', borderRadius: 14, background: 'var(--surface)' }}>
        {sectionLabel('Data')}
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <DataStat label="Weigh-ins" value={String(entries.length)} />
          <DataStat label="Since" value={entries[0] ? fullDate(entries[0].date) : '—'} />
          <DataStat label="Calorie days" value={String(nutrition.length)} />
        </div>
        {/* SOURCE ROW SLOT — e9 firms up the calorie-days wording and adds a "source" row here
            (Health Connect / MyFitnessPal), once that lands. */}
        <div style={{ marginTop: 10, font: '500 10px/1.5 "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
          Synced to Supabase when online, cached locally otherwise.
        </div>
      </div>
    </div>
  )
}
