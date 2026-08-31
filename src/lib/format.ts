import { addDays, DAY_NAMES, weekCommencingLabel } from './dates'
import type { NutritionEntry } from './energy'
import type { Entry } from './math'
import type { Unit } from '../store/types'

export const KG_PER_LB = 0.45359237

export function toDisplay(lbs: number, unit: Unit): number {
  return unit === 'kg' ? lbs * KG_PER_LB : lbs
}

export function toLbs(value: number, unit: Unit): number {
  return unit === 'kg' ? value / KG_PER_LB : value
}

export function unitLabel(unit: Unit): string {
  return unit === 'kg' ? 'kg' : 'lbs'
}

/** '183.9', or '—' for null/NaN — the standard one-decimal display format for a weight. */
export function formatWeight(lbs: number | null | undefined, unit: Unit): string {
  if (lbs == null || Number.isNaN(lbs)) return '—'
  return toDisplay(lbs, unit).toFixed(1)
}

/** Signed magnitude string: '+1.0' / '−0.7' (real minus sign, matching the design). */
export function sgn(value: number, decimals = 1): string {
  return (value > 0 ? '+' : '−') + Math.abs(value).toFixed(decimals)
}

/** Same as sgn(), but with a plain ASCII hyphen — for text meant to be copied out of the app
 * (clipboard, chat, notes) where the real minus sign can render oddly or get mangled. */
function plainSgn(value: number, decimals = 1): string {
  return (value > 0 ? '+' : '-') + Math.abs(value).toFixed(decimals)
}

/** The plain-text block for one History week, shaped for pasting elsewhere:
 *
 *   WC 24/08
 *   Avg: 183.3 lbs (-1.1 on week)
 *   Target Rate: -1.0 lb/wk
 *   Mon: 183.4 | Tue: 183.2 | Wed: 183.6 | Thu: 183.0 | Fri: -- | Sat: -- | Sun: --
 *
 * When the week has any MyFitnessPal calorie data, two more lines are woven in — an average
 * under the weight average, and a per-day `Cals:` line under the weight days line:
 *
 *   WC 24/08
 *   Avg: 183.3 lbs (-1.1 on week)
 *   Avg calories: 2010/day
 *   Target Rate: -1.0 lb/wk
 *   Mon: 183.4 | Tue: 183.2 | Wed: 183.6 | Thu: 183.0 | Fri: -- | Sat: -- | Sun: --
 *   Cals: Mon: 2010 | Tue: 1980 | Wed: 2100 | Thu: -- | Fri: -- | Sat: -- | Sun: --
 */
export function formatWeekForClipboard(params: {
  monday: string
  weeklyLbs: number
  deltaLbs: number | null
  weeklyTargetLbs: number
  unit: Unit
  entries: Entry[]
  nutrition?: NutritionEntry[]
}): string {
  const { monday, weeklyLbs, deltaLbs, weeklyTargetLbs, unit, entries, nutrition = [] } = params
  const U = unitLabel(unit)
  const rateUnit = unit === 'kg' ? 'kg' : 'lb'

  const avgLine =
    `Avg: ${toDisplay(weeklyLbs, unit).toFixed(1)} ${U}` +
    (deltaLbs != null ? ` (${plainSgn(toDisplay(deltaLbs, unit))} on week)` : '')
  const targetLine = `Target Rate: ${plainSgn(toDisplay(weeklyTargetLbs, unit))} ${rateUnit}/wk`
  const daysLine = DAY_NAMES.map((name, i) => {
    const date = addDays(monday, i)
    const entry = entries.find((e) => e.date === date)
    return `${name}: ${entry ? toDisplay(entry.lbs, unit).toFixed(1) : '--'}`
  }).join(' | ')

  const dayKcal = DAY_NAMES.map((_, i) => {
    const date = addDays(monday, i)
    return nutrition.find((n) => n.date === date)?.kcal ?? null
  })
  const loggedKcal = dayKcal.filter((k): k is number => k != null && k > 0)

  const lines = [weekCommencingLabel(monday), avgLine, targetLine, daysLine]
  if (loggedKcal.length) {
    const meanKcal = Math.round(loggedKcal.reduce((a, b) => a + b, 0) / loggedKcal.length)
    lines.splice(2, 0, `Avg calories: ${meanKcal}/day`)
    lines.push(
      'Cals: ' + DAY_NAMES.map((name, i) => `${name}: ${dayKcal[i] ? Math.round(dayKcal[i] as number) : '--'}`).join(' | '),
    )
  }
  return lines.join('\n')
}

/** Applies one keypad tap to the raw typed string: digits, one decimal point, backspace,
 * max 5 significant digits (decimal point doesn't count). */
export function applyKeypadKey(current: string, key: string): string {
  if (key === '⌫') return current.slice(0, -1) // backspace glyph
  if (key === '.') return current.includes('.') ? current : (current || '0') + '.'
  if (current.replace('.', '').length < 5) return current + key
  return current
}

/** Weight must parse as a plausible human bodyweight — outside this range should be questioned
 * rather than silently stored. Range is in the unit the value was typed in. */
export function isPlausibleWeight(value: number, unit: Unit): boolean {
  const lbs = toLbs(value, unit)
  return lbs >= 50 && lbs <= 600
}
