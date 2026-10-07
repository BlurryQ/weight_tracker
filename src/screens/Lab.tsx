import { useApp } from '../store/AppContext'

// The Lab screen — a staging area for analytics that aren't ready to graduate to their real
// home on Today/Trends. Reached from a row on Setup, not a nav tab. Everything that was staged
// here (#8 metabolic adaptation + the current-window breakdown behind it) has graduated to
// Trends' Energy mode — see src/screens/trends/. Lab itself stays alive, empty, ready for
// whatever experiment comes next.

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
        Staging for new analytics.
      </div>

      <section style={{ marginTop: 14, padding: '14px 15px', borderRadius: 14, background: 'var(--surface)' }}>
        <div style={{ font: `500 11px/1.6 ${MONO}`, color: 'var(--text-dim)' }}>
          Nothing staged right now — validated features graduate to Today or Trends. This is
          where the next one starts.
        </div>
      </section>
    </div>
  )
}
