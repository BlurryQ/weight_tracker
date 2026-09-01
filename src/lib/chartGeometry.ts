import { addDays } from './dates'
import { leastSquaresFit, type PhaseSpan, type WeeklyAverage } from './math'

export interface ChartConfig {
  W: number
  H: number
  gutter: number
  /** How many trailing weekly averages to show. */
  showN: number
  /** How many of the shown weeks the fit line is computed over. */
  fitK: number
  /** Projection horizon, in weeks. */
  fwd: number
  gridN: number
}

export interface GridLine {
  y: number
  value: number
}

export interface Band {
  x: number
  width: number
  cut: boolean
  label: string
}

export interface ChartDot {
  x: number
  y: number
}

export interface ChartGeometry {
  line: string
  area: string
  /** Short faint connector from ~4 weeks back to the last actual point, at the fit slope —
   * the backward half of the trend line, whose forward half is `proj`. Drawn solid and dim so
   * it reads as one continuous line through the data, not a separate overlay. */
  trendPast: string
  proj: string
  grid: GridLine[]
  bands: Band[]
  /** X positions of Deload/Maintain weeks — thin markers drawn over a band, not a band edge. */
  markers: number[]
  /** Faint reference projection at the weekly target rate, anchored at the same point as `proj`
   * — "if this continues" (`proj`) vs. "if you'd been exactly on target" (`targetProj`), so the
   * gap between them is visible. Empty string when no target rate was given. */
  targetProj: string
  /** Y of the target line's forward end, for drawing its terminal tick and label. 0 when there
   * is no target line. */
  targetProjY: number
  dots: ChartDot[]
  lastX: number
  lastY: number
  projX: number
  projY: number
  slope: number
  r2: number
  /** How many trailing weekly points actually fed the fit — `fitK`, or fewer when the fit was
   * clamped to the current phase. */
  fitWeeks: number
  projVal: number
  projDate: string
  first: number
  last: number
  weeks: number
  lastMonday: string
}

const EMPTY_GEOMETRY: ChartGeometry = {
  line: '',
  area: '',
  trendPast: '',
  proj: '',
  grid: [],
  bands: [],
  markers: [],
  targetProj: '',
  targetProjY: 0,
  dots: [],
  lastX: 0,
  lastY: 0,
  projX: 0,
  projY: 0,
  slope: 0,
  r2: 0,
  fitWeeks: 0,
  projVal: 0,
  projDate: '',
  first: 0,
  last: 0,
  weeks: 0,
  lastMonday: '',
}

/** Pure geometry for the weekly-average chart shared by Today and Trends. Converts to display
 * units via `convert` (identity for lbs) but does all position/fit math in whatever unit
 * `convert` produces, matching the prototype's "convert once, early" approach for the chart only
 * (unlike the rest of the app, which stays in lbs until the display boundary) — the chart's fit
 * line and gridlines are drawn directly in display units. */
export function buildChartGeometry(
  weekly: WeeklyAverage[],
  spans: PhaseSpan[],
  cfg: ChartConfig,
  convert: (lbs: number) => number = (v) => v,
  markerWeeks: string[] = [],
  targetSlopeLbs?: number,
): ChartGeometry {
  const show = weekly.slice(-cfg.showN)
  if (show.length < 2) return EMPTY_GEOMETRY

  const n = show.length
  const slots = n - 1 + cfg.fwd
  const k = Math.min(cfg.fitK, n)
  const pts = show.map((w, i) => ({ x: i, y: convert(w.lbs) }))

  // Fit inside the current phase only. On wide windows the trailing `k` weeks can straddle the
  // last Cut↔Bulk change, averaging two opposite slopes into a meaningless rate (and a
  // misleading projection). Start the fit at whichever is later — `k` weeks back, or the
  // current phase's first shown week — but keep at least 3 weekly points in the regression.
  const spanStart = spans.length ? spans[spans.length - 1].start : ''
  const spanIdx = spanStart ? show.findIndex((w) => w.monday >= spanStart) : 0
  const fitStart = Math.max(0, Math.min(Math.max(n - k, spanIdx < 0 ? 0 : spanIdx), n - 3))
  const fit = leastSquaresFit(pts.slice(fitStart))
  // Everything below is anchored at the last *actual* point, not the regression's fitted value
  // there — anchoring on the intercept kinks the line where it meets the data and misprojects a
  // flat all-time fit above/below current weight.
  const last = pts[n - 1].y
  const projected = last + fit.slope * cfg.fwd
  // Same anchor, at the weekly target rate — "if you'd been exactly on target", for comparison.
  const targetProjected = targetSlopeLbs != null ? last + convert(targetSlopeLbs) * cfg.fwd : null

  // The trend line is one object: a short faint connector back into the data, continued forward
  // as the dashed projection. Drawn at the fit slope through the last actual point; the backward
  // part is just long enough to visually tie it to the data (~4 weeks), not the whole fit span.
  const trendPastStart = Math.max(0, Math.max(fitStart, n - 5))
  const trendStartY = last + fit.slope * (trendPastStart - (n - 1))

  const allValues = pts.map((p) => p.y).concat([projected, trendStartY])
  if (targetProjected != null) allValues.push(targetProjected)
  const lo = Math.min(...allValues) - 1.2
  const hi = Math.max(...allValues) + 1.2
  const X = (i: number) => (i / slots) * cfg.W
  const Y = (v: number) => cfg.H - ((v - lo) / (hi - lo)) * (cfg.H - 10) - 3

  const line = pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ')
  const area = line + ' L' + X(n - 1).toFixed(1) + ' ' + cfg.H + ' L0 ' + cfg.H + ' Z'
  const trendPast =
    'M' + X(trendPastStart).toFixed(1) + ' ' + Y(trendStartY).toFixed(1) + ' L' + X(n - 1).toFixed(1) + ' ' + Y(last).toFixed(1)
  const proj =
    'M' + X(n - 1).toFixed(1) + ' ' + Y(last).toFixed(1) + ' L' + X(slots).toFixed(1) + ' ' + Y(projected).toFixed(1)
  const targetProj =
    targetProjected != null
      ? 'M' + X(n - 1).toFixed(1) + ' ' + Y(last).toFixed(1) + ' L' + X(slots).toFixed(1) + ' ' + Y(targetProjected).toFixed(1)
      : ''
  const targetProjY = targetProjected != null ? Y(targetProjected) : 0

  const grid: GridLine[] = []
  const gn = cfg.gridN
  for (let g = 0; g < gn; g++) {
    const v = lo + ((hi - lo) * g) / (gn - 1)
    grid.push({ y: Y(v), value: Math.round(v) })
  }

  // Phase bands: one per span whose start falls within the shown window, only rendered if
  // wider than 6px, labeled only if wider than 46px.
  const bandStarts = spans
    .map((s) => ({ dir: s.dir, i: show.findIndex((w) => w.monday >= s.start) }))
    .filter((s) => s.i !== -1)
  const dedupedByIndex = new Map<number, { dir: PhaseSpan['dir']; i: number }>()
  for (const s of bandStarts) dedupedByIndex.set(s.i, s)
  const seq = [...dedupedByIndex.values()].sort((a, b) => a.i - b.i)
  const bands: Band[] = []
  seq.forEach((s, j) => {
    const x1 = X(s.i)
    const x2 = j + 1 < seq.length ? X(seq[j + 1].i) : X(n - 1)
    if (x2 - x1 < 6) return
    bands.push({
      x: x1,
      width: x2 - x1,
      cut: s.dir === 'Cut',
      label: x2 - x1 > 46 ? s.dir : '',
    })
  })

  const lastMonday = show[n - 1].monday

  // Deload/Maintain markers: a thin line at the week's x position, distinct from band edges —
  // these never move a band boundary, they just flag a week inside a Cut/Bulk band that should
  // read level rather than trending.
  const markers = [...new Set(markerWeeks)]
    .map((m) => show.findIndex((w) => w.monday === m))
    .filter((i) => i !== -1)
    .map((i) => X(i))

  return {
    line,
    area,
    trendPast,
    proj,
    grid,
    bands,
    markers,
    targetProj,
    targetProjY,
    dots: pts.map((p, i) => ({ x: X(i), y: Y(p.y) })),
    lastX: X(n - 1),
    lastY: Y(pts[n - 1].y),
    projX: X(slots),
    projY: Y(projected),
    slope: fit.slope,
    r2: fit.r2,
    fitWeeks: n - fitStart,
    projVal: projected,
    projDate: addDays(lastMonday, cfg.fwd * 7),
    first: pts[0].y,
    last: pts[n - 1].y,
    weeks: n,
    lastMonday,
  }
}
