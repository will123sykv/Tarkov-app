import { useEffect, useMemo, useRef, useState } from 'react'

export interface ChartPoint {
  x: number
  /** null leaves a gap in the line. */
  y: number | null
  /** Optional band (e.g. the middle half of observed prices) drawn behind the line. */
  low?: number | null
  high?: number | null
}

export interface ChartMarker {
  x: number
  y: number
  label: string
  /** Put the label below the marker instead of above it. */
  below?: boolean
}

export interface TooltipContent {
  title: string
  rows: { label: string; value: string }[]
}

interface Props {
  points: ChartPoint[]
  xDomain: [number, number]
  xTicks: { value: number; label: string }[]
  yFormat: (value: number) => string
  tooltip: (point: ChartPoint) => TooltipContent
  markers?: ChartMarker[]
  height?: number
  ariaLabel: string
}

const MARGIN = { top: 16, right: 16, bottom: 24, left: 56 }

/** Round, evenly spaced axis ticks covering [min, max]. */
function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min]
  const raw = (max - min) / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(v)
  return ticks
}

function segments<T>(items: T[], present: (item: T) => boolean): T[][] {
  const result: T[][] = []
  let current: T[] = []
  for (const item of items) {
    if (present(item)) current.push(item)
    else if (current.length) {
      result.push(current)
      current = []
    }
  }
  if (current.length) result.push(current)
  return result
}

/**
 * A single-series line chart in plain SVG: optional range band, labelled markers, solid hairline
 * grid, and a crosshair tooltip that follows the pointer or the arrow keys.
 */
export default function LineChart({
  points,
  xDomain,
  xTicks,
  yFormat,
  tooltip,
  markers = [],
  height = 200,
  ariaLabel
}: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(480)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const plotted = useMemo(() => points.filter((p) => p.y !== null), [points])
  const [yMin, yMax] = useMemo(() => {
    const values = points.flatMap((p) => [p.y, p.low, p.high]).filter((v): v is number => v != null)
    if (!values.length) return [0, 1]
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const pad = (hi - lo || hi || 1) * 0.08
    return [Math.max(0, lo - pad), hi + pad]
  }, [points])
  const yTicks = niceTicks(yMin, yMax)
  const innerW = width - MARGIN.left - MARGIN.right
  const innerH = height - MARGIN.top - MARGIN.bottom
  const sx = (x: number): number => MARGIN.left + ((x - xDomain[0]) / (xDomain[1] - xDomain[0] || 1)) * innerW
  const sy = (y: number): number => MARGIN.top + (1 - (y - yMin) / (yMax - yMin || 1)) * innerH

  const lines = segments(points, (p) => p.y !== null).map((seg) =>
    seg.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y!).toFixed(1)}`).join('')
  )
  const bands = segments(points, (p) => p.low != null && p.high != null).map(
    (seg) =>
      seg.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.high!).toFixed(1)}`).join('') +
      [...seg]
        .reverse()
        .map((p) => `L${sx(p.x).toFixed(1)},${sy(p.low!).toFixed(1)}`)
        .join('') +
      'Z'
  )

  function nearest(clientX: number): number | null {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || !plotted.length) return null
    const x = clientX - rect.left
    let best = 0
    for (let i = 1; i < plotted.length; i++) {
      if (Math.abs(sx(plotted[i].x) - x) < Math.abs(sx(plotted[best].x) - x)) best = i
    }
    return best
  }

  const point = active !== null ? plotted[active] : null
  const tip = point ? tooltip(point) : null
  const tipLeft = point ? sx(point.x) : 0
  const flip = tipLeft > width * 0.6

  return (
    <div className="line-chart" ref={containerRef} style={{ height }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onPointerMove={(e) => setActive(nearest(e.clientX))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(plotted.length ? plotted.length - 1 : null)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (active === null) return
          if (e.key === 'ArrowLeft') setActive(Math.max(0, active - 1))
          if (e.key === 'ArrowRight') setActive(Math.min(plotted.length - 1, active + 1))
        }}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line className="grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={sy(t)} y2={sy(t)} />
            <text className="tick" x={MARGIN.left - 8} y={sy(t)} dy="0.32em" textAnchor="end">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t.value} className="tick" x={sx(t.value)} y={height - 6} textAnchor="middle">
            {t.label}
          </text>
        ))}
        {bands.map((d, i) => (
          <path key={i} className="band" d={d} />
        ))}
        {lines.map((d, i) => (
          <path key={i} className="line" d={d} />
        ))}
        {point && (
          <>
            <line
              className="crosshair"
              x1={sx(point.x)}
              x2={sx(point.x)}
              y1={MARGIN.top}
              y2={MARGIN.top + innerH}
            />
            <circle className="dot" cx={sx(point.x)} cy={sy(point.y!)} r={4} />
          </>
        )}
        {markers.map((m) => (
          <g key={m.label}>
            <circle className="marker" cx={sx(m.x)} cy={sy(m.y)} r={5} />
            <text
              className="marker-label"
              x={sx(m.x)}
              y={sy(m.y) + (m.below ? 18 : -10)}
              textAnchor={sx(m.x) < MARGIN.left + 40 ? 'start' : sx(m.x) > width - 60 ? 'end' : 'middle'}
            >
              {m.label}
            </text>
          </g>
        ))}
      </svg>
      {tip && (
        <div
          className="chart-tooltip"
          style={flip ? { right: width - tipLeft + 12 } : { left: tipLeft + 12 }}
          role="status"
        >
          <div className="chart-tooltip-title">{tip.title}</div>
          {tip.rows.map((row) => (
            <div key={row.label} className="chart-tooltip-row">
              <b>{row.value}</b>
              <span>{row.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
