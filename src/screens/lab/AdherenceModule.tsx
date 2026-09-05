import { useState } from 'react'
import { dayLabel, shortDate, today as todayIso, weekCommencingLabel } from '../../lib/dates'
import { sgn } from '../../lib/format'
import { computeAdherence, type AdherenceCalc, type AdherenceLive } from '../../lib/energy'
import { weeklyAverages } from '../../lib/math'
import { useApp } from '../../store/AppContext'

// Lab module #6 — logging accuracy / adherence. Logged intake implies a weight-change rate;
// compare it to the measured trend rate. The reference maintenance is never taken from the
// window under evaluation (that collapses the prediction into estimateMaintenance's own
// identity — divergence would always read ~0). Two disjoint reference sources computed side by
// side: calc1 = nearest previously-gated raw window, calc2 = the #8 rolling series' gated point
// nearest the current window start. Selection rule tags one LIVE. Raw numbers only — no
// persistence / threshold / badge layer yet; that's what watching these is for.

const MONO = '"IBM Plex Mono", monospace'
const COND = '"Barlow Condensed", sans-serif'

const WEEKS_MIN = 3
const WEEKS_MAX = 8

function label(text: string) {
  return (
    <div style={{ font: `600 9px/1 ${COND}`, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
      {text}
    </div>
  )
}

function divColor(d: number) {
  return Math.abs(d) < 0.15 ? 'var(--text-muted)' : Math.abs(d) < 0.5 ? 'var(--text-secondary)' : 'var(--sign-bad)'
}

function CalcCard({ tag, live, calc }: { tag: string; live: boolean; calc: AdherenceCalc }) {
  const ref = calc.reference
  return (
    <div
      style={{
        marginTop: 10,
        padding: '10px 11px',
        borderRadius: 10,
        border: `1px solid ${live ? 'color-mix(in oklch, var(--accent) 45%, transparent)' : 'var(--divider)'}`,
        background: live ? 'color-mix(in oklch, var(--accent) 7%, transparent)' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ font: `700 11px/1 ${COND}`, letterSpacing: '0.12em', color: 'var(--text-secondary)' }}>{tag}</span>
        {live && (
          <span
            style={{
              font: `700 8px/1 ${COND}`,
              letterSpacing: '0.18em',
              padding: '3px 5px',
              borderRadius: 4,
              background: 'var(--accent)',
              color: 'var(--on-accent)',
            }}
          >
            LIVE
          </span>
        )}
        <span style={{ marginLeft: 'auto', font: `500 9px/1 ${MONO}`, color: 'var(--text-dim)' }}>
          {ref.source === 'maintenance-series' ? 'rolling series' : 'nearest gated window'}
        </span>
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          {label('Predicted')}
          <div style={{ marginTop: 4, font: `700 16px/1 ${COND}`, color: 'var(--text-secondary)' }}>{sgn(calc.predictedRate, 2)}/wk</div>
        </div>
        <div style={{ flex: 1 }}>
          {label('Actual')}
          <div style={{ marginTop: 4, font: `700 16px/1 ${COND}`, color: 'var(--text-secondary)' }}>{sgn(calc.actualRate, 2)}/wk</div>
        </div>
        <div style={{ flex: 1 }}>
          {label('Divergence')}
          <div style={{ marginTop: 4, font: `700 16px/1 ${COND}`, color: divColor(calc.divergence) }}>{sgn(calc.divergence, 2)}/wk</div>
        </div>
      </div>

      <div style={{ marginTop: 8, font: `500 9.5px/1.6 ${MONO}`, color: 'var(--text-dim)' }}>
        ref maint <span style={{ color: 'var(--text-secondary)' }}>{Math.round(ref.maintenance)}</span> @ {weekCommencingLabel(ref.date)}
        {'  ·  '}intake <span style={{ color: 'var(--text-secondary)' }}>{Math.round(calc.avgLoggedIntake)}</span>
        {'  ·  '}{calc.kcalPerLb}/lb
      </div>
    </div>
  )
}

/** Divergence for the last several rolling windows, as a baseline-anchored bar row — lets a
 * persistent lean (3+ windows the same side of zero) be spotted without a threshold layer. */
function DivergenceHistory({ points }: { points: { date: string; divergence: number }[] }) {
  if (!points.length) return null
  const recent = points.slice(-8)
  const max = Math.max(0.2, ...recent.map((p) => Math.abs(p.divergence)))

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--divider)' }}>
      {label(`Divergence history · last ${recent.length}`)}
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'stretch', gap: 4, height: 56 }}>
        {recent.map((p) => {
          const up = p.divergence >= 0
          const frac = Math.abs(p.divergence) / max
          return (
            <div key={p.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                {up && <div style={{ height: `${frac * 50}%`, background: divColor(p.divergence), borderRadius: '2px 2px 0 0' }} />}
              </div>
              <div style={{ height: 1, width: '100%', background: 'var(--text-disabled)' }} />
              <div style={{ flex: 1, width: '100%' }}>
                {!up && <div style={{ height: `${frac * 50}%`, background: divColor(p.divergence), borderRadius: '0 0 2px 2px' }} />}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 6, font: `500 9px/1.5 ${MONO}`, color: 'var(--text-dim)' }}>
        {recent.map((p) => `${shortDate(p.date)} ${sgn(p.divergence, 2)}`).join('   ')}
      </div>
    </div>
  )
}

export function AdherenceModule() {
  const { state } = useApp()
  const { entries, nutrition, phaseLog } = state
  const today = todayIso()

  const [trendWeeks, setTrendWeeks] = useState(4)

  const weekly = weeklyAverages(entries)
  const res = computeAdherence(entries, nutrition, phaseLog, weekly, today, { trendWeeks })

  const stepWeeks = (dir: 1 | -1) => setTrendWeeks((w) => Math.min(WEEKS_MAX, Math.max(WEEKS_MIN, w + dir)))

  const calcs: { key: AdherenceLive; tag: string; calc: AdherenceCalc | null }[] = [
    { key: 'calc1', tag: 'CALC 1', calc: res.calc1 },
    { key: 'calc2', tag: 'CALC 2', calc: res.calc2 },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ font: `700 15px/1 ${COND}`, color: 'var(--accent)' }}>6</span>
        <span style={{ font: `600 9px/1 ${COND}`, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
          Logging accuracy
        </span>
      </div>

      {!res.applicable ? (
        <div style={{ marginTop: 10, font: `500 11px/1.6 ${MONO}`, color: 'var(--text-dim)' }}>
          {res.note}
          <br />
          Needs one earlier plausibility-gated window to compare against — recurs after any lapse
          that breaks the chain, not just on day one.
        </div>
      ) : (
        <>
          <div style={{ marginTop: 8, font: `500 10px/1.6 ${MONO}`, color: 'var(--text-dim)' }}>{res.note}</div>
          {calcs.map(({ key, tag, calc }) =>
            calc ? (
              <CalcCard key={key} tag={tag} live={res.live === key} calc={calc} />
            ) : (
              <div
                key={key}
                style={{
                  marginTop: 10,
                  padding: '10px 11px',
                  borderRadius: 10,
                  border: '1px dashed var(--divider)',
                  font: `500 10px/1.5 ${MONO}`,
                  color: 'var(--text-muted)',
                }}
              >
                {tag} — {key === 'calc2' ? 'needs 2+ gated points in the rolling series' : 'no gated prior window'}
              </div>
            ),
          )}
        </>
      )}

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--divider)', font: `500 10px/1.7 ${MONO}`, color: 'var(--text-dim)' }}>
        {label('Current window')}
        <div style={{ marginTop: 6 }}>
          {dayLabel(res.currentEst.windowStart)} → {dayLabel(today)} <span style={{ color: 'var(--text-muted)' }}>(rolling, not week-aligned)</span>
          {'  ·  '}<span style={{ color: 'var(--text-secondary)' }}>{res.currentEst.kind}</span>
          {'  ·  '}maint{' '}
          <span style={{ color: 'var(--text-secondary)' }}>
            {res.currentEst.maintenance != null ? res.currentEst.maintenance : '—'}
          </span>
          {'  ·  '}intake{' '}
          <span style={{ color: 'var(--text-secondary)' }}>
            {res.currentEst.meanIntake != null ? res.currentEst.meanIntake : '—'}
          </span>
        </div>
      </div>

      <DivergenceHistory points={res.divergenceHistory} />

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          {label('Trend rate window')}
          <div style={{ marginTop: 5, font: `700 16px/1 ${COND}`, color: 'var(--accent)' }}>
            {trendWeeks} <span style={{ font: `500 9px/1 ${MONO}`, color: 'var(--text-dim)' }}>weekly points</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {([-1, 1] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              onClick={() => stepWeeks(dir)}
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                cursor: 'pointer',
                border: '1px solid var(--divider)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                font: `700 16px/1 ${COND}`,
              }}
            >
              {dir === 1 ? '+' : '−'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
