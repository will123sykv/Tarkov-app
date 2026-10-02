import type { TrendStats } from '../../../shared/fleaTrends'
import { formatPercent, formatRub, formatSlot } from '../lib/format'

/**
 * An item's day at a glance: one cell per interval, blue where it's usually cheaper than the
 * rest of the day and red where it's dearer (grey in between), with the buy and sell intervals
 * lettered and the current one outlined. Each cell's tooltip gives the price.
 */
export default function DayStrip({
  stats,
  bucketHours,
  hour
}: {
  stats: TrendStats
  bucketHours: number
  /** The hour of the day now, to outline the current interval. */
  hour: number
}): React.JSX.Element {
  const known = stats.buckets.map((b) => b.median).filter((m): m is number => m !== null)
  const sortedKnown = [...known].sort((a, b) => a - b)
  const middle = sortedKnown[Math.floor(sortedKnown.length / 2)] ?? 0
  // Shade by distance from the day's middle, the furthest interval at full colour.
  const furthest = Math.max(...known.map((m) => Math.abs(m / middle - 1)), 0.0001)
  return (
    <span className="day-strip" role="img" aria-label="Usual lowest price by time of day">
      {stats.buckets.map((b) => {
        const current = hour >= b.startHour && hour < b.startHour + bucketHours
        const mark =
          b.startHour === stats.buy?.startHour ? 'B' : b.startHour === stats.sell?.startHour ? 'S' : ''
        if (b.median === null)
          return (
            <span
              key={b.startHour}
              className={`day-cell empty ${current ? 'now' : ''}`}
              title={`${formatSlot(b.startHour, bucketHours)}: not enough prices`}
            />
          )
        const change = middle > 0 ? b.median / middle - 1 : 0
        const strength = Math.round((Math.abs(change) / furthest) * 100)
        return (
          <span
            key={b.startHour}
            className={`day-cell ${change < 0 ? 'cheap' : 'dear'} ${current ? 'now' : ''}`}
            style={{ '--strength': `${strength}%` } as React.CSSProperties}
            title={
              `${formatSlot(b.startHour, bucketHours)}: usually ~${formatRub(b.median)}` +
              (change === 0
                ? ', the middle of the day'
                : ` (${formatPercent(Math.abs(change))} ${change < 0 ? 'below' : 'above'} the middle of the day)`) +
              (mark === 'B' ? ' · buy' : mark === 'S' ? ' · sell' : '') +
              (current ? ' · now' : '')
            }
          >
            {mark}
          </span>
        )
      })}
    </span>
  )
}
