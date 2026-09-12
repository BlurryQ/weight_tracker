import { useApp } from '../store/AppContext'
import { CurrentWindowModule } from './lab/CurrentWindowModule'
import { MaintenanceTrendModule } from './lab/MaintenanceTrendModule'

// The Lab screen — a staging area for analytics that aren't ready to graduate to their real
// home on Today/Trends. Reached from a row on Setup, not a nav tab. Numbered to match the
// design conversation — #8 metabolic adaptation is what's left; #6 logging-accuracy and #7
// plateau detection were both tried and dropped, see git history. Everything is computed live
// from useApp() — no new persistence for this page.

const MONO = '"IBM Plex Mono", monospace'
const COND = '"Barlow Condensed", sans-serif'

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

      <section style={{ marginTop: 14, padding: '14px 15px', borderRadius: 14, background: 'var(--surface)' }}>
        <CurrentWindowModule />
      </section>

      <section style={{ marginTop: 14, padding: '14px 15px', borderRadius: 14, background: 'var(--surface)' }}>
        <MaintenanceTrendModule />
      </section>
    </div>
  )
}
