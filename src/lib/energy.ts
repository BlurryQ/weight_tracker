import { addDays, diffDays, mondayOf } from './dates'
import {
  fitQualityLabel,
  fitSlope,
  leastSquaresFit,
  phaseSpans,
  type Entry,
  type PhaseLogEntry,
  type WeeklyAverage,
} from './math'

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
  /** Plain-English read, e.g. "Reliable · tight fit" or why there's no number yet. */
  note: string
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
    windowStart,
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
  /** Window-end date — the `today` handed to estimateMaintenance for this step. */
  date: string
  /** ISO date the window actually starts on (phase clamp can make it shorter than `windowDays`). */
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
}

export interface MaintenanceHistory {
  /** Every computed window, oldest first — including non-gated ones (drawn dimmed on the chart). */
  points: MaintenancePoint[]
  /** Just the gated (`kind === 'ok'`) points, oldest first. This is the series adherence calc 2
   * references. */
  gated: MaintenancePoint[]
  stepDays: number
  windowDays: number
}

/** Feature #8 — no new formula: call estimateMaintenance() on a rolling basis (every `stepDays`,
 * over a trailing `windowDays` window) and collect the series. No new persistence — recomputed
 * live from entries/nutrition/phaseLog the same way weeklyAverages() is. Points run from the
 * first date that can hold a full window through `today`, with `today` itself always the last. */
export function computeMaintenanceHistory(
  entries: Entry[],
  nutrition: NutritionEntry[],
  phaseLog: PhaseLogEntry[],
  today: string,
  stepDays = MAINTENANCE_HISTORY_STEP_DAYS,
  windowDays = ESTIMATE_WINDOW_DAYS,
): MaintenanceHistory {
  const step = Math.max(1, Math.round(stepDays))
  const dates: string[] = []

  const known = [...entries.map((e) => e.date), ...nutrition.map((n) => n.date)].filter((d) => d <= today)
  if (known.length) {
    const first = known.reduce((min, d) => (d < min ? d : min), today)
    let cursor = addDays(first, windowDays - 1)
    if (cursor > today) cursor = today
    while (cursor < today) {
      dates.push(cursor)
      cursor = addDays(cursor, step)
    }
  }
  dates.push(today)

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
    }
  })

  return { points, gated: points.filter((p) => p.kind === 'ok'), stepDays: step, windowDays }
}

// --- #6 · logging accuracy / adherence check ------------------------

/** The weight-density constant estimateMaintenance would pick for a window ending `today`:
 * gain density on a logged Bulk span, loss density otherwise; with no phase history at all it
 * falls back to the sign of `observedChange`. Mirrors estimateMaintenance's own `kcalPerLb`
 * choice so adherence's predicted rate speaks the same units as the estimate it references. */
export function phaseKcalPerLb(phaseLog: PhaseLogEntry[], today: string, observedChange = 0): number {
  const lastSpan = phaseSpans(phaseLog).filter((s) => s.start <= today).slice(-1)[0]
  const gaining = lastSpan ? lastSpan.dir === 'Bulk' : observedChange > 0
  return gaining ? KCAL_PER_LB_GAIN : KCAL_PER_LB_LOSS
}

/** Walk backwards from just before `beforeDate` for the nearest window whose estimateMaintenance()
 * comes back gated (`kind === 'ok'`). Windows that land `insufficient` or `unreliable` are
 * skipped outright — they never serve as a reference and don't count as "the prior window", so a
 * lapse in the middle of history is stepped straight over. Returns null when no gated window
 * exists anywhere earlier (the correct state on a first-ever eligible window, and again whenever
 * a lapse breaks the chain).
 *
 * The match is always strictly earlier than `beforeDate`, so when `beforeDate` is the current
 * evaluation window's start the reference window is fully disjoint from it — that disjointness is
 * exactly what stops predictedRate collapsing into estimateMaintenance's own identity. */
export function findNearestGatedWindow(
  entries: Entry[],
  nutrition: NutritionEntry[],
  phaseLog: PhaseLogEntry[],
  beforeDate: string,
  windowDays = ESTIMATE_WINDOW_DAYS,
): { date: string; estimate: MaintenanceEstimate } | null {
  const known = [...entries.map((e) => e.date), ...nutrition.map((n) => n.date)].filter((d) => d < beforeDate)
  if (!known.length) return null
  const earliest = known.reduce((min, d) => (d < min ? d : min), beforeDate)
  // A window ending earlier than this can't hold the minimum calorie days, so stop there.
  const floor = addDays(earliest, MIN_CALORIE_DAYS - 1)

  for (let d = addDays(beforeDate, -1); d >= floor; d = addDays(d, -1)) {
    const est = estimateMaintenance(entries, nutrition, phaseLog, d, windowDays)
    if (est.kind === 'ok') return { date: d, estimate: est }
  }
  return null
}

export type AdherenceLive = 'calc1' | 'calc2'

export interface AdherenceReference {
  /** Where the reference maintenance came from. */
  source: 'nearest-gated-window' | 'maintenance-series'
  /** Reference maintenance (kcal/day) — never drawn from the window being evaluated. */
  maintenance: number
  /** Window-end date the reference was taken at. */
  date: string
  /** Reference window's start date (calc 1 only). */
  windowStart?: string
}

export interface AdherenceCalc {
  reference: AdherenceReference
  /** Mean logged intake across the current evaluation window (kcal/day). */
  avgLoggedIntake: number
  /** Phase-keyed density (3500 loss / 3100 gain), same rule estimateMaintenance uses. */
  kcalPerLb: number
  /** Rate the logged intake implies against the reference maintenance (lb/week). */
  predictedRate: number
  /** Rate the actual weight trend is moving at (lb/week), from fitSlope over the trend window. */
  actualRate: number
  /** actualRate − predictedRate. ≈0 = the log explains the trend; away from 0 = it doesn't. */
  divergence: number
}

export interface AdherenceHistoryPoint {
  /** Window-end date. */
  date: string
  predictedRate: number
  actualRate: number
  divergence: number
}

export interface AdherenceResult {
  /** False === "not enough data": neither calc applies (no gated prior window anywhere yet, or
   * the current window itself isn't gated). */
  applicable: boolean
  /** Which calc the production selection rule surfaces — calc2 when available, else calc1, else
   * null. Lab tags this one "LIVE". */
  live: AdherenceLive | null
  /** Calc 1 (noisier) — reference = nearest previously-gated raw window. Null when none exists. */
  calc1: AdherenceCalc | null
  /** Calc 2 (tighter) — reference = the #8 rolling series' gated point nearest the current
   * window's start. Null when the series has < 2 gated points (then calc1 is the fallback). */
  calc2: AdherenceCalc | null
  /** The current evaluation window's own estimate — both calcs require this to be gated. */
  currentEst: MaintenanceEstimate
  /** Per-window divergence across the recent rolling windows, oldest first — lets the
   * "is this divergence persistent?" question be read by eye, no threshold layer baked in. */
  divergenceHistory: AdherenceHistoryPoint[]
  note: string
}

/** Feature #6 — logged intake implies a weight-change rate; compare it to the measured trend
 * rate. `predictedRate = (avgLoggedIntake − referenceMaintenance) / kcalPerLb · 7`, and
 * `divergence = actualRate − predictedRate`.
 *
 * The reference maintenance must never come from the window being evaluated: substitute
 * estimateMaintenance's own formula back in and predictedRate cancels to actualRate exactly, so
 * divergence would read ≈0 no matter the real adherence. Two disjoint reference sources instead,
 * both computed here so Lab can show them side by side:
 *  - calc1: the nearest previously plausibility-gated window's estimate (walk-back, skipping
 *    insufficient/unreliable). Needs the current window gated too.
 *  - calc2: the smoothed value from the #8 rolling series at the point nearest the current
 *    window's start — needs ≥2 gated series points, else falls back to calc1.
 * Selection rule: calc2 if present, else calc1, else "not enough data". */
export function computeAdherence(
  entries: Entry[],
  nutrition: NutritionEntry[],
  phaseLog: PhaseLogEntry[],
  weekly: WeeklyAverage[],
  today: string,
  opts: { trendWeeks?: number; windowDays?: number; historyStepDays?: number } = {},
): AdherenceResult {
  const trendWeeks = opts.trendWeeks ?? 4
  const windowDays = opts.windowDays ?? ESTIMATE_WINDOW_DAYS
  const historyStepDays = opts.historyStepDays ?? MAINTENANCE_HISTORY_STEP_DAYS

  const currentEst = estimateMaintenance(entries, nutrition, phaseLog, today, windowDays)
  const actualRate = fitSlope(weekly, trendWeeks).slope
  const kcalPerLb = phaseKcalPerLb(phaseLog, today, currentEst.weightChangeLbs ?? actualRate)
  const history = computeMaintenanceHistory(entries, nutrition, phaseLog, today, historyStepDays, windowDays)

  const mkCalc = (reference: AdherenceReference): AdherenceCalc => {
    const avgLoggedIntake = currentEst.meanIntake as number
    const predictedRate = ((avgLoggedIntake - reference.maintenance) / kcalPerLb) * 7
    return { reference, avgLoggedIntake, kcalPerLb, predictedRate, actualRate, divergence: actualRate - predictedRate }
  }

  let calc1: AdherenceCalc | null = null
  let calc2: AdherenceCalc | null = null

  if (currentEst.kind === 'ok') {
    const nearest = findNearestGatedWindow(entries, nutrition, phaseLog, currentEst.windowStart, windowDays)
    if (nearest && nearest.estimate.maintenance != null) {
      calc1 = mkCalc({
        source: 'nearest-gated-window',
        maintenance: nearest.estimate.maintenance,
        date: nearest.date,
        windowStart: nearest.estimate.windowStart,
      })
    }

    // Never let calc2 pick a series point that reaches into the current window.
    const eligible = history.gated.filter((p) => p.date < today && p.maintenance != null)
    if (eligible.length >= 2) {
      const anchor = currentEst.windowStart
      const nearestPoint = eligible.reduce((best, p) =>
        Math.abs(diffDays(p.date, anchor)) < Math.abs(diffDays(best.date, anchor)) ? p : best,
      )
      calc2 = mkCalc({
        source: 'maintenance-series',
        maintenance: nearestPoint.maintenance as number,
        date: nearestPoint.date,
      })
    }
  }

  const live: AdherenceLive | null = calc2 ? 'calc2' : calc1 ? 'calc1' : null
  const applicable = live !== null

  const note = !applicable
    ? currentEst.kind !== 'ok'
      ? `Current window isn't gated (${currentEst.kind}) — no adherence read yet.`
      : 'No gated prior window anywhere in history yet — not enough data.'
    : live === 'calc2'
      ? 'LIVE: calc 2 — rolling-series reference.'
      : 'LIVE: calc 1 — nearest gated window. Calc 2 needs 2+ gated series points.'

  return {
    applicable,
    live,
    calc1,
    calc2,
    currentEst,
    divergenceHistory: adherenceDivergenceHistory(history, phaseLog, weekly, trendWeeks),
    note,
  }
}

/** Divergence for each consecutive pair of gated rolling windows — reference is the *previous*
 * gated window's maintenance, never the window's own (same anti-tautology rule as the live
 * calc). Purely a visual aid for spotting a divergence that holds across 3+ windows; no
 * threshold or persistence logic is applied here on purpose. */
function adherenceDivergenceHistory(
  history: MaintenanceHistory,
  phaseLog: PhaseLogEntry[],
  weekly: WeeklyAverage[],
  trendWeeks: number,
): AdherenceHistoryPoint[] {
  const out: AdherenceHistoryPoint[] = []
  const { gated } = history
  for (let i = 1; i < gated.length; i++) {
    const cur = gated[i]
    const ref = gated[i - 1]
    if (cur.meanIntake == null || ref.maintenance == null) continue
    const kcalPerLb = phaseKcalPerLb(phaseLog, cur.date, cur.weightChangeLbs ?? 0)
    const predictedRate = ((cur.meanIntake - ref.maintenance) / kcalPerLb) * 7
    const actualRate = fitSlope(weekly.filter((w) => w.monday <= cur.date), trendWeeks).slope
    out.push({ date: cur.date, predictedRate, actualRate, divergence: actualRate - predictedRate })
  }
  return out
}
