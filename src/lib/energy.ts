import { addDays, diffDays, mondayOf } from './dates'
import { fitQualityLabel, leastSquaresFit, phaseSpans, type Entry, type PhaseLogEntry } from './math'

/** Body-mass energy equivalent. 3500 kcal per lb of body weight (≈ 7700 kcal/kg) — the standard
 * rough constant for the energy-balance equation. Imperfect over days (water, glycogen) but
 * reasonable over the 2–4 week window this module works on. */
export const KCAL_PER_LB = 3500

/** Rolling window for the maintenance estimate. Four weekly averages' worth: long enough that
 * daily scale noise averages out, short enough that metabolic adaptation and diet changes
 * haven't made the average describe a stale version of you. Clamped further so it never spans
 * a Cut↔Bulk phase boundary (see estimateMaintenance). */
export const ESTIMATE_WINDOW_DAYS = 28

/** Below this many days of logged calories in the window, the estimate is too noisy to show —
 * one big water swing at either end moves it by hundreds of kcal. */
export const MIN_CALORIE_DAYS = 14

/** Outside this band the estimate almost certainly reflects missing food logs or a bad weight
 * trend rather than a real metabolism — surfaced as a caveat, not hidden. */
const PLAUSIBLE_MAINTENANCE = { lo: 1200, hi: 5000 }

export interface NutritionEntry {
  date: string
  kcal: number
}

export type MaintenanceKind = 'ok' | 'insufficient' | 'unreliable'

export interface MaintenanceEstimate {
  kind: MaintenanceKind
  /** Estimated maintenance calories (TDEE), rounded to the nearest 10. Null when insufficient. */
  maintenance: number | null
  /** Mean of the daily calorie totals actually logged in the window. Null when insufficient. */
  meanIntake: number | null
  /** Modelled weight change (lbs) across the window, from the least-squares fit — not raw
   * first/last scale readings. Negative for a loss. */
  weightChangeLbs: number | null
  /** How many days in the window had a calorie total. */
  calorieDays: number
  /** Actual span the fit covered, first logged day to today, in days. */
  windowDays: number
  /** R² of the weight fit over the window — a trust signal for the number next to it. */
  r2: number
  /** Plain-English read, e.g. "Reliable · tight fit" or why there's no number yet. */
  note: string
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function round10(n: number): number {
  return Math.round(n / 10) * 10
}

/** Adaptive-TDEE estimate: rearrange `Δweight ≈ (intake − TDEE) · days / 3500` to solve for
 * TDEE over a recent window. The window starts `ESTIMATE_WINDOW_DAYS` back but is pulled
 * forward to the most recent Cut/Bulk phase change if that's more recent, so the average never
 * blends two different diets. */
export function estimateMaintenance(
  entries: Entry[],
  nutrition: NutritionEntry[],
  phaseLog: PhaseLogEntry[],
  today: string,
  windowDays = ESTIMATE_WINDOW_DAYS,
): MaintenanceEstimate {
  let windowStart = addDays(today, -(windowDays - 1))

  const lastSpan = phaseSpans(phaseLog).filter((s) => s.start <= today).slice(-1)[0]
  if (lastSpan && lastSpan.start > windowStart) windowStart = lastSpan.start

  const inWindow = (d: string) => d >= windowStart && d <= today
  const weightPts = entries
    .filter((e) => inWindow(e.date))
    .map((e) => ({ x: diffDays(windowStart, e.date), y: e.lbs }))
  const calPts = nutrition.filter((n) => inWindow(n.date) && n.kcal > 0)

  const calorieDays = calPts.length
  const spanDays = weightPts.length ? Math.max(...weightPts.map((p) => p.x)) - Math.min(...weightPts.map((p) => p.x)) : 0

  const base = {
    maintenance: null,
    meanIntake: null,
    weightChangeLbs: null,
    calorieDays,
    windowDays: spanDays,
    r2: 0,
  }

  if (calorieDays < MIN_CALORIE_DAYS) {
    return {
      ...base,
      kind: 'insufficient',
      note: `Need ${MIN_CALORIE_DAYS}+ days of food logging — have ${calorieDays}.`,
    }
  }
  if (weightPts.length < 2 || spanDays < 7) {
    return { ...base, kind: 'insufficient', note: 'Not enough weigh-ins in this window yet.' }
  }

  const fit = leastSquaresFit(weightPts)
  const weightChangeLbs = fit.slope * spanDays
  const meanIntake = mean(calPts.map((n) => n.kcal))
  const maintenanceRaw = meanIntake - (weightChangeLbs * KCAL_PER_LB) / spanDays

  const completeness = calorieDays / (spanDays + 1)
  const coverageWord = completeness >= 0.9 ? 'Very solid' : completeness >= 0.7 ? 'Reliable' : 'A bit sparse'

  if (maintenanceRaw < PLAUSIBLE_MAINTENANCE.lo || maintenanceRaw > PLAUSIBLE_MAINTENANCE.hi) {
    return {
      ...base,
      kind: 'unreliable',
      maintenance: round10(maintenanceRaw),
      meanIntake: Math.round(meanIntake),
      weightChangeLbs,
      windowDays: spanDays,
      r2: fit.r2,
      note: 'Estimate looks off — check for gaps in food logging or a noisy weight trend.',
    }
  }

  return {
    kind: 'ok',
    maintenance: round10(maintenanceRaw),
    meanIntake: Math.round(meanIntake),
    weightChangeLbs,
    calorieDays,
    windowDays: spanDays,
    r2: fit.r2,
    note: `${coverageWord} · ${fitQualityLabel(fit.r2).toLowerCase()}`,
  }
}

/** Daily calorie target to hit a weekly weight goal: maintenance shifted by the goal's daily
 * energy equivalent. `weeklyTargetLbs` is signed (negative for a cut), so a −1 lb/wk goal
 * subtracts 500/day. */
export function targetIntake(maintenance: number, weeklyTargetLbs: number): number {
  return round10(maintenance + (weeklyTargetLbs * KCAL_PER_LB) / 7)
}

/** How far recent intake is from the target — negative means "eat this many fewer per day".
 * Null when there's no usable estimate to compare against. */
export function intakeAdjustment(est: MaintenanceEstimate, weeklyTargetLbs: number): number | null {
  if (est.maintenance == null || est.meanIntake == null) return null
  return targetIntake(est.maintenance, weeklyTargetLbs) - est.meanIntake
}

export interface WeeklyKcal {
  monday: string
  kcal: number
  n: number
}

/** Mean daily calories per ISO week, for the History week rows. Weeks with no logged calories
 * are omitted, matching weeklyAverages. */
export function weeklyKcal(nutrition: NutritionEntry[]): WeeklyKcal[] {
  const groups = new Map<string, number[]>()
  for (const n of nutrition) {
    if (!(n.kcal > 0)) continue
    const key = mondayOf(n.date)
    const g = groups.get(key)
    if (g) g.push(n.kcal)
    else groups.set(key, [n.kcal])
  }
  return [...groups.entries()]
    .map(([monday, xs]) => ({ monday, kcal: Math.round(mean(xs)), n: xs.length }))
    .sort((a, b) => (a.monday < b.monday ? -1 : 1))
}
