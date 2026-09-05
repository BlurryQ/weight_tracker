import { describe, expect, it } from 'vitest'
import { addDays } from '../src/lib/dates'
import {
  computeAdherence,
  computeMaintenanceHistory,
  estimateMaintenance,
  findNearestGatedWindow,
  intakeAdjustment,
  phaseKcalPerLb,
  targetIntake,
  weeklyKcal,
  type NutritionEntry,
} from '../src/lib/energy'
import { weeklyAverages, type Entry, type PhaseLogEntry } from '../src/lib/math'

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

  it('reports the effective window start — the raw 28d start, or the phase clamp if later', () => {
    const { entries, nutrition } = scenario(28, { start: 185, lbsPerWeek: -0.5, kcal: 2000 })

    // No phase log: window starts a clean 27 days before TODAY.
    const unclamped = estimateMaintenance(entries, nutrition, [], TODAY)
    expect(unclamped.windowStart).toBe(addDays(TODAY, -27))

    // Phase change mid-window: start is pulled forward to that span's Monday (Aug 10).
    const clamped = estimateMaintenance(entries, nutrition, [
      { start: '2026-06-01', name: 'Bulk' },
      { start: '2026-08-15', name: 'Cut' },
    ] as PhaseLogEntry[], TODAY)
    expect(clamped.windowStart).toBe('2026-08-10')

    // Still populated on the insufficient path (explains a short post-phase-change window).
    const thin = estimateMaintenance(entries.slice(-3), nutrition.slice(-3), [], TODAY)
    expect(thin.kind).toBe('insufficient')
    expect(thin.windowStart).toBe(addDays(TODAY, -27))
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

/** Concatenate segments ending on TODAY into an entries/nutrition history. `logged: false`
 * segments are a true lapse — no weigh-in and no calorie row — but weight still drifts through
 * them at the segment's rate, so the run stays continuous. */
interface Seg {
  days: number
  lbsPerWeek: number
  kcal: number
  logged?: boolean
}

function buildHistory(startLbs: number, segs: Seg[], endDate = TODAY) {
  const total = segs.reduce((s, seg) => s + seg.days, 0)
  const entries: Entry[] = []
  const nutrition: NutritionEntry[] = []
  let lbs = startLbs
  let i = 0
  for (const seg of segs) {
    for (let d = 0; d < seg.days; d++, i++) {
      const date = addDays(endDate, -(total - 1 - i))
      if (seg.logged !== false) {
        entries.push({ date, lbs })
        nutrition.push({ date, kcal: seg.kcal })
      }
      lbs += seg.lbsPerWeek / 7
    }
  }
  return { entries, nutrition }
}

describe('computeMaintenanceHistory (#8 rolling series)', () => {
  it('rolls estimateMaintenance every stepDays over a trailing window, oldest first', () => {
    const { entries, nutrition } = buildHistory(190, [{ days: 84, lbsPerWeek: -0.5, kcal: 2000 }])
    const h = computeMaintenanceHistory(entries, nutrition, [], TODAY)

    expect(h.stepDays).toBe(14)
    expect(h.windowDays).toBe(28)
    expect(h.points.map((p) => p.date)).toEqual([
      addDays(TODAY, -56),
      addDays(TODAY, -42),
      addDays(TODAY, -28),
      addDays(TODAY, -14),
      TODAY,
    ])
    // Every window sees clean, fully-logged data -> all gated, all the same number.
    expect(h.gated).toHaveLength(5)
    expect(h.points.every((p) => p.kind === 'ok')).toBe(true)
    expect(h.points.every((p) => p.maintenance === 2250)).toBe(true)
  })

  it('keeps only gated points in the series that feeds calc 2', () => {
    // Weigh-ins for 84 days, but calories only for the last 50 -> the two oldest windows are
    // starved of calorie days and never gate.
    const { entries } = buildHistory(190, [{ days: 84, lbsPerWeek: -0.5, kcal: 2000 }])
    const nutrition = buildHistory(190, [
      { days: 34, lbsPerWeek: -0.5, kcal: 2000, logged: false },
      { days: 50, lbsPerWeek: -0.5, kcal: 2000 },
    ]).nutrition

    const h = computeMaintenanceHistory(entries, nutrition, [], TODAY)
    expect(h.points).toHaveLength(5)
    expect(h.points.map((p) => p.kind)).toEqual(['insufficient', 'insufficient', 'ok', 'ok', 'ok'])
    expect(h.gated.map((p) => p.date)).toEqual([addDays(TODAY, -28), addDays(TODAY, -14), TODAY])
  })
})

describe('findNearestGatedWindow (#6 walk-back)', () => {
  it('skips a lapse in the middle of history to reach the nearest gated window', () => {
    // 45 clean days, then a 30-day lapse (no logging at all), then the current 28-day window.
    const withGap = buildHistory(200, [
      { days: 45, lbsPerWeek: -0.5, kcal: 2000 },
      { days: 30, lbsPerWeek: -0.5, kcal: 2000, logged: false },
      { days: 28, lbsPerWeek: -2.0, kcal: 2500 },
    ])
    const currentStart = addDays(TODAY, -27)
    const ref = findNearestGatedWindow(withGap.entries, withGap.nutrition, [], currentStart)

    expect(ref).not.toBeNull()
    expect(ref!.estimate.kind).toBe('ok')
    // Walked back past the entire 30-day lapse — not the immediately-prior window.
    expect(ref!.date).toBe(addDays(TODAY, -44))
    expect(ref!.estimate.maintenance).toBe(2250)

    // Same history with the gap closed up: the nearest gated window is the one that ends the
    // day before the current window starts.
    const noGap = buildHistory(200, [
      { days: 45, lbsPerWeek: -0.5, kcal: 2000 },
      { days: 28, lbsPerWeek: -2.0, kcal: 2500 },
    ])
    const near = findNearestGatedWindow(noGap.entries, noGap.nutrition, [], currentStart)
    expect(near!.date).toBe(addDays(TODAY, -28))
  })

  it('returns null on a first-ever eligible window (no gated prior window anywhere)', () => {
    const { entries, nutrition } = buildHistory(185, [{ days: 28, lbsPerWeek: -0.5, kcal: 2000 }])
    expect(findNearestGatedWindow(entries, nutrition, [], addDays(TODAY, -27))).toBeNull()
  })
})

describe('computeAdherence (#6 logging accuracy)', () => {
  it('reports "not enough data" when no gated prior window exists yet', () => {
    const { entries, nutrition } = buildHistory(185, [{ days: 28, lbsPerWeek: -0.5, kcal: 2000 }])
    const res = computeAdherence(entries, nutrition, [], weeklyAverages(entries), TODAY)

    expect(res.applicable).toBe(false)
    expect(res.live).toBeNull()
    expect(res.calc1).toBeNull()
    expect(res.calc2).toBeNull()
  })

  it('never references the window under evaluation — divergence does not collapse to zero', () => {
    // Under-logging: the log says 2500 kcal/day, the scale says a ~2 lb/wk loss. A clean prior
    // window ate 2000 losing 0.5 lb/wk -> reference maintenance 2250.
    const { entries, nutrition } = buildHistory(210, [
      { days: 45, lbsPerWeek: -0.5, kcal: 2000 },
      { days: 30, lbsPerWeek: -0.5, kcal: 2000, logged: false },
      { days: 28, lbsPerWeek: -2.0, kcal: 2500 },
    ])
    const res = computeAdherence(entries, nutrition, [], weeklyAverages(entries), TODAY)

    expect(res.currentEst.kind).toBe('ok')
    expect(res.calc1).not.toBeNull()
    const c1 = res.calc1!
    // Reference is a genuinely earlier, disjoint window — not this one.
    expect(c1.reference.maintenance).toBe(2250)
    expect(c1.reference.windowStart).not.toBe(res.currentEst.windowStart)
    expect(c1.reference.date < res.currentEst.windowStart).toBe(true)

    // The log predicts a slight *gain*; the scale shows a fast loss -> large negative divergence.
    expect(c1.predictedRate).toBeGreaterThan(0)
    expect(c1.divergence).toBeLessThan(-1.8)

    // Had the calc (wrongly) referenced this same window's own estimate, predictedRate would
    // equal actualRate by construction and divergence would be ~0.
    const selfPredicted = ((c1.avgLoggedIntake - (res.currentEst.maintenance as number)) / c1.kcalPerLb) * 7
    expect(Math.abs(c1.actualRate - selfPredicted)).toBeLessThan(0.5)
  })

  it('falls back to calc 1 when the rolling series has < 2 gated points, else prefers calc 2', () => {
    // A narrow 22-day clean band, a 34-day lapse, then a 14-day current stretch. Only one
    // rolling-series sample lands a full gated window before today -> calc 2 unavailable, but
    // the day-granular walk-back still reaches a gated window -> calc 1 applies.
    const thin = buildHistory(200, [
      { days: 22, lbsPerWeek: -0.5, kcal: 2000 },
      { days: 34, lbsPerWeek: -0.5, kcal: 2000, logged: false },
      { days: 14, lbsPerWeek: -0.5, kcal: 2000 },
    ])
    const thinRes = computeAdherence(thin.entries, thin.nutrition, [], weeklyAverages(thin.entries), TODAY)
    expect(thinRes.calc1).not.toBeNull()
    expect(thinRes.calc2).toBeNull()
    expect(thinRes.live).toBe('calc1')

    // A long, unbroken history — plenty of gated series points -> calc 2 is live.
    const full = buildHistory(210, [{ days: 90, lbsPerWeek: -0.5, kcal: 2000 }])
    const fullRes = computeAdherence(full.entries, full.nutrition, [], weeklyAverages(full.entries), TODAY)
    expect(fullRes.calc2).not.toBeNull()
    expect(fullRes.calc2!.reference.source).toBe('maintenance-series')
    expect(fullRes.live).toBe('calc2')
  })
})

describe('phaseKcalPerLb', () => {
  it('keys off the logged phase direction, not the scale sign', () => {
    const bulk: PhaseLogEntry[] = [{ start: '2026-06-01', name: 'Bulk' }]
    expect(phaseKcalPerLb(bulk, TODAY, -5)).toBe(3100) // Bulk span, scale drifting down -> gain density
    expect(phaseKcalPerLb([{ start: '2026-06-01', name: 'Cut' }], TODAY, 5)).toBe(3500)
    // No phase history at all: fall back to the observed direction.
    expect(phaseKcalPerLb([], TODAY, 2)).toBe(3100)
    expect(phaseKcalPerLb([], TODAY, -2)).toBe(3500)
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
