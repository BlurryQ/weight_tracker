import { useState } from 'react'
import { today as todayIso } from '../../lib/dates'
import { sgn } from '../../lib/format'
import { estimateMaintenance } from '../../lib/energy'
import { DEFAULT_STALL_THRESHOLD_PCT, detectPlateau, weeklyAverages } from '../../lib/math'
import { useApp } from '../../store/AppContext'

// Lab module #7 — plateau / stall detection. Pure reuse of math.ts (weeklyAverages + fitSlope,
// via detectPlateau); estimateMaintenance is called only to sanity-check that the person is
// actually in a deficit/surplus on paper. Raw numbers only — no "N weeks before it flags"
// persistence layer, that decision is what this page is for.

const MONO = '"IBM Plex Mono", monospace'
const COND = '"Barlow Condensed", sans-serif'

// Step the noise floor in 0.02 %/wk increments over a 0–0.30 %/wk range — wide enough to bracket
// every realistic setting while tuning.
const PCT_STEP = 0.0002
const PCT_MIN = 0
const PCT_MAX = 0.003

function label(text: string) {
  return (
    <div style={{ font: `600 9px/1 ${COND}`, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
      {text}
    </div>
  )
}

function Stat({ name, value, color }: { name: string; value: string; color?: string }) {
  return (
    <div style={{ flex: 1 }}>
      {label(name)}
      <div style={{ marginTop: 5, font: `700 18px/1 ${COND}`, color: color ?? 'var(--text-secondary)' }}>{value}</div>
    </div>
  )
}

function Bool({ name, on }: { name: string; on: boolean | null }) {
  const text = on == null ? '—' : on ? 'YES' : 'no'
  const color = on == null ? 'var(--text-muted)' : on ? 'var(--sign-bad)' : 'var(--text-secondary)'
  return (
    <div style={{ flex: 1 }}>
      {label(name)}
      <div style={{ marginTop: 5, font: `700 15px/1 ${COND}`, letterSpacing: '0.06em', color }}>{text}</div>
    </div>
  )
}

export function PlateauModule() {
  const { state } = useApp()
  const { entries, nutrition, phaseLog } = state
  const today = todayIso()

  const [thresholdPct, setThresholdPct] = useState(DEFAULT_STALL_THRESHOLD_PCT)

  const weekly = weeklyAverages(entries)
  const est = estimateMaintenance(entries, nutrition, phaseLog, today)
  const bodyWeightLbs = weekly.length ? weekly[weekly.length - 1].lbs : (entries.length ? entries[entries.length - 1].lbs : 0)

  const res = detectPlateau({
    weekly,
    avgIntake: est.meanIntake,
    maintenance: est.maintenance,
    bodyWeightLbs,
    stallThresholdPct: thresholdPct,
  })

  const stepPct = (dir: 1 | -1) =>
    setThresholdPct((p) => Math.round(Math.min(PCT_MAX, Math.max(PCT_MIN, p + dir * PCT_STEP)) * 1e6) / 1e6)

  const rate = (n: number | null) => (n == null ? '—' : `${sgn(n, 2)}`)
  const rateColor = (n: number | null) =>
    n == null ? undefined : Math.abs(n) < res.stallThreshold ? 'var(--text-muted)' : 'var(--text-secondary)'

  return (
    <div>
      {res.kind === 'insufficient' ? (
        <div style={{ font: `500 11px/1.6 ${MONO}`, color: 'var(--text-dim)' }}>{res.note}</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <Stat name="Recent rate" value={`${rate(res.recentRate)}/wk`} color={rateColor(res.recentRate)} />
            <Stat name="Prior rate" value={`${rate(res.priorRate)}/wk`} color={rateColor(res.priorRate)} />
            <Stat name="Threshold" value={`${res.stallThreshold.toFixed(3)}/wk`} />
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Bool name="Rate flat?" on={res.rateIsFlat} />
            <Bool name="Dieting?" on={res.activelyDieting} />
            <Bool name="Stalled?" on={res.stalled} />
          </div>

          <div style={{ marginTop: 10, font: `500 10px/1.6 ${MONO}`, color: 'var(--text-dim)' }}>{res.note}</div>
        </>
      )}

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--divider)' }}>
        {label('Inputs')}
        <div style={{ marginTop: 6, font: `500 10px/1.7 ${MONO}`, color: 'var(--text-dim)' }}>
          bodyweight <span style={{ color: 'var(--text-secondary)' }}>{bodyWeightLbs ? bodyWeightLbs.toFixed(1) : '—'} lb</span>
          {'  ·  '}maintenance{' '}
          <span style={{ color: 'var(--text-secondary)' }}>{est.maintenance != null ? `${est.maintenance} (${est.kind})` : `— (${est.kind})`}</span>
          <br />
          mean intake <span style={{ color: 'var(--text-secondary)' }}>{est.meanIntake != null ? `${est.meanIntake} cal/day` : '—'}</span>
          {'  ·  '}gap vs maint{' '}
          <span style={{ color: 'var(--text-secondary)' }}>{res.intakeGap != null ? `${sgn(res.intakeGap, 0)} cal/day` : '—'}</span>
        </div>
      </div>

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          {label('Stall threshold')}
          <div style={{ marginTop: 5, font: `700 16px/1 ${COND}`, color: 'var(--accent)' }}>
            {(thresholdPct * 100).toFixed(2)} %bw/wk
          </div>
          <div style={{ marginTop: 4, font: `500 9px/1.4 ${MONO}`, color: 'var(--text-dim)' }}>
            = {res.stallThreshold.toFixed(3)} lb/wk at current bodyweight
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {([-1, 1] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              onClick={() => stepPct(dir)}
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
