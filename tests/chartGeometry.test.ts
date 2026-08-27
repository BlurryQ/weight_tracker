import { describe, expect, it } from 'vitest'
import { buildChartGeometry } from '../src/lib/chartGeometry'
import { fitSlope, phaseSpans, weeklyAverages, type PhaseLogEntry } from '../src/lib/math'
import { WEIGHT_DATA_FIXTURE } from './fixtures/weight-data'

const weekly = weeklyAverages(WEIGHT_DATA_FIXTURE)

// Same demo phase log the prototype ships with, matching the Bulk-then-Cut bands visible in
// screens/01-today.png.
const PHASE_LOG: PhaseLogEntry[] = [
  { start: '2026-01-05', name: 'Bulk' },
  { start: '2026-04-20', name: 'Cut' },
  { start: '2026-07-27', name: 'Deload' },
  { start: '2026-08-03', name: 'Cut' },
]

const TODAY_CFG = { W: 320, H: 128, gutter: 28, showN: 26, fitK: 4, fwd: 6, gridN: 4 }

describe('buildChartGeometry', () => {
  it('returns empty geometry for fewer than 2 weekly points', () => {
    const geo = buildChartGeometry([], [], TODAY_CFG)
    expect(geo.line).toBe('')
    expect(geo.dots).toEqual([])
  })

  it('computes the same fit slope/r2 as fitSlope over the same trailing window', () => {
    const geo = buildChartGeometry(weekly, phaseSpans(PHASE_LOG), TODAY_CFG)
    const { slope, r2 } = fitSlope(weekly, TODAY_CFG.fitK)
    expect(geo.slope).toBeCloseTo(slope, 6)
    expect(geo.r2).toBeCloseTo(r2, 6)
  })

  it('anchors the projection at the last actual point plus slope*weeks, not the fit intercept', () => {
    const geo = buildChartGeometry(weekly, [], TODAY_CFG)
    const lastActual = weekly[weekly.length - 1].lbs
    expect(geo.projVal).toBeCloseTo(lastActual + geo.slope * TODAY_CFG.fwd, 6)
  })

  it('draws one weekly dot per shown week', () => {
    const geo = buildChartGeometry(weekly, [], TODAY_CFG)
    expect(geo.dots).toHaveLength(Math.min(TODAY_CFG.showN, weekly.length))
  })

  it('produces one Cut and one Bulk band for the demo phase log, in chronological order', () => {
    const geo = buildChartGeometry(weekly, phaseSpans(PHASE_LOG), TODAY_CFG)
    expect(geo.bands.map((b) => b.cut)).toEqual([false, true]) // Bulk then Cut
    // Both bands span a meaningful chunk of the 26-week window, so both should carry a label.
    expect(geo.bands.every((b) => b.label !== '')).toBe(true)
  })

  it('omits bands narrower than 6px and only labels bands wider than 46px', () => {
    // A phase log with two changes one week apart collapses to a razor-thin second band.
    const tightLog: PhaseLogEntry[] = [
      { start: '2026-08-03', name: 'Bulk' },
      { start: '2026-08-10', name: 'Cut' },
    ]
    const geo = buildChartGeometry(weekly, phaseSpans(tightLog), { ...TODAY_CFG, showN: 26 })
    for (const b of geo.bands) {
      expect(b.width).toBeGreaterThanOrEqual(6)
      if (b.width <= 46) expect(b.label).toBe('')
    }
  })

  it('places gridN evenly spaced gridlines spanning [min-1.2, max+1.2] of shown+projected values', () => {
    const geo = buildChartGeometry(weekly, [], TODAY_CFG)
    expect(geo.grid).toHaveLength(TODAY_CFG.gridN)
  })

  it('respects a unit-conversion function for chart-space math (kg display)', () => {
    const KG = 0.45359237
    const geoLb = buildChartGeometry(weekly, [], TODAY_CFG)
    const geoKg = buildChartGeometry(weekly, [], TODAY_CFG, (v) => v * KG)
    expect(geoKg.last).toBeCloseTo(geoLb.last * KG, 6)
  })

  it('places a marker for a Deload/Maintain week without adding a band edge there', () => {
    const geo = buildChartGeometry(weekly, phaseSpans(PHASE_LOG), TODAY_CFG, undefined, ['2026-07-27'])
    expect(geo.markers).toHaveLength(1)
    // The marker sits strictly inside the Cut band (04-20 -> end), not on a band boundary.
    const cutBand = geo.bands.find((b) => b.cut)!
    expect(geo.markers[0]).toBeGreaterThan(cutBand.x)
    expect(geo.markers[0]).toBeLessThan(cutBand.x + cutBand.width)
  })

  it('ignores marker weeks that fall outside the shown window', () => {
    const geo = buildChartGeometry(weekly, [], TODAY_CFG, undefined, ['2000-01-03'])
    expect(geo.markers).toEqual([])
  })

  it('omits the target-pace reference line when no target rate is given', () => {
    const geo = buildChartGeometry(weekly, [], TODAY_CFG)
    expect(geo.targetProj).toBe('')
  })

  it('draws the target-pace line from the same anchor as the real projection, diverging by the difference in slope', () => {
    const geo = buildChartGeometry(weekly, [], TODAY_CFG, undefined, [], -1.0)
    expect(geo.targetProj).not.toBe('')
    // Same start point as the real projection (both anchor at the last actual point).
    const projStart = geo.proj.split(' ').slice(0, 2).join(' ')
    const targetStart = geo.targetProj.split(' ').slice(0, 2).join(' ')
    expect(targetStart).toBe(projStart)
    // A different target rate than the actual fit slope means a different end point.
    const projEnd = geo.proj.split(' ').slice(-2).join(' ')
    const targetEnd = geo.targetProj.split(' ').slice(-2).join(' ')
    expect(targetEnd).not.toBe(projEnd)
  })

  it('expands the y-domain to fit the target-pace line when it diverges further than the real data', () => {
    // An extreme target rate should not get clipped out of the chart's vertical range.
    const geo = buildChartGeometry(weekly, [], TODAY_CFG, undefined, [], -10)
    const [, targetEndY] = geo.targetProj.split(' ').slice(-2).map(Number)
    expect(targetEndY).toBeGreaterThanOrEqual(0)
    expect(targetEndY).toBeLessThanOrEqual(TODAY_CFG.H)
  })
})
