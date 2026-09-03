import { signColor, type Direction, type SignColor, type WeeklyAverage } from '../../lib/math'

// Cyan when the week moved the right way for the phase, magenta against — distinct from the
// generic lime/red sign colours used elsewhere (StatCards, WeekRow deltas), since these bars are
// specifically the Neon forecast palette's cyan/magenta hierarchy, not the plain good/bad read.
const SIGN_COLOR: Record<SignColor, string> = {
  lime: 'var(--wchange-good)',
  red: 'var(--wchange-against)',
  grey: 'var(--text-muted)',
}

const BAR_MAX_HEIGHT = 24 // px, each direction off the zero line
const WEEKS_SHOWN = 5 // trimmed from Trends' 8 — a recent-shape cue, not a second chart

/** Signed week-over-week change, one bar per week, last 5 weeks — moved here (not copied) from
 * Trends so checking "how's this phase actually going" doesn't need a tab switch. Trimmed down
 * from Trends' original: fewer weeks and no per-bar date labels, so it reads as a compact shape
 * cue alongside the other stats rather than a second chart. Bar height is |delta|; direction
 * (above/below the zero line) is the sign; colour follows the same phase-aware good/bad rule as
 * everywhere else (signColor), not raw sign. */
export function WeeklyChangeBars({ weekly, dir }: { weekly: WeeklyAverage[]; dir: Direction }) {
  const recent = weekly.slice(-(WEEKS_SHOWN + 1))
  const deltas = recent.slice(1).map((w, i) => ({ monday: w.monday, deltaLbs: w.lbs - recent[i].lbs }))
  if (!deltas.length) return null

  const maxAbs = Math.max(0.1, ...deltas.map((d) => Math.abs(d.deltaLbs)))

  return (
    <div style={{ marginTop: 16, padding: '14px 15px', borderRadius: 14, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            font: '600 9.5px/1 "Barlow Condensed", sans-serif',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--text-dim)',
          }}
        >
          Weekly change
        </span>
        <span style={{ font: '500 10.5px "IBM Plex Mono", monospace', color: 'var(--text-dim)' }}>
          {deltas.length} weeks
        </span>
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'stretch', height: BAR_MAX_HEIGHT * 2, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'var(--divider)' }} />
        {deltas.map((d) => {
          const h = Math.max(2, (Math.abs(d.deltaLbs) / maxAbs) * BAR_MAX_HEIGHT)
          const color = SIGN_COLOR[signColor(d.deltaLbs, dir)]
          return (
            <div key={d.monday} style={{ flex: 1, position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: '25%',
                  right: '25%',
                  height: h,
                  borderRadius: 2,
                  background: color,
                  ...(d.deltaLbs >= 0 ? { bottom: '50%' } : { top: '50%' }),
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
