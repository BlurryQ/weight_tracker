import { describe, expect, it } from 'vitest'
import {
  avg,
  completionLabel,
  completionRatio,
  currentDir,
  currentStreak,
  dedupePhaseLog,
  fitQualityLabel,
  fitSlope,
  foldedWeeks,
  leastSquaresFit,
  longestStreak,
  phaseAt,
  phaseSpans,
  projectionWeeks,
  signColor,
  solveByDate,
  solveByWeight,
  weeklyAverages,
  type Entry,
  type PhaseLogEntry,
} from '../src/lib/math'
import { WEIGHT_DATA_FIXTURE } from './fixtures/weight-data'

// The fixture's real-world "today" — frozen so results are deterministic and directly
// comparable to the numbers already hand-verified against the source CSV and the design
// screenshots (screens/01-today.png, 02-today-reach-date-mode.png).
const TODAY = '2026-08-25'

describe('avg', () => {
  it('divides by the number of entries actually found in the window, not by the window size', () => {
    expect(avg(WEIGHT_DATA_FIXTURE, 7, TODAY)).toBeCloseTo(183.367, 3)
    expect(avg(WEIGHT_DATA_FIXTURE, 14, TODAY)).toBeCloseTo(183.892, 3)
    expect(avg(WEIGHT_DATA_FIXTURE, 30, TODAY)).toBeCloseTo(185.028, 3)
  })

  it('returns null when no entries fall in the window', () => {
    expect(avg([], 7, TODAY)).toBeNull()
    expect(avg([{ date: '2020-01-01', lbs: 200 }], 7, TODAY)).toBeNull()
  })

  it('supports an offset window (used for week-over-week deltas)', () => {
    expect(avg(WEIGHT_DATA_FIXTURE, 7, TODAY, 7)).toBeCloseTo(184.343, 3)
  })
})

describe('weeklyAverages', () => {
  const weekly = weeklyAverages(WEIGHT_DATA_FIXTURE)

  it('groups by ISO Monday and omits weeks with no entries', () => {
    expect(weekly).toHaveLength(47)
  })

  it('means each week, including a partial current week', () => {
    const last = weekly[weekly.length - 1]
    expect(last.monday).toBe('2026-08-24')
    expect(last.lbs).toBeCloseTo(183.4, 4)
    expect(last.n).toBe(1)

    const prev = weekly[weekly.length - 2]
    expect(prev.monday).toBe('2026-08-17')
    expect(prev.lbs).toBeCloseTo(183.5429, 3)
    expect(prev.n).toBe(7)
  })
})

describe('fitSlope (4-week window)', () => {
  it('matches an independently computed OLS fit over the last 4 weekly averages', () => {
    const weekly = weeklyAverages(WEIGHT_DATA_FIXTURE)
    const { slope, r2 } = fitSlope(weekly, 4)
    expect(slope).toBeCloseTo(-0.674285714, 6)
    expect(r2).toBeCloseTo(0.9157513975665896, 6)
  })
})

describe('leastSquaresFit', () => {
  it('returns a flat zero-slope fit for fewer than 2 points', () => {
    expect(leastSquaresFit([])).toEqual({ intercept: 0, slope: 0, r2: 0 })
    expect(leastSquaresFit([{ x: 0, y: 5 }])).toEqual({ intercept: 5, slope: 0, r2: 0 })
  })

  it('fits a perfect line with r2 = 1', () => {
    const pts = [0, 1, 2, 3].map((x) => ({ x, y: 10 - 2 * x }))
    const { slope, intercept, r2 } = leastSquaresFit(pts)
    expect(slope).toBeCloseTo(-2, 10)
    expect(intercept).toBeCloseTo(10, 10)
    expect(r2).toBeCloseTo(1, 10)
  })
})

describe('dedupePhaseLog', () => {
  it('keeps one entry per ISO week (last wins) and sorts ascending', () => {
    const log: PhaseLogEntry[] = [
      { start: '2026-01-07', name: 'Bulk' }, // same ISO week as the next entry (Monday 2026-01-05)
      { start: '2026-01-05', name: 'Cut' },
      { start: '2026-01-05', name: 'Bulk' }, // duplicate week, appended later -> should win
      { start: '2025-12-01', name: 'Cut' },
    ]
    const out = dedupePhaseLog(log)
    expect(out).toEqual([
      { start: '2025-12-01', name: 'Cut' },
      { start: '2026-01-05', name: 'Bulk' },
    ])
  })

  it('self-heals an already-polluted log with many entries stacked on one week', () => {
    // Simulates a log that appended unconditionally: 50 entries, all within the same ISO week.
    const log: PhaseLogEntry[] = Array.from({ length: 50 }, (_, i) => ({
      start: '2026-01-0' + (5 + (i % 2)), // Mon 2026-01-05 or Tue 2026-01-06 -> same ISO week
      name: i % 2 === 0 ? 'Cut' : 'Bulk',
    }))
    expect(dedupePhaseLog(log)).toHaveLength(1)
  })
})

describe('phaseSpans', () => {
  it('only Cut/Bulk create bands; Deload/Maintain fold into the enclosing span', () => {
    const log: PhaseLogEntry[] = [
      { start: '2026-01-05', name: 'Bulk' },
      { start: '2026-04-20', name: 'Cut' },
      { start: '2026-07-27', name: 'Deload' },
      { start: '2026-08-03', name: 'Cut' },
    ]
    const spans = phaseSpans(log)
    // Cut (04-20) -> Deload (folds in, no new span) -> Cut (08-03, same dir, merges) -> one continuous Cut span
    expect(spans).toEqual([
      { dir: 'Bulk', start: '2026-01-05' },
      { dir: 'Cut', start: '2026-04-20' },
    ])
  })
})

describe('foldedWeeks', () => {
  it('returns only the Deload/Maintain weeks, not the Cut/Bulk ones', () => {
    const log: PhaseLogEntry[] = [
      { start: '2026-01-05', name: 'Bulk' },
      { start: '2026-04-20', name: 'Cut' },
      { start: '2026-06-01', name: 'Maintain' },
      { start: '2026-07-27', name: 'Deload' },
    ]
    expect(foldedWeeks(log)).toEqual(['2026-06-01', '2026-07-27'])
  })

  it('dedupes by ISO week same as dedupePhaseLog', () => {
    const log: PhaseLogEntry[] = [
      { start: '2026-07-27', name: 'Deload' },
      { start: '2026-07-28', name: 'Deload' }, // same ISO week as above
    ]
    expect(foldedWeeks(log)).toEqual(['2026-07-27'])
  })
})

describe('phaseAt', () => {
  // Cut starting 04-20, a Maintain logged for just the 06-01 week, then a Deload logged for
  // just the 07-27 week.
  const log: PhaseLogEntry[] = [
    { start: '2026-04-20', name: 'Cut' },
    { start: '2026-06-01', name: 'Maintain' },
    { start: '2026-07-27', name: 'Deload' },
  ]

  it('labels a Deload/Maintain week with its raw name only on the exact week it was logged', () => {
    expect(phaseAt('2026-06-01', log).raw).toBe('Maintain')
    expect(phaseAt('2026-07-27', log).raw).toBe('Deload')
  })

  it('reverts to the folded Cut/Bulk direction the week immediately after a Deload/Maintain week', () => {
    // The real bug: these used to keep reading "Maintain"/"Deload" indefinitely, all the way
    // up to the next logged entry, instead of just their own week.
    expect(phaseAt('2026-06-08', log).raw).toBe('Cut')
    expect(phaseAt('2026-08-03', log).raw).toBe('Cut')
  })

  it('does not affect the folded dir, which is meant to persist across weeks', () => {
    expect(phaseAt('2026-06-01', log).dir).toBe('Cut')
    expect(phaseAt('2026-07-27', log).dir).toBe('Cut')
    expect(phaseAt('2026-08-03', log).dir).toBe('Cut')
  })

  it('labels the Cut/Bulk change week itself correctly, same as before', () => {
    expect(phaseAt('2026-04-20', log).raw).toBe('Cut')
  })

  it('returns nulls for a week before any phase history exists', () => {
    expect(phaseAt('2026-01-01', log)).toEqual({ dir: null, raw: null })
  })
})

describe('currentDir', () => {
  const log: PhaseLogEntry[] = [{ start: '2026-04-20', name: 'Cut' }]

  it('uses the phase directly when it is Cut/Bulk', () => {
    expect(currentDir('Bulk', log)).toBe('Bulk')
  })

  it('folds Maintain/Deload into the enclosing span direction', () => {
    expect(currentDir('Deload', log)).toBe('Cut')
  })

  it('defaults to Cut with no span history', () => {
    expect(currentDir('Maintain', [])).toBe('Cut')
  })
})

describe('signColor', () => {
  it('is grey for values under the noise threshold regardless of direction', () => {
    expect(signColor(0.04, 'Cut')).toBe('grey')
    expect(signColor(-0.04, 'Bulk')).toBe('grey')
  })

  it('is lime for progress in the phase direction, red otherwise', () => {
    expect(signColor(-1, 'Cut')).toBe('lime') // losing weight on a cut = good
    expect(signColor(1, 'Cut')).toBe('red')
    expect(signColor(1, 'Bulk')).toBe('lime') // gaining weight on a bulk = good
    expect(signColor(-1, 'Bulk')).toBe('red')
  })
})

describe('Reach solver — solveByWeight', () => {
  // Anchored on the real fixture's last weekly average (183.4) and 4-week fit slope
  // (-0.674285714.../wk), matching screens/01-today.png (target 170.0 -> "10 Jan 2027, 20 weeks away").
  const ctx = { current: 183.4, slopeLbs: -0.674285714285719, lastMonday: '2026-08-24' }

  it('reproduces the exact date shown in the design screenshot', () => {
    const result = solveByWeight(ctx, 170.0)
    expect(result.kind).toBe('reachable')
    if (result.kind === 'reachable') {
      expect(result.roundedWeeks).toBe(20)
      expect(result.date).toBe('2027-01-10')
    }
  })

  it('is flat when the 4-week slope is under the noise threshold', () => {
    const result = solveByWeight({ ...ctx, slopeLbs: 0.02 }, 170)
    expect(result).toEqual({ kind: 'flat' })
  })

  it('is unreachable when the trend moves away from the target', () => {
    // Losing weight (negative slope) but the target is above current -> moving away.
    const result = solveByWeight(ctx, 190)
    expect(result.kind).toBe('unreachable')
  })

  it('is unreachable beyond the 260-week horizon', () => {
    // A slope just above the flat threshold (0.03) needs a huge target delta to exceed 260 weeks.
    const result = solveByWeight({ ...ctx, slopeLbs: -0.031 }, ctx.current - 20)
    expect(result.kind).toBe('unreachable')
  })
})

describe('Reach solver — solveByDate', () => {
  const ctx = { current: 183.4, slopeLbs: -0.674285714285719, lastMonday: '2026-08-24' }

  it('reproduces the design screenshot for the 7-week set-date example', () => {
    const result = solveByDate(ctx, 7)
    expect(result.kind).toBe('projected')
    expect(result.weight).toBeCloseTo(178.68, 2)
    expect(result.date).toBe('2026-10-12')
  })

  it('reports flat trend with the current weight as the projection', () => {
    const result = solveByDate({ ...ctx, slopeLbs: 0.01 }, 7)
    expect(result.kind).toBe('flat')
    expect(result.weight).toBeCloseTo(183.47, 2)
  })
})

describe('projectionWeeks — chart/solver coupling', () => {
  it('clamps the reachable weeks to 1-52 in weight-solve mode', () => {
    const reachable = { kind: 'reachable' as const, weeks: 100, roundedWeeks: 100, date: '2028-01-01' }
    expect(projectionWeeks('weight', 6, reachable)).toBe(52)
  })

  it('falls back to 6 weeks when flat or unreachable', () => {
    expect(projectionWeeks('weight', 6, { kind: 'flat' })).toBe(6)
    expect(projectionWeeks('weight', 6, { kind: 'unreachable', slopeLbs: 0.5 })).toBe(6)
  })

  it('follows the user-chosen targetWeeks directly in date-solve mode', () => {
    expect(projectionWeeks('date', 9, { kind: 'flat' })).toBe(9)
  })
})

describe('currentStreak', () => {
  it('counts consecutive days ending today', () => {
    const entries: Entry[] = [
      { date: '2026-08-23', lbs: 183 },
      { date: '2026-08-24', lbs: 183 },
      { date: '2026-08-25', lbs: 183 },
    ]
    expect(currentStreak(entries, '2026-08-25')).toBe(3)
  })

  it('stops at the first gap looking backward', () => {
    const entries: Entry[] = [
      { date: '2026-08-20', lbs: 183 }, // gap here
      { date: '2026-08-23', lbs: 183 },
      { date: '2026-08-24', lbs: 183 },
      { date: '2026-08-25', lbs: 183 },
    ]
    expect(currentStreak(entries, '2026-08-25')).toBe(3)
  })

  it('counts back from yesterday when today has no entry yet, without zeroing the streak', () => {
    const entries: Entry[] = [
      { date: '2026-08-23', lbs: 183 },
      { date: '2026-08-24', lbs: 183 },
      // 2026-08-25 (today) not logged yet
    ]
    expect(currentStreak(entries, '2026-08-25')).toBe(2)
  })

  it('is 0 when neither today nor yesterday is logged', () => {
    const entries: Entry[] = [{ date: '2026-08-01', lbs: 183 }]
    expect(currentStreak(entries, '2026-08-25')).toBe(0)
  })
})

describe('longestStreak', () => {
  it('finds the longest run across the whole history, even if it is not the current one', () => {
    const entries: Entry[] = [
      // A 5-day run in July...
      { date: '2026-07-01', lbs: 183 },
      { date: '2026-07-02', lbs: 183 },
      { date: '2026-07-03', lbs: 183 },
      { date: '2026-07-04', lbs: 183 },
      { date: '2026-07-05', lbs: 183 },
      // ...then a gap, then a shorter, more recent 2-day run.
      { date: '2026-08-24', lbs: 183 },
      { date: '2026-08-25', lbs: 183 },
    ]
    expect(longestStreak(entries)).toBe(5)
  })

  it('is unaffected by out-of-order or duplicate-date entries', () => {
    const entries: Entry[] = [
      { date: '2026-08-25', lbs: 183 },
      { date: '2026-08-23', lbs: 183 },
      { date: '2026-08-24', lbs: 183 },
      { date: '2026-08-24', lbs: 183.5 }, // same date logged twice
    ]
    expect(longestStreak(entries)).toBe(3)
  })

  it('is 0 for no entries', () => {
    expect(longestStreak([])).toBe(0)
  })
})

describe('completionRatio', () => {
  it('divides logged days by calendar days in the window', () => {
    const entries: Entry[] = [
      { date: '2026-08-19', lbs: 183 },
      { date: '2026-08-20', lbs: 183 },
      { date: '2026-08-24', lbs: 183 },
      { date: '2026-08-25', lbs: 183 },
    ]
    // 1-week window ending 2026-08-25 -> 2026-08-19..25 inclusive = 7 possible days, 4 logged.
    const r = completionRatio(entries, 1, '2026-08-25')
    expect(r.possible).toBe(7)
    expect(r.logged).toBe(4)
    expect(r.pct).toBe(57)
  })

  it('clamps the window to not start before the first-ever entry', () => {
    const entries: Entry[] = [
      { date: '2026-08-24', lbs: 183 },
      { date: '2026-08-25', lbs: 183 },
    ]
    // An 8-week window would normally span 56 days, but tracking only goes back to 08-24.
    const r = completionRatio(entries, 8, '2026-08-25')
    expect(r.possible).toBe(2)
    expect(r.logged).toBe(2)
    expect(r.pct).toBe(100)
  })

  it('labels match the documented thresholds', () => {
    expect(completionLabel(95)).toBe('Very accurate')
    expect(completionLabel(75)).toBe('Reliable')
    expect(completionLabel(55)).toBe('A bit sparse')
    expect(completionLabel(20)).toBe('Too sparse to trust')
  })
})

describe('fitQualityLabel', () => {
  it('labels match the documented thresholds', () => {
    expect(fitQualityLabel(0.95)).toBe('Tight fit')
    expect(fitQualityLabel(0.75)).toBe('Decent fit')
    expect(fitQualityLabel(0.5)).toBe('Noisy')
    expect(fitQualityLabel(0.2)).toBe('Very noisy')
  })
})

// Exercise the exported types so `Entry` stays honest as a lightweight compile-time check.
const _typeCheck: Entry = { date: '2026-01-01', lbs: 180 }
void _typeCheck
