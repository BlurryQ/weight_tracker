import { describe, expect, it } from 'vitest'
import { addDays } from '../src/lib/dates'
import {
  estimateMaintenance,
  intakeAdjustment,
  targetIntake,
  weeklyKcal,
  type NutritionEntry,
} from '../src/lib/energy'
import type { Entry, PhaseLogEntry } from '../src/lib/math'

const TODAY = '2026-08-28'

/** `days` of data ending on TODAY: weight falling at a steady `lbsPerWeek`, a flat `kcal`
 * logged every day. A clean, noise-free scenario so the arithmetic is checkable by hand. */
function scenario(days: number, opts: { start: number; lbsPerWeek: number; kcal: number }) {
  const entries: Entry[] = []
  const nutrition: NutritionEntry[] = []
  for (let i = 0; i < days; i++) {
    const date = addDays(TODAY, -(days - 1 - i))
    entries.push({ date, lbs: opts.start + (i * opts.lbsPerWeek) / 7 })
    nutrition.push({ date, kcal: opts.kcal })
  }
  return { entries, nutrition }
}

describe('estimateMaintenance', () => {
  it('solves TDEE from intake and the fitted weight trend', () => {
    const { entries, nutrition } = scenario(28, { start: 185, lbsPerWeek: -0.5, kcal: 2000 })
    const est = estimateMaintenance(entries, nutrition, [], TODAY)

    expect(est.kind).toBe('ok')
    // eating 2000 while losing 0.5 lb/wk (a 250 kcal/day deficit) => maintenance ≈ 2250
    expect(est.maintenance).toBe(2250)
    expect(est.meanIntake).toBe(2000)
    expect(est.weightChangeLbs).toBeCloseTo((-0.5 / 7) * 27, 6)
    expect(est.r2).toBeCloseTo(1, 6)
  })

  it('flags too little food logging without inventing a number', () => {
    const { entries } = scenario(28, { start: 185, lbsPerWeek: -0.5, kcal: 2000 })
    const nutrition = scenario(10, { start: 185, lbsPerWeek: -0.5, kcal: 2000 }).nutrition
    const est = estimateMaintenance(entries, nutrition, [], TODAY)

    expect(est.kind).toBe('insufficient')
    expect(est.maintenance).toBeNull()
    expect(est.calorieDays).toBe(10)
  })

  it('marks an implausible estimate unreliable but still returns it', () => {
    const { entries, nutrition } = scenario(28, { start: 185, lbsPerWeek: -0.5, kcal: 5000 })
    const est = estimateMaintenance(entries, nutrition, [], TODAY)

    expect(est.kind).toBe('unreliable')
    expect(est.maintenance).toBe(5250)
  })

  it('costs weight gained on a bulk at the lower gain density', () => {
    const { entries, nutrition } = scenario(28, { start: 175, lbsPerWeek: 0.5, kcal: 3000 })
    const phaseLog: PhaseLogEntry[] = [{ start: '2026-06-01', name: 'Bulk' }]
    const est = estimateMaintenance(entries, nutrition, phaseLog, TODAY)

    expect(est.kind).toBe('ok')
    // gaining 0.5 lb/wk eating 3000: gain costed at 3100/lb, not 3500 => ~2780 (flat 3500 => 2750)
    expect(est.maintenance).toBe(2780)
  })

  it('picks the density from the logged phase, not the sign of the scale trend', () => {
    // Bulk phase, but the scale is drifting down this window (water/glycogen still settling
    // after switching in). A scale-sign rule would wrongly use the fat/loss density.
    const { entries, nutrition } = scenario(28, { start: 180, lbsPerWeek: -0.1, kcal: 3200 })
    const phaseLog: PhaseLogEntry[] = [{ start: '2026-06-01', name: 'Bulk' }]
    const est = estimateMaintenance(entries, nutrition, phaseLog, TODAY)

    // 3100/lb (gain) => 3240; a scale-sign choice would use 3500/lb (loss) and give 3250
    expect(est.maintenance).toBe(3240)
  })

  it('does not average across a Cut/Bulk phase boundary', () => {
    const { entries, nutrition } = scenario(28, { start: 185, lbsPerWeek: -0.5, kcal: 2000 })
    const phaseLog: PhaseLogEntry[] = [
      { start: '2026-06-01', name: 'Bulk' },
      { start: '2026-08-15', name: 'Cut' },
    ]
    const est = estimateMaintenance(entries, nutrition, phaseLog, TODAY)

    // phase spans are ISO-week granular, so an Aug 15 (Sat) change clamps the window to its
    // Monday, Aug 10 — 19 days of data, span 18 — not the raw Aug 1 window start.
    expect(est.kind).toBe('ok')
    expect(est.windowDays).toBe(18)
    expect(est.calorieDays).toBe(19)
  })
})

describe('targetIntake / intakeAdjustment', () => {
  it('shifts maintenance by the weekly goal in daily kcal, at the goal-direction density', () => {
    expect(targetIntake(2500, -1)).toBe(2000) // cut goal: fat density (3500/lb) -> -500/day
    expect(targetIntake(2500, 0)).toBe(2500)
    expect(targetIntake(3000, 0.5)).toBe(3220) // gain goal: 3100/lb -> +~221/day (flat 3500 => 3250)
    expect(targetIntake(3000, 1)).toBe(3440)
  })

  it('reports how far recent intake sits from target', () => {
    const { entries, nutrition } = scenario(28, { start: 185, lbsPerWeek: -0.5, kcal: 2000 })
    const est = estimateMaintenance(entries, nutrition, [], TODAY)
    // maintenance 2250, target for -1 lb/wk is 1750, eating 2000 => 250 over
    expect(intakeAdjustment(est, -1)).toBe(-250)
  })

  it('is null when there is no usable estimate', () => {
    const est = estimateMaintenance([], [], [], TODAY)
    expect(intakeAdjustment(est, -1)).toBeNull()
  })
})

describe('weeklyKcal', () => {
  it('means the daily totals within each ISO week, dropping empty weeks', () => {
    const nutrition: NutritionEntry[] = [
      { date: '2026-08-03', kcal: 2000 }, // Mon
      { date: '2026-08-04', kcal: 2200 },
      { date: '2026-08-05', kcal: 1800 },
      { date: '2026-08-10', kcal: 2100 }, // next Mon
      { date: '2026-08-12', kcal: 0 }, // ignored
    ]
    expect(weeklyKcal(nutrition)).toEqual([
      { monday: '2026-08-03', kcal: 2000, n: 3 },
      { monday: '2026-08-10', kcal: 2100, n: 1 },
    ])
  })
})
