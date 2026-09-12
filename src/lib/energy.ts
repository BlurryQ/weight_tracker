import { addDays, diffDays, fullDate, mondayOf } from './dates'
import { fitQualityLabel, leastSquaresFit, phaseSpans, type Entry, type PhaseLogEntry } from './math'

/** Energy equivalent of body **fat** — the tissue a cut mostly strips. 3500 kcal/lb
 * (≈ 7700 kcal/kg), the standard energy-balance constant. */
export const KCAL_PER_LB_LOSS = 3500

/** Energy equivalent of weight **gained** on a bulk — lower than fat, because a gain is part
 * lean tissue (~70% water), part glycogen + bound water, part gut fill. 3100 is a conservative
 * blend (mostly fat, a little lean/water); tune down for leaner/faster gains, up for an
 * advanced lifter whose surplus adds barely any muscle. */
export const KCAL_PER_LB_GAIN = 3100

/** Back-compat alias — the loss value is the historical single constant. */
export const KCAL_PER_LB = KCAL_PER_LB_LOSS

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

/** Which of estimateMaintenance's three data gates failed, when kind === 'insufficient'. */
export type InsufficientCheck = 'calorie-days' | 'weigh-ins' | 'day-span'

export interface InsufficientReason {
  /** The gate that failed. */
  check: InsufficientCheck
  /** The value we had. */
  have: number
  /** The value the gate needs. */
  need: number
  /** ISO date (the phase span's Monday) the window was clamped to, set only when the window is
   * short *because of that phase change* rather than sparse logging — else null. This is the
   * one that turns a "why is this window empty?" dig into a one-line answer. */
  clampedByPhaseChange: string | null
  /** Window length in days once any phase clamp is applied (today − windowStart + 1). */
  effectiveWindowDays: number
}

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
  /** ISO date the window actually starts on — `ESTIMATE_WINDOW_DAYS` back, or the current
   * Cut/Bulk phase start if that's more recent (the clamp). Lets the card explain a short
   * window right after a phase change. */
  windowStart: string
  /** R² of the weight fit over the window — a trust signal for the number next to it. */
  r2: number
  /** Plain-English read, e.g. "Reliable · tight fit" or why there's no number yet. When
   * kind === 'insufficient' this spells out which gate failed, the numbers, and any phase clamp. */
  note: string
  /** Populated only when kind === 'insufficient': the structured form of the note's reason, so
   * callers can render it their own way. Null on every other kind. */
  insufficientReason: InsufficientReason | null
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function round10(n: number): number {
  return Math.round(n / 10) * 10
}

/** Adaptive-TDEE estimate: rearrange `Δweight ≈ (intake − TDEE) · days / kcalPerLb` to solve
 * for TDEE over a recent window, where kcalPerLb is fat density on a cut and the lower gain
 * density on a bulk (see the constants). The window starts `ESTIMATE_WINDOW_DAYS` back but is
 * pulled forward to the most recent Cut/Bulk phase change if that's more recent, so the average
 * never blends two different diets. Maintain/Deload weeks are left in — the equation
 * self-corrects for them (intake rises as the weight change shrinks). */
export function estimateMaintenance(
  entries: Entry[],
  nutrition: NutritionEntry[],
  phaseLog: PhaseLogEntry[],
  today: string,
  windowDays = ESTIMATE_WINDOW_DAYS,
): MaintenanceEstimate {
  const rawWindowStart = addDays(today, -(windowDays - 1))

  const lastSpan = phaseSpans(phaseLog).filter((s) => s.start <= today).slice(-1)[0]
  // The window is "clamped" only when a phase change lands *inside* the raw window — that, not
  // sparse logging, is then the reason a short window can't clear the data gates.
  const clampedByPhaseChange = lastSpan && lastSpan.start > rawWindowStart ? lastSpan.start : null
  const windowStart = clampedByPhaseChange ?? rawWindowStart

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
    windowStart,
    r2: 0,
    insufficientReason: null,
  }

  const effectiveWindowDays = diffDays(windowStart, today) + 1
  const clampNote = clampedByPhaseChange
    ? ` — window clamped to ${effectiveWindowDays} days by the ${fullDate(clampedByPhaseChange)} phase change`
    : ''
  const reason = (check: InsufficientCheck, have: number, need: number): InsufficientReason => ({
    check,
    have,
    need,
    clampedByPhaseChange,
    effectiveWindowDays,
  })

  if (calorieDays < MIN_CALORIE_DAYS) {
    return {
      ...base,
      kind: 'insufficient',
      note: `Only ${calorieDays} of ${MIN_CALORIE_DAYS} calorie-days in the window${clampNote}.`,
      insufficientReason: reason('calorie-days', calorieDays, MIN_CALORIE_DAYS),
    }
  }
  if (weightPts.length < 2) {
    return {
      ...base,
      kind: 'insufficient',
      note: `Only ${weightPts.length} of 2 weigh-ins needed in the window${clampNote}.`,
      insufficientReason: reason('weigh-ins', weightPts.length, 2),
    }
  }
  if (spanDays < 7) {
    return {
      ...base,
      kind: 'insufficient',
      note: `Weigh-ins span just ${spanDays} of the 7 days needed${clampNote}.`,
      insufficientReason: reason('day-span', spanDays, 7),
    }
  }

  const fit = leastSquaresFit(weightPts)
  const weightChangeLbs = fit.slope * spanDays
  const meanIntake = mean(calPts.map((n) => n.kcal))
  // Density of the weight that actually moved: fat on a cut, a leaner mix on a bulk. Keyed off
  // the logged phase, not the scale sign — so the first flat/down week of a bulk (glycogen and
  // water still settling) still uses the gain value. Falls back to observed direction only when
  // there's no phase history at all.
  const gaining = lastSpan ? lastSpan.dir === 'Bulk' : weightChangeLbs > 0
  const kcalPerLb = gaining ? KCAL_PER_LB_GAIN : KCAL_PER_LB_LOSS
  const maintenanceRaw = meanIntake - (weightChangeLbs * kcalPerLb) / spanDays

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
    windowStart,
    r2: fit.r2,
    note: `${coverageWord} · ${fitQualityLabel(fit.r2).toLowerCase()}`,
    insufficientReason: null,
  }
}

/** Daily calorie target to hit a weekly weight goal: maintenance shifted by the goal's daily
 * energy equivalent. `weeklyTargetLbs` is signed — a −1 lb/wk goal subtracts at fat density
 * (500/day), a +0.5 lb/wk goal adds at the leaner gain density. */
export function targetIntake(maintenance: number, weeklyTargetLbs: number): number {
  const kcalPerLb = weeklyTargetLbs < 0 ? KCAL_PER_LB_LOSS : KCAL_PER_LB_GAIN
  return round10(maintenance + (weeklyTargetLbs * kcalPerLb) / 7)
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

// --- #8 · metabolic adaptation: rolling maintenance series -----------

/** Default cadence for the rolling series — a fresh 28-day window every ~2 weeks, so
 * consecutive windows overlap ~50%. The user's note: this is the parameter that "needs the most
 * care on window choice", so both this and the window length are surfaced as Lab tunables. */
export const MAINTENANCE_HISTORY_STEP_DAYS = 14

export interface MaintenancePoint {
  /** Window-end date — an ISO Monday, the `today` handed to estimateMaintenance for this step.
   * Anchored to the same Monday grid weeklyAverages()/History use, so a series row lines up 1:1
   * with a History week rather than floating a few days off it. */
  date: string
  /** ISO date the window actually starts on (phase clamp can make it shorter than `windowDays`).
   * Not a week boundary — a `windowDays`-long span ending on `date`. */
  windowStart: string
  /** estimateMaintenance's verdict for this window. */
  kind: MaintenanceKind
  /** Maintenance estimate (kcal/day); null when the window came back `insufficient`. */
  maintenance: number | null
  /** Mean logged intake across the window (kcal/day); null when insufficient. */
  meanIntake: number | null
  /** Modelled weight change (lbs) across the window. */
  weightChangeLbs: number | null
  /** R² of the window's weight fit. */
  r2: number
  /** estimateMaintenance's plain-English `note` for this window — carries the insufficient
   * reason (which gate, the numbers, any phase clamp) so the series table can show it inline. */
  note: string
  /** Structured insufficient reason, when `kind === 'insufficient'`; null otherwise. */
  insufficientReason: InsufficientReason | null
  /** Series-level flag: `'outlier'` when this *gated* point sits far off the pattern of the
   * rest of this person's own series — a relative check against the other gated points, not the
   * fixed 1200–5000 band that drives `'unreliable'`. Null when the point is in-pattern, when
   * there aren't enough gated points to judge, or when it isn't gated at all. Flagged points
   * still render; they're just kept out of the drift maths and the adherence calc-2 reference. */
  seriesFlag: 'outlier' | null
}

export interface MaintenanceHistory {
  /** Every computed window, oldest first — including non-gated ones (drawn dimmed on the chart). */
  points: MaintenancePoint[]
  /** The gated (`kind === 'ok'`) points, oldest first — outliers included. Use this for anything
   * that wants to *show* the raw series (chart markers, the divergence-history row). */
  gated: MaintenancePoint[]
  /** Gated points that also pass the series-level outlier check (`seriesFlag === null`), oldest
   * first — the set the DRIFT/4WK fit, NET DRIFT endpoints, and adherence calc 2 should use. */
  trend: MaintenancePoint[]
  stepDays: number
  windowDays: number
}

/** Minimum gated points before the series outlier check runs at all — below this there isn't a
 * stable enough "rest of the series" to judge any one point against, so nothing is flagged. */
export const OUTLIER_MIN_GATED = 4
/** Ignore deviations smaller than this (kcal) from the others' median — noise, not an outlier. */
const OUTLIER_ABS_FLOOR = 250
/** How many of the others' scaled-MAD a deviation must clear to count. */
const OUTLIER_K = 3
/** Only judge a point against the rest when the rest are themselves this tight or tighter
 * (scaled MAD, kcal) — otherwise "the pattern" isn't defined well enough to call anything off it. */
const OUTLIER_BASELINE_MAX_MAD = 150

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Tags each gated point `'outlier'` when its maintenance sits far off the median of *all the
 * other* gated points — a relative, self-referential check for the early water-weight/glycogen
 * confound (a first estimate that doesn't match the person's later, settled ones), distinct
 * from `'unreliable'`'s absolute plausibility band. Single pass: every point is judged against
 * the others as-is (a second same-side outlier could mask the first — acceptable for now).
 * Mutates `points` in place. */
function flagSeriesOutliers(points: MaintenancePoint[]): void {
  const gated = points.filter((p) => p.kind === 'ok' && p.maintenance != null)
  if (gated.length < OUTLIER_MIN_GATED) return
  for (const p of gated) {
    const others = gated.filter((o) => o !== p).map((o) => o.maintenance as number)
    const med = median(others)
    const scaledMad = 1.4826 * median(others.map((o) => Math.abs(o - med)))
    const dev = Math.abs((p.maintenance as number) - med)
    if (scaledMad <= OUTLIER_BASELINE_MAX_MAD && dev >= OUTLIER_ABS_FLOOR && dev >= OUTLIER_K * scaledMad) {
      p.seriesFlag = 'outlier'
    }
  }
}

/** Feature #8 — no new formula: call estimateMaintenance() on a rolling basis (every `stepDays`,
 * over a trailing `windowDays` window) and collect the series. No new persistence — recomputed
 * live from entries/nutrition/phaseLog the same way weeklyAverages() is.
 *
 * Every window ends on an ISO Monday (the step is snapped to whole weeks), so the series shares
 * History's week grid and the two can be read side by side. Points run from the first Monday
 * whose trailing window can hold data through the Monday of `today`. */
export function computeMaintenanceHistory(
  entries: Entry[],
  nutrition: NutritionEntry[],
  phaseLog: PhaseLogEntry[],
  today: string,
  stepDays = MAINTENANCE_HISTORY_STEP_DAYS,
  windowDays = ESTIMATE_WINDOW_DAYS,
): MaintenanceHistory {
  const weekStep = Math.max(7, Math.round(stepDays / 7) * 7)
  const dates: string[] = []

  const lastMonday = mondayOf(today)
  const known = [...entries.map((e) => e.date), ...nutrition.map((n) => n.date)].filter((d) => d <= today)
  if (known.length) {
    const first = known.reduce((min, d) => (d < min ? d : min), today)
    let startMonday = mondayOf(addDays(first, windowDays - 1))
    if (startMonday > lastMonday) startMonday = lastMonday
    for (let d = startMonday; d < lastMonday; d = addDays(d, weekStep)) dates.push(d)
  }
  dates.push(lastMonday)

  const points: MaintenancePoint[] = dates.map((d) => {
    const est = estimateMaintenance(entries, nutrition, phaseLog, d, windowDays)
    return {
      date: d,
      windowStart: est.windowStart,
      kind: est.kind,
      maintenance: est.maintenance,
      meanIntake: est.meanIntake,
      weightChangeLbs: est.weightChangeLbs,
      r2: est.r2,
      note: est.note,
      insufficientReason: est.insufficientReason,
      seriesFlag: null,
    }
  })

  flagSeriesOutliers(points)
  const gated = points.filter((p) => p.kind === 'ok')
  const trend = gated.filter((p) => p.seriesFlag === null)
  return { points, gated, trend, stepDays: weekStep, windowDays }
}

