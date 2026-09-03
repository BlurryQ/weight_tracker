import { describe, expect, it } from 'vitest'
import { formatKcal } from '../src/lib/format'
import { weeklyKcal, type NutritionEntry } from '../src/lib/energy'
import { WEIGHT_DATA_FIXTURE } from './fixtures/weight-data'

/** History must never imply "0 calories" for a week MyFitnessPal didn't log — the whole
 * fixture predates the MFP connection, so with no nutrition every row is a no-data row. */
describe('History calorie internals — no-MFP-data guard', () => {
  it('formatKcal renders an em dash for null / 0 / undefined, never "0"', () => {
    for (const v of [null, undefined, 0, -5, NaN]) {
      expect(formatKcal(v as number | null | undefined)).toBe('—')
    }
    expect(formatKcal(2010)).toBe('2,010')
  })

  it('weeklyKcal drops weeks with no positive total, so the History lookup returns null', () => {
    // The full weight fixture with zero nutrition → no weekly kcal rows at all.
    expect(weeklyKcal([])).toEqual([])

    const zeros: NutritionEntry[] = WEIGHT_DATA_FIXTURE.slice(0, 10).map((e) => ({ date: e.date, kcal: 0 }))
    expect(weeklyKcal(zeros)).toEqual([])

    // History builds `new Map(weeklyKcal(...).map(w => [w.monday, w.kcal]))` and reads it with
    // `?? null` — a week that isn't in the map resolves to null, which formatKcal turns into '—'.
    const map = new Map(weeklyKcal([]).map((w) => [w.monday, w.kcal]))
    const anyMonday = WEIGHT_DATA_FIXTURE[0].date
    expect(formatKcal(map.get(anyMonday) ?? null)).toBe('—')
  })
})
