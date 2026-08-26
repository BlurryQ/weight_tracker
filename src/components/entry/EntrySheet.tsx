import { dayLabel, today as todayIso } from '../../lib/dates'
import { formatWeight, toLbs, unitLabel } from '../../lib/format'
import { weeklyAverages } from '../../lib/math'
import { useApp } from '../../store/AppContext'
import { Keypad } from './Keypad'

export function EntrySheet() {
  const { state, dispatch } = useApp()
  const { sheet, keypadValue, entries, unit } = state

  if (!sheet) return null
  const sheetKey: string = sheet // narrowed once, non-null — safe to close over in nested handlers below

  const today = todayIso()
  const isTarget = sheetKey === 'target'
  const U = unitLabel(unit)

  const title = isTarget ? 'Target weight' : sheetKey === today ? 'This morning' : dayLabel(sheetKey)
  const fieldLabel = isTarget ? 'Reach this weight' : 'Weight'

  const lastEntry = entries.filter((e) => e.date < today).slice(-1)[0]
  const weekly = weeklyAverages(entries)
  const current = weekly.length ? weekly[weekly.length - 1].lbs : 0
  const hint = isTarget
    ? `now ${formatWeight(current, unit)} ${U}`
    : `yesterday ${formatWeight(lastEntry ? lastEntry.lbs : null, unit)} ${U}`

  const canDelete = !isTarget && entries.some((e) => e.date === sheetKey)
  const hasValue = keypadValue.length > 0
  const saveLabel = hasValue ? (isTarget ? 'Set target' : 'Save') : 'Enter a weight'

  function close() {
    dispatch({ type: 'CLOSE_SHEET' })
  }

  function tap(key: string) {
    dispatch({ type: 'TAP_KEY', key })
  }

  function save() {
    const v = parseFloat(keypadValue)
    if (Number.isNaN(v)) return
    const lbs = toLbs(v, unit)
    if (isTarget) {
      dispatch({ type: 'SAVE_TARGET', value: lbs })
      dispatch({ type: 'SHOW_TOAST', message: `Target ${v.toFixed(1)} ${U}` })
      return
    }
    dispatch({ type: 'SAVE_ENTRY', date: sheetKey, lbs })
    const message = sheetKey === today ? `Logged ${v.toFixed(1)} ${U}` : `Updated ${dayLabel(sheetKey)} · ${v.toFixed(1)} ${U}`
    dispatch({ type: 'SHOW_TOAST', message })
  }

  function remove() {
    if (isTarget) return
    dispatch({ type: 'DELETE_ENTRY', date: sheetKey })
    dispatch({ type: 'SHOW_TOAST', message: `Cleared ${dayLabel(sheetKey)}` })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      <div
        onClick={close}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.62)' }}
      />
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 0,
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: 430,
          background: 'var(--surface)',
          borderRadius: '26px 26px 0 0',
          padding: '14px 20px 34px',
        }}
      >
        <div style={{ width: 38, height: 4, borderRadius: 3, background: 'var(--chart-marker)', margin: '0 auto 14px' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              font: '700 25px/1 "Barlow Condensed", sans-serif',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </span>
          <button type="button" onClick={close} style={{ font: '500 11px "IBM Plex Mono", monospace', color: 'var(--text-dim)', cursor: 'pointer' }}>
            close
          </button>
        </div>

        <div
          style={{
            marginTop: 14,
            padding: '14px 16px 16px',
            borderRadius: 14,
            background: 'var(--bg)',
            border: '1.5px solid var(--lime)',
          }}
        >
          <div
            style={{
              font: '600 9px/1 "Barlow Condensed", sans-serif',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
            }}
          >
            {fieldLabel}
          </div>
          <div
            style={{
              marginTop: 8,
              font: '700 46px/1 "Barlow Condensed", sans-serif',
              color: hasValue ? 'var(--text-primary)' : 'var(--text-disabled)',
            }}
          >
            {hasValue ? keypadValue : '—'}
          </div>
        </div>

        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ font: '500 10px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>{hint}</span>
          {canDelete && (
            <button type="button" onClick={remove} style={{ font: '500 10px "IBM Plex Mono", monospace', color: '#8a6a6a', cursor: 'pointer' }}>
              clear this day
            </button>
          )}
        </div>

        <Keypad onTap={tap} />

        <button
          type="button"
          onClick={save}
          disabled={!hasValue}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '15px 0',
            borderRadius: 999,
            background: hasValue ? 'var(--lime)' : 'var(--raised)',
            color: hasValue ? '#0b0c0b' : 'var(--text-dim)',
            font: '700 13px/1 "Barlow Condensed", sans-serif',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            cursor: hasValue ? 'pointer' : 'default',
          }}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  )
}
