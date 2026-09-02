import { useId } from 'react'
import type { ChartGeometry } from '../../lib/chartGeometry'

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
      {/* The one label the chart needs — the trend line grows out of the data, so it names
          itself; only the reference does not. Right-aligned to the chart edge. */}
      {g.targetProj && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: gutter + g.projX - 2,
            top: g.targetProjY + 3,
            textAlign: 'right',
            font: '500 8.5px "IBM Plex Mono", monospace',
            color: 'var(--text-muted)',
          }}
        >
          target
        </div>
      )}
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

        {/* Trend line, one object: a faint solid connector back into the data … */}
        <path d={g.trendPast} fill="none" stroke="var(--accent)" strokeWidth={1.4} strokeLinecap="round" opacity={0.4} />

        <path d={g.line} fill="none" stroke="var(--accent)" strokeWidth={2.1} strokeLinejoin="round" />

        {/* … continued forward as the dashed projection. This is the headline line: full weight. */}
        <path d={g.proj} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" />

        {/* Target-rate reference: forward only, thinner and dimmer, with a terminal tick. */}
        {g.targetProj && (
          <>
            <path
              d={g.targetProj}
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth={1.25}
              strokeDasharray="1 5"
              strokeLinecap="round"
              opacity={0.5}
            />
            <line
              x1={g.projX}
              x2={g.projX}
              y1={g.targetProjY - 4}
              y2={g.targetProjY + 4}
              stroke="var(--text-muted)"
              strokeWidth={1.25}
              opacity={0.6}
            />
          </>
        )}

        {isTrends &&
          g.dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={2.4} fill="var(--bg)" stroke="var(--accent)" strokeWidth={1.2} />
          ))}

        <circle cx={g.lastX} cy={g.lastY} r={4.5} fill="var(--accent)" />
        <circle
          cx={g.projX}
          cy={g.projY}
          r={3.5}
          fill={isTrends ? 'var(--accent)' : 'var(--bg)'}
          stroke="var(--accent)"
          strokeWidth={1.6}
        />
      </svg>
    </div>
  )
}
