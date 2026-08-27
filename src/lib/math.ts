import { DAY_MS, addDays, diffDays, mondayOf, parseDate } from './dates'

export interface Entry {
  date: string
  lbs: number
}

export interface WeeklyAverage {
  monday: string
  lbs: number
  n: number
}

export type PhaseName = 'Cut' | 'Bulk' | 'Maintain' | 'Deload'
export type Direction = 'Cut' | 'Bulk'

export interface PhaseLogEntry {
  start: string
  name: PhaseName
}

export interface PhaseSpan {
  dir: Direction
  start: string
}

export interface FitResult {
  intercept: number
  slope: number
  r2: number
}

/** Mean of entries within the last `days` calendar days ending `days-1-offsetDays` ago,
 * dividing by the number of entries actually found, not by `days` — missing days are simply absent. */
export function avg(entries: Entry[], days: number, today: string, offsetDays = 0): number | null {
  const hi = parseDate(today).getTime() - offsetDays * DAY_MS
  const lo = hi - (days - 1) * DAY_MS
  const values = entries
    .filter((e) => {
      const t = parseDate(e.date).getTime()
      return t >= lo && t <= hi
    })
    .map((e) => e.lbs)
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Groups entries by ISO Monday and means each group. Weeks with no entries are simply omitted. */
export function weeklyAverages(entries: Entry[]): WeeklyAverage[] {
  const groups = new Map<string, number[]>()
  for (const e of entries) {
    const key = mondayOf(e.date)
    const g = groups.get(key)
    if (g) g.push(e.lbs)
    else groups.set(key, [e.lbs])
  }
  return [...groups.entries()]
    .map(([monday, values]) => ({
      monday,
      lbs: values.reduce((a, b) => a + b, 0) / values.length,
      n: values.length,
    }))
    .sort((a, b) => (a.monday < b.monday ? -1 : 1))
}

/** Cut/Bulk direction implied by a phase name, or null for Maintain/Deload (which fold into the enclosing span). */
export function dirOf(name: string): Direction | null {
  if (/bulk/i.test(name)) return 'Bulk'
  if (/cut/i.test(name)) return 'Cut'
  return null
}

/** Deduped by ISO week (last entry wins per week), sorted ascending by start date.
 * Mandatory to run on both load and write: an unconditionally-appended phase log grows without
 * bound and stacks duplicate band edges at one x on the chart. */
export function dedupePhaseLog(log: PhaseLogEntry[]): PhaseLogEntry[] {
  const seen = new Map<string, PhaseLogEntry>()
  for (const p of log || []) {
    if (p?.start) seen.set(mondayOf(p.start), p)
  }
  return [...seen.values()].sort((a, b) => (a.start < b.start ? -1 : 1))
}

/** Cut/Bulk spans only, derived from a (deduped) phase log. Deload/Maintain fold into whatever
 * phase they sit inside, and consecutive entries of the same direction merge into one span. */
export function phaseSpans(log: PhaseLogEntry[]): PhaseSpan[] {
  const out: PhaseSpan[] = []
  for (const p of dedupePhaseLog(log)) {
    const dir = dirOf(p.name)
    if (!dir) continue
    if (out.length && out[out.length - 1].dir === dir) continue
    out.push({ dir, start: mondayOf(p.start) })
  }
  return out
}

/** ISO Mondays where a Deload/Maintain entry starts — these don't create their own chart band
 * (they fold into the enclosing Cut/Bulk span), but are still worth marking on the chart so a
 * "this week should look level, not trending" week is visible at a glance. */
export function foldedWeeks(log: PhaseLogEntry[]): string[] {
  return dedupePhaseLog(log)
    .filter((p) => !dirOf(p.name))
    .map((p) => mondayOf(p.start))
}

export interface PhaseAt {
  /** Folded Cut/Bulk direction in effect for that week (used for the History phase tag). */
  dir: Direction | null
  /** The raw phase name in effect (used for the History detail line, e.g. "Deload · 7 of 7 days"). */
  raw: PhaseName | null
}

/** Which phase was in effect for a given ISO Monday, both the folded Cut/Bulk direction and
 * the raw phase name (so History can show "Deload" while the chart band still reads "Cut").
 *
 * Deload/Maintain are one-week events, not standing states — a Deload logged for one Monday
 * must not keep labeling every week after it until the next log entry. Only the exact week it
 * was logged for shows the raw name; every other week falls back to the folded Cut/Bulk
 * direction, same as the chart band underneath it. */
export function phaseAt(monday: string, log: PhaseLogEntry[]): PhaseAt {
  const spans = phaseSpans(log)
  const span = spans.filter((p) => p.start <= monday).slice(-1)[0]
  const dir = span ? span.dir : null

  const exact = dedupePhaseLog(log).find((p) => mondayOf(p.start) === monday)
  return { dir, raw: exact ? exact.name : dir }
}

/** The direction (Cut/Bulk) the phase-aware sign rule should use: the current phase if it's
 * Cut/Bulk, otherwise the direction of the enclosing span (Maintain/Deload fold-in), defaulting
 * to Cut if there's no span history at all. */
export function currentDir(phase: PhaseName, log: PhaseLogEntry[]): Direction {
  const d = dirOf(phase)
  if (d) return d
  const spans = phaseSpans(log)
  return spans.length ? spans[spans.length - 1].dir : 'Cut'
}

export type SignColor = 'lime' | 'red' | 'grey'

/** |v| < 0.05 -> grey; otherwise lime if the value is "good" for the current phase direction
 * (positive for Bulk, negative for Cut), red if not. */
export function signColor(value: number, dir: Direction): SignColor {
  if (Math.abs(value) < 0.05) return 'grey'
  const good = dir === 'Bulk' ? value > 0 : value < 0
  return good ? 'lime' : 'red'
}

/** Ordinary least-squares fit over {x, y} points. x is typically a week index, y a weekly average. */
export function leastSquaresFit(points: { x: number; y: number }[]): FitResult {
  const n = points.length
  if (n < 2) return { intercept: n ? points[0].y : 0, slope: 0, r2: 0 }
  const mx = points.reduce((s, p) => s + p.x, 0) / n
  const my = points.reduce((s, p) => s + p.y, 0) / n
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.x - mx) * (p.y - my)
    den += (p.x - mx) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  const intercept = my - slope * mx
  let ssRes = 0
  let ssTot = 0
  for (const p of points) {
    const pred = intercept + slope * p.x
    ssRes += (p.y - pred) ** 2
    ssTot += (p.y - my) ** 2
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot
  return { intercept, slope, r2 }
}

/** The 4-week (or fewer) least-squares slope used to drive rate/wk, the pace ring, and the
 * Reach solver — the rate is always computed over the most recent `weeks` weekly averages. */
export function fitSlope(weekly: WeeklyAverage[], weeks: number): FitResult {
  const window = weekly.slice(-weeks)
  return leastSquaresFit(window.map((w, i) => ({ x: i, y: w.lbs })))
}

// --- Reach solver -----------------------------------------------------

const FLAT_THRESHOLD = 0.03

export interface ReachContext {
  /** Most recent weekly average (lbs) — the solver anchors here, not the 7-day average
   * and not the regression's fitted value. */
  current: number
  /** lbs/week, from the 4-week fit. */
  slopeLbs: number
  /** The Monday of the most recent weekly average — projections count forward from here. */
  lastMonday: string
}

export type ReachByWeightResult =
  | { kind: 'flat' }
  | { kind: 'unreachable'; slopeLbs: number }
  | { kind: 'reachable'; weeks: number; date: string; roundedWeeks: number }

export type ReachByDateResult =
  | { kind: 'flat'; weight: number; date: string }
  | { kind: 'projected'; weight: number; date: string }

// Rounds the total day count (weeks * 7), not weeks first then * 7 — the two diverge for
// fractional weeks (e.g. 19.87 weeks -> 139 days -> 10 Jan, vs a naive round(weeks)*7 -> 140
// days -> 11 Jan). This is a real prototype behavior, not what the README's formula literally
// says; verified against the "10 Jan 2027" Reach card output in screens/01-today.png.
function dateAtWeeks(lastMonday: string, weeks: number): string {
  return addDays(lastMonday, Math.round(weeks * 7))
}

export function solveByWeight(ctx: ReachContext, targetLbs: number): ReachByWeightResult {
  const flat = Math.abs(ctx.slopeLbs) < FLAT_THRESHOLD
  if (flat) return { kind: 'flat' }
  const weeks = (targetLbs - ctx.current) / ctx.slopeLbs
  const reachable = weeks > 0.2 && weeks <= 260
  if (!reachable) return { kind: 'unreachable', slopeLbs: ctx.slopeLbs }
  return {
    kind: 'reachable',
    weeks,
    roundedWeeks: Math.round(weeks),
    date: dateAtWeeks(ctx.lastMonday, weeks),
  }
}

export function solveByDate(ctx: ReachContext, targetWeeks: number): ReachByDateResult {
  const flat = Math.abs(ctx.slopeLbs) < FLAT_THRESHOLD
  const weight = ctx.current + ctx.slopeLbs * targetWeeks
  const date = dateAtWeeks(ctx.lastMonday, targetWeeks)
  return flat ? { kind: 'flat', weight, date } : { kind: 'projected', weight, date }
}

/** The projection horizon (weeks) the Today chart should draw, coupled to the solver:
 * clamped 1-52 when reachable, falling back to 6 when flat/unreachable. In 'date' solve mode
 * the chart instead follows the user-chosen targetWeeks directly. */
export function projectionWeeks(
  solveMode: 'weight' | 'date',
  targetWeeks: number,
  weightResult: ReachByWeightResult,
): number {
  if (solveMode === 'date') return targetWeeks
  if (weightResult.kind !== 'reachable') return 6
  return Math.min(52, Math.max(1, weightResult.roundedWeeks))
}

export function daysBetween(a: string, b: string): number {
  return diffDays(a, b)
}

// --- Pace ring -----------------------------------------------------

export interface PaceStatus {
  onPace: boolean
  /** Percent of weekly target achieved, clamped 0-150 (can exceed 100 when running ahead). */
  pct: number
}

/** Whether the 4-week rate is keeping pace with the signed weekly target, and by how much.
 * A weeklyTarget of 0 (Maintain) is "on pace" when the rate is within +/-0.35 lbs/wk of flat;
 * otherwise on-pace means the rate has reached at least 75% of the signed target. */
export function paceStatus(slopeLbs: number, weeklyTarget: number): PaceStatus {
  if (weeklyTarget === 0) {
    const onPace = Math.abs(slopeLbs) < 0.35
    return { onPace, pct: onPace ? 100 : 60 }
  }
  const onPace = weeklyTarget < 0 ? slopeLbs <= weeklyTarget * 0.75 : slopeLbs >= weeklyTarget * 0.75
  const pct = Math.max(0, Math.min(150, Math.round((slopeLbs / weeklyTarget) * 100)))
  return { onPace, pct }
}

// --- Data quality (Trends) -----------------------------------------

export interface CompletionRatio {
  logged: number
  possible: number
  pct: number
  label: string
}

/** How many of the possible days in a Trends window actually have a logged entry — a trust
 * signal for the trend numbers next to it (a slope fit on 60% of days is noisier than one on
 * 95%). The window is clamped to not start before the first-ever entry, so "ALL" doesn't count
 * days before tracking began as "missed". */
export function completionRatio(entries: Entry[], windowWeeks: number, today: string): CompletionRatio {
  const windowStart = addDays(today, -(windowWeeks * 7 - 1))
  const firstEntryDate = entries.reduce((min, e) => (e.date < min ? e.date : min), today)
  const lo = firstEntryDate > windowStart ? firstEntryDate : windowStart
  const possible = diffDays(lo, today) + 1
  const logged = entries.filter((e) => e.date >= lo && e.date <= today).length
  const pct = possible > 0 ? Math.round((logged / possible) * 100) : 0
  return { logged, possible, pct, label: completionLabel(pct) }
}

export function completionLabel(pct: number): string {
  if (pct >= 90) return 'Very accurate'
  if (pct >= 70) return 'Reliable'
  if (pct >= 50) return 'A bit sparse'
  return 'Too sparse to trust'
}

/** Plain-English read on how tightly a fit's R² actually sits on the line — the raw number
 * alone doesn't say whether 0.7 is "fine" or "concerning". */
export function fitQualityLabel(r2: number): string {
  if (r2 >= 0.9) return 'Tight fit'
  if (r2 >= 0.7) return 'Decent fit'
  if (r2 >= 0.4) return 'Noisy'
  return 'Very noisy'
}

/** Consecutive days logged counting back from today. If today isn't logged yet (e.g. you
 * haven't weighed in this morning), counts back from yesterday instead — the streak isn't
 * broken until a day actually passes without an entry. */
export function currentStreak(entries: Entry[], today: string): number {
  const logged = new Set(entries.map((e) => e.date))
  let d = logged.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (logged.has(d)) {
    streak++
    d = addDays(d, -1)
  }
  return streak
}

/** The longest run of consecutive logged days across the whole history, not just the current
 * streak — a "personal best" to put the current streak in context. */
export function longestStreak(entries: Entry[]): number {
  const dates = [...new Set(entries.map((e) => e.date))].sort()
  let best = 0
  let run = 0
  let prev: string | null = null
  for (const d of dates) {
    run = prev && diffDays(prev, d) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  return best
}
