import type { ReactNode } from 'react'
import { useApp } from '../store/AppContext'
import { AdherenceModule } from './lab/AdherenceModule'
import { MaintenanceTrendModule } from './lab/MaintenanceTrendModule'
import { PlateauModule } from './lab/PlateauModule'

// The Lab screen — a staging area for analytics that aren't ready to graduate to their real
// home on Today/Trends. Reached from a row on Setup, not a nav tab. Three numbered module
// slots, numbered to match the design conversation (6 logging-accuracy, 7 plateau, 8 metabolic
// adaptation). Everything is computed live from useApp() — no new persistence for this page.

const COND = '"Barlow Condensed", sans-serif'
const MONO = '"IBM Plex Mono", monospace'

/** One module card. Slot 7's header is drawn here; slots 6 and 8 use `bare` because
 * AdherenceModule / MaintenanceTrendModule each carry their own matching number+title header
 * internally (per Energy Lab's brief) — a shared header row here would double it. */
function Slot({ n, title, bare, children }: { n?: string; title?: string; bare?: boolean; children: ReactNode }) {
  return (
    <section style={{ marginTop: 14, padding: '14px 15px', borderRadius: 14, background: 'var(--surface)' }}>
      {!bare && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ font: `700 15px/1 ${COND}`, color: 'var(--accent)' }}>{n}</span>
          <span
            style={{
              font: `600 9px/1 ${COND}`,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
            }}
          >
            {title}
          </span>
        </div>
      )}
      <div style={bare ? undefined : { marginTop: 12 }}>{children}</div>
    </section>
  )
}

export function Lab() {
  const { dispatch } = useApp()

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <button
        type="button"
        onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'setup' })}
        style={{
          cursor: 'pointer',
          background: 'transparent',
          border: 'none',
          padding: 0,
          font: `500 10px/1 ${MONO}`,
          color: 'var(--text-dim)',
        }}
      >
        ← Setup
      </button>

      <div style={{ marginTop: 10 }}>
        <span
          style={{
            font: `700 25px/1 ${COND}`,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            color: 'var(--text-primary)',
          }}
        >
          Lab
        </span>
      </div>

      <div style={{ marginTop: 8, font: `500 10px/1.6 ${MONO}`, color: 'var(--text-dim)' }}>
        Staging for new analytics. Raw numbers, no alerting — validating these before they move to
        Today or Trends.
      </div>

      <Slot bare>
        <AdherenceModule />
      </Slot>

      <Slot n="7" title="Plateau detection">
        <PlateauModule />
      </Slot>

      <Slot bare>
        <MaintenanceTrendModule />
      </Slot>
    </div>
  )
}
