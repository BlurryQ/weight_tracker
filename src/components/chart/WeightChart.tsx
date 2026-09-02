import { useId } from 'react'
import type { ChartGeometry } from '../../lib/chartGeometry'
import { sgn } from '../../lib/format'

interface WeightChartProps {
  geometry: ChartGeometry
  W: number
  H: number
  gutter: number
  variant: 'today' | 'trends'
}

const CUT_FILL = 'var(--band-cut-fill)'
const CUT_EDGE = 'var(--band-cut-edge)'
const CUT_LABEL = 'var(--band-cut-label)'
const BULK_FILL = 'var(--band-bulk-fill)'
const BULK_EDGE = 'var(--band-bulk-edge)'
const BULK_LABEL = 'var(--band-bulk-label)'

/** Renders the weekly-average chart shared by Today (compact) and Trends (full). Geometry
 * comes from lib/chartGeometry.ts — this component only draws it, back to front: bands,
 * gridlines, area, trend line (faint past + dashed forward), data line, target reference,
 * dots. */
export function WeightChart({ geometry: g, W, H, gutter, variant }: WeightChartProps) {
  const gradId = useId()
  const isTrends = variant === 'trends'

  if (!g.line) return null

  return (
    <div style={{ position: 'relative', paddingLeft: gutter }}>
      {g.bands.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: gutter + b.x + 4,
            top: H + 4,
            font: '600 8.5px/1 "Barlow Condensed", sans-serif',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: b.cut ? CUT_LABEL : BULK_LABEL,
            whiteSpace: 'nowrap',
          }}
        >
          {b.label}
        </div>
      ))}
      {g.grid.map((line, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            top: line.y - 5,
            font: '500 9px "IBM Plex Mono", monospace',
            color: 'var(--text-dim)',
            width: gutter - 6,
            textAlign: 'right',
          }}
        >
          {line.value}
        </div>
      ))}
      <svg width={W} height={H} style={{ overflow: 'visible', display: 'block' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={isTrends ? 0.15 : 0.16} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>

        {g.bands.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={0}
            width={b.width}
            height={H}
            fill={b.cut ? CUT_FILL : BULK_FILL}
          />
        ))}
        {g.bands.map((b, i) => (
          <line
            key={'edge' + i}
            x1={b.x}
            x2={b.x}
            y1={0}
            y2={H}
            stroke={b.cut ? CUT_EDGE : BULK_EDGE}
            strokeWidth={1}
          />
        ))}

        {g.markers.map((x, i) => (
          <line key={i} x1={x} x2={x} y1={0} y2={H} stroke="var(--band-marker)" strokeWidth={1} />
        ))}

        {g.grid.map((line, i) => (
          <line key={i} x1={0} x2={W} y1={line.y} y2={line.y} stroke="var(--hairline-strong)" strokeWidth={1} />
        ))}

        <path d={g.area} fill={`url(#${gradId})`} stroke="none" />

        {/* HIERARCHY on ink-black: solid data line (brightest) > cyan projection dash (lighter,
            thinner) > magenta goal-pace dash (thinnest, dimmest). Colour alone can't carry it
            when both forward lines are saturated, so weight + dash + opacity do. */}

        {/* Trend line, one object: a faint solid connector back into the data … */}
        <path d={g.trendPast} fill="none" stroke="var(--accent)" strokeWidth={1.4} strokeLinecap="round" opacity={0.3} />

        <path d={g.line} fill="none" stroke="var(--accent)" strokeWidth={2.1} strokeLinejoin="round" />

        {/* … continued forward as the dashed projection — same colour, lighter, so it reads as
            "the trend, extrapolated" rather than a second measured line. */}
        <path
          d={g.proj}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.8}
          strokeDasharray="5 4"
          strokeLinecap="round"
          opacity={0.72}
        />

        {/* Goal-pace reference: forward only, magenta, thinnest + dimmest of the three. */}
        {g.targetProj && (
          <path
            d={g.targetProj}
            fill="none"
            stroke="var(--goal-pace)"
            strokeWidth={1.25}
            strokeDasharray="4 4"
            strokeLinecap="round"
            opacity={0.55}
          />
        )}

        {isTrends &&
          g.dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={2.4} fill="var(--bg)" stroke="var(--accent)" strokeWidth={1.2} />
          ))}

        {/* Now: solid pivot. Both forward lines land in a hollow ring with their value beside it. */}
        <circle cx={g.lastX} cy={g.lastY} r={4.5} fill="var(--accent)" />

        <circle cx={g.projX} cy={g.projY} r={3.5} fill="var(--bg)" stroke="var(--accent)" strokeWidth={1.6} />
        {/* Values sit left of their endpoint (anchor=end) so they stay inside the plot even
            though the circles are at the chart's right edge; cyan above its line, magenta
            below its steeper one, so the two never stack. */}
        <text
          x={g.projX - 6}
          y={g.projY - 6}
          textAnchor="end"
          fontFamily="'IBM Plex Mono', monospace"
          fontSize={9}
          fontWeight={600}
          fill="var(--accent)"
        >
          {g.projVal.toFixed(1)}
        </text>

        {g.targetProj && (
          <>
            <circle
              cx={g.targetProjX}
              cy={g.targetProjY}
              r={3.5}
              fill="var(--bg)"
              stroke="var(--goal-pace)"
              strokeWidth={1.6}
            />
            <text
              x={g.targetProjX - 6}
              y={g.targetProjY + 12}
              textAnchor="end"
              fontFamily="'IBM Plex Mono', monospace"
              fontSize={9}
              fontWeight={500}
              fill="var(--goal-pace)"
            >
              {g.targetProjVal.toFixed(1)}
            </text>
          </>
        )}
      </svg>

      {/* Legend — kept in the chart component so it can't drift from the strokes above. */}
      <div
        style={{
          marginTop: 16,
          marginLeft: gutter,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
          font: '500 8.5px "IBM Plex Mono", monospace',
          color: 'var(--text-dim)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 16, borderTop: '2px solid var(--accent)' }} />
          if this continues
        </span>
        {g.targetProj && (
          <>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 16, borderTop: '1.5px dashed var(--goal-pace)' }} />
              goal pace
            </span>
            <span style={{ color: 'var(--amber)' }}>{sgn(g.projVal - g.targetProjVal)} vs goal pace</span>
          </>
        )}
      </div>
    </div>
  )
}
