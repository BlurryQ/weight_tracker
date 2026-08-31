import { describe, expect, it } from 'vitest'
import { formatWeekForClipboard } from '../src/lib/format'
import type { Entry } from '../src/lib/math'

const entries: Entry[] = [
  { date: '2026-08-24', lbs: 183.4 },
  { date: '2026-08-25', lbs: 183.2 },
  { date: '2026-08-26', lbs: 183.6 },
  { date: '2026-08-27', lbs: 183.0 },
  // Fri/Sat/Sun (08-28/29/30) unlogged
]

describe('formatWeekForClipboard', () => {
  it('matches the requested paste format exactly', () => {
    const text = formatWeekForClipboard({
      monday: '2026-08-24',
      weeklyLbs: 183.3,
      deltaLbs: -1.1,
      weeklyTargetLbs: -1.0,
      unit: 'lb',
      entries,
    })
    expect(text).toBe(
      [
        'WC 24/08',
        'Avg: 183.3 lbs (-1.1 on week)',
        'Target Rate: -1.0 lb/wk',
        'Mon: 183.4 | Tue: 183.2 | Wed: 183.6 | Thu: 183.0 | Fri: -- | Sat: -- | Sun: --',
      ].join('\n'),
    )
  })

  it('omits the week-over-week parenthetical for the first-ever week (no prior week to compare)', () => {
    const text = formatWeekForClipboard({
      monday: '2026-08-24',
      weeklyLbs: 183.3,
      deltaLbs: null,
      weeklyTargetLbs: -1.0,
      unit: 'lb',
      entries,
    })
    expect(text.split('\n')[1]).toBe('Avg: 183.3 lbs')
  })

  it('converts to kg for both the average and the target rate, using the singular unit for rate', () => {
    const text = formatWeekForClipboard({
      monday: '2026-08-24',
      weeklyLbs: 183.3,
      deltaLbs: -1.1,
      weeklyTargetLbs: -1.0,
      unit: 'kg',
      entries,
    })
    const lines = text.split('\n')
    expect(lines[1]).toContain('kg (')
    expect(lines[2]).toMatch(/kg\/wk$/)
  })

  it('weaves in an average-calories line and a per-day Cals line when the week has MFP data', () => {
    const text = formatWeekForClipboard({
      monday: '2026-08-24',
      weeklyLbs: 183.3,
      deltaLbs: -1.1,
      weeklyTargetLbs: -1.0,
      unit: 'lb',
      entries,
      nutrition: [
        { date: '2026-08-24', kcal: 2010 },
        { date: '2026-08-25', kcal: 1980 },
        { date: '2026-08-26', kcal: 2100 },
        // Thu–Sun unlogged
      ],
    })
    expect(text).toBe(
      [
        'WC 24/08',
        'Avg: 183.3 lbs (-1.1 on week)',
        'Avg calories: 2030/day',
        'Target Rate: -1.0 lb/wk',
        'Mon: 183.4 | Tue: 183.2 | Wed: 183.6 | Thu: 183.0 | Fri: -- | Sat: -- | Sun: --',
        'Cals: Mon: 2010 | Tue: 1980 | Wed: 2100 | Thu: -- | Fri: -- | Sat: -- | Sun: --',
      ].join('\n'),
    )
  })

  it('is unchanged from the weight-only format when the week has no calorie data', () => {
    const text = formatWeekForClipboard({
      monday: '2026-08-24',
      weeklyLbs: 183.3,
      deltaLbs: -1.1,
      weeklyTargetLbs: -1.0,
      unit: 'lb',
      entries,
      nutrition: [{ date: '2026-07-01', kcal: 2000 }], // different week
    })
    expect(text.split('\n')).toHaveLength(4)
    expect(text).not.toContain('Cals:')
  })

  it('uses a plain ASCII hyphen for negative signs, not the in-app minus sign', () => {
    const text = formatWeekForClipboard({
      monday: '2026-08-24',
      weeklyLbs: 183.3,
      deltaLbs: -1.1,
      weeklyTargetLbs: -1.0,
      unit: 'lb',
      entries,
    })
    expect(text).not.toContain('−') // U+2212, the design's minus sign
    expect(text).toContain('-1.1')
    expect(text).toContain('-1.0')
  })
})
