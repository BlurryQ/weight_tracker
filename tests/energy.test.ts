import { describe, expect, it } from 'vitest'
import { addDays, diffDays, mondayOf } from '../src/lib/dates'
import {
  OUTLIER_MIN_GATED,
  computeMaintenanceHistory,
  estimateMaintenance,
  intakeAdjustment,
  targetIntake,
  weeklyKcal,
  type NutritionEntry,
} from '../src/lib/energy'
import { type Entry, type PhaseLogEntry } from '../src/lib/math'

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

describe('estimateMaintenance — insufficient reason breakdown', () => {
  it('names the calorie-days gate and its numbers, no clamp when logging is just sparse', () => {
    const { entries } = scenario(28, { start: 185, lbsPerWeek: -0.5, kcal: 2000 })
    const nutrition = scenario(10, { start: 185, lbsPerWeek: -0.5, kcal: 2000 }).nutrition
    const est = estimateMaintenance(entries, nutrition, [], TODAY)

    expect(est.kind).toBe('insufficient')
    expect(est.insufficientReason).toEqual({
      check: 'calorie-days',
      have: 10,
      need: 14,
      clampedByPhaseChange: null,
      effectiveWindowDays: 28,
    })
    expect(est.note).toBe('Only 10 of 14 calorie-days in the window.')
  })

  it('blames the phase clamp by name when a mid-window phase change is what shortened it', () => {
    // 28 clean, fully-logged days — plenty on its own — but a Cut starting the Monday 4 days
    // back pins the window to 5 days, under the 14-day calorie minimum.
    const { entries, nutrition } = scenario(28, { start: 185, lbsPerWeek: -0.5, kcal: 2000 })
    const est = estimateMaintenance(entries, nutrition, [{ start: '2026-08-24', name: 'Cut' }], TODAY)

    expect(est.kind).toBe('insufficient')
    expect(est.insufficientReason).toEqual({
      check: 'calorie-days',
      have: 5,
      need: 14,
      clampedByPhaseChange: '2026-08-24',
      effectiveWindowDays: 5,
    })
    expect(est.note).toBe('Only 5 of 14 calorie-days in the window — window clamped to 5 days by the 24 Aug 2026 phase change.')
  })

  it('distinguishes the weigh-ins gate from the day-span gate', () => {
    const nutrition = scenario(20, { start: 185, lbsPerWeek: -0.5, kcal: 2000 }).nutrition

    // Enough calorie-days, but only one weigh-in.
    const oneWeighIn = estimateMaintenance([{ date: TODAY, lbs: 185 }], nutrition, [], TODAY)
    expect(oneWeighIn.insufficientReason).toMatchObject({ check: 'weigh-ins', have: 1, need: 2 })

    // Enough calorie-days and 3 weigh-ins, but they span only 2 days.
    const clustered = estimateMaintenance(
      [
        { date: addDays(TODAY, -2), lbs: 185 },
        { date: addDays(TODAY, -1), lbs: 184.9 },
        { date: TODAY, lbs: 184.8 },
      ],
      nutrition,
      [],
      TODAY,
    )
    expect(clustered.insufficientReason).toMatchObject({ check: 'day-span', have: 2, need: 7 })
  })

  it('leaves insufficientReason null on the ok and unreliable paths', () => {
    const okData = scenario(28, { start: 185, lbsPerWeek: -0.5, kcal: 2000 })
    const ok = estimateMaintenance(okData.entries, okData.nutrition, [], TODAY)
    expect(ok.kind).toBe('ok')
    expect(ok.insufficientReason).toBeNull()

    const hotData = scenario(28, { start: 185, lbsPerWeek: -0.5, kcal: 5000 })
    const unreliable = estimateMaintenance(hotData.entries, hotData.nutrition, [], TODAY)
    expect(unreliable.kind).toBe('unreliable')
    expect(unreliable.insufficientReason).toBeNull()
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

const isMonday = (iso: string) => mondayOf(iso) === iso

describe('computeMaintenanceHistory (#8 rolling series)', () => {
  it('rolls estimateMaintenance on the ISO-Monday grid, oldest first', () => {
    const { entries, nutrition } = buildHistory(190, [{ days: 84, lbsPerWeek: -0.5, kcal: 2000 }])
    const h = computeMaintenanceHistory(entries, nutrition, [], TODAY)

    expect(h.stepDays).toBe(14)
    expect(h.windowDays).toBe(28)
    // Every window ends on a Monday, 14 days (2 weeks) apart, the last one being this week's.
    expect(h.points.every((p) => isMonday(p.date))).toBe(true)
    expect(h.points[h.points.length - 1].date).toBe(mondayOf(TODAY))
    for (let i = 1; i < h.points.length; i++) {
      expect(diffDays(h.points[i - 1].date, h.points[i].date)).toBe(14)
    }
    // Clean, fully-logged data -> all gated, all the same number.
    expect(h.points).toHaveLength(5)
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
    expect(h.gated).toEqual(h.points.slice(2))
    expect(h.gated.every((p) => isMonday(p.date))).toBe(true)

    // Each point carries estimateMaintenance's note + structured reason through to the table.
    expect(h.points[0].insufficientReason?.check).toBe('calorie-days')
    expect(h.points[0].note).toMatch(/calorie-days/)
    expect(h.gated.every((p) => p.note.length > 0 && p.insufficientReason === null)).toBe(true)
  })
})

describe('computeMaintenanceHistory — series outlier flag (#8)', () => {
  // 10 days eating 2000 then 74 days eating 3000, steady −0.5 lb/wk throughout. Only the oldest
  // 28-day window sees the low intake (maintenance ~2830); every later window settles at ~3250
  // — the classic early water-weight confound.
  const oneOutlier = () =>
    buildHistory(190, [
      { days: 10, lbsPerWeek: -0.5, kcal: 2000 },
      { days: 74, lbsPerWeek: -0.5, kcal: 3000 },
    ])

  it('flags a gated point that sits far off the rest of the person’s own series', () => {
    const { entries, nutrition } = oneOutlier()
    const h = computeMaintenanceHistory(entries, nutrition, [], TODAY)

    expect(h.gated).toHaveLength(5)
    expect(h.gated[0].seriesFlag).toBe('outlier')
    expect(h.gated[0].kind).toBe('ok') // still gated & plausible on its own — not 'unreliable'
    expect(h.gated.slice(1).every((p) => p.seriesFlag === null)).toBe(true)
    // `trend` is the outlier-free subset the drift maths / calc 2 consume.
    expect(h.trend).toEqual(h.gated.slice(1))
  })

  it('does not flag anything when the series is internally consistent', () => {
    const { entries, nutrition } = buildHistory(190, [{ days: 84, lbsPerWeek: -0.5, kcal: 3000 }])
    const h = computeMaintenanceHistory(entries, nutrition, [], TODAY)

    expect(h.gated.length).toBeGreaterThanOrEqual(4)
    expect(h.gated.every((p) => p.seriesFlag === null)).toBe(true)
    expect(h.trend).toEqual(h.gated)
  })

  it('will not judge outlier-ness with fewer than the minimum gated points', () => {
    // ~48 days -> only 3 gated windows; the oldest is plainly off but there isn't enough of a
    // "rest of the series" to call it, so it stays untagged (same as any under-evidenced case).
    const { entries, nutrition } = buildHistory(190, [
      { days: 10, lbsPerWeek: -0.5, kcal: 2000 },
      { days: 38, lbsPerWeek: -0.5, kcal: 3000 },
    ])
    const h = computeMaintenanceHistory(entries, nutrition, [], TODAY)

    expect(h.gated.length).toBeLessThan(OUTLIER_MIN_GATED)
    expect(h.gated.some((p) => (p.maintenance as number) < 2900)).toBe(true) // the off point is there
    expect(h.gated.every((p) => p.seriesFlag === null)).toBe(true)
    expect(h.trend).toEqual(h.gated)
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
