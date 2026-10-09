import { useEffect } from 'react'
import { consistencyShare, hasPattern, type TrendRow } from '../../../shared/fleaTrends'
import type { DataMode, TrendAnalysis } from '../../../shared/types'
import { friendlyError } from '../lib/errors'
import { formatHour, formatPercent, formatRub, formatRubShort, formatSlot } from '../lib/format'
import { trendSeriesKey, useStore } from '../store'
import LineChart, { type ChartPoint } from './LineChart'

interface Props {
  row: TrendRow
  analysis: TrendAnalysis | undefined
  days: number
  dataMode: DataMode
}

const DAY_MS = 24 * 3_600_000
const dateLabel = (t: number): string =>
  new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** Charts and figures for the selected item: its daily price shape and its last two months. */
export default function TrendDetail({ row, analysis, days, dataMode }: Props): React.JSX.Element {
  const { item } = row
  const loadTrendSeries = useStore((s) => s.loadTrendSeries)
  const series = useStore((s) => s.trendSeries[trendSeriesKey(dataMode, item.id)])
  const selectTrendItem = useStore((s) => s.selectTrendItem)
  useEffect(() => {
    void loadTrendSeries(item.id)
  }, [loadTrendSeries, item.id])

  const bucketHours = analysis?.bucketHours ?? 3
  const stats = hasPattern(row) ? row.stats! : null
  const partDay = stats !== null && stats.coveredHours.length * bucketHours < 24
  const hourPoints: ChartPoint[] = (stats?.buckets ?? []).map((b) => ({
    x: b.startHour + bucketHours / 2,
    y: b.median,
    low: b.q1,
    high: b.q3
  }))
  const samplesAt = new Map((stats?.buckets ?? []).map((b) => [b.startHour + bucketHours / 2, b.samples]))

  const daily = (series?.daily ?? []).filter((p) => p.priceMin != null)
  const dailyPoints: ChartPoint[] = daily.map((p) => ({ x: p.t, y: p.priceMin }))
  const dailyByT = new Map(daily.map((p) => [p.t, p]))
  const firstDay = daily[0]?.t ?? Date.now() - 60 * DAY_MS
  const lastDay = daily.at(-1)?.t ?? Date.now()
  const dayTicks = daily.length
    ? Array.from({ length: 5 }, (_, i) => firstDay + ((lastDay - firstDay) * i) / 4).map((t) => ({
        value: t,
        label: dateLabel(t)
      }))
    : []

  return (
    <section className="trend-detail" aria-label={`${item.name} price trends`}>
      <header>
        <div>
          <strong>{item.name}</strong>
          {stats ? (
            <span className="muted">
              Buy {formatSlot(stats.buy!.startHour, bucketHours)} at ~{formatRub(stats.buy!.price)} · sell{' '}
              {formatSlot(stats.sell!.startHour, bucketHours)} at ~{formatRub(stats.sell!.price)} · hold about{' '}
              {stats.holdHours} h · {stats.profit != null ? `${formatRub(stats.profit)} profit per unit` : ''}
              {stats.fee != null ? ` after the ${formatRub(stats.fee)} fee` : ''}
              {stats.consistency
                ? ` · worked on ${stats.consistency.wins} of ${stats.consistency.days} days (${formatPercent(consistencyShare(stats))})`
                : ''}
              {stats.volatility != null ? ` · usual daily swing ${formatPercent(stats.volatility)}` : ''}
              {partDay && ' · only some hours of the day have prices so far'}
            </span>
          ) : (
            <span className="muted">
              {row.stats?.insufficient
                ? `No time-of-day pattern yet: ${row.stats.insufficient}.`
                : 'No price history: only the most-listed items have one.'}
            </span>
          )}
        </div>
        <button className="button icon" onClick={() => selectTrendItem(null)} aria-label="Close details">
          ✕
        </button>
      </header>

      <div className="trend-charts">
        <figure>
          <figcaption>Lowest price by time of day (last {days} days, your time zone)</figcaption>
          {stats ? (
            <LineChart
              ariaLabel={`Lowest price of ${item.name} by hour of day`}
              points={hourPoints}
              xDomain={[0, 24]}
              xTicks={[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => ({ value: h, label: formatHour(h) }))}
              yFormat={formatRubShort}
              markers={[
                { x: stats.buy!.startHour + bucketHours / 2, y: stats.buy!.price, label: 'Buy', below: true },
                { x: stats.sell!.startHour + bucketHours / 2, y: stats.sell!.price, label: 'Sell' }
              ]}
              tooltip={(p) => ({
                title: formatSlot(p.x - bucketHours / 2, bucketHours),
                rows: [
                  { label: 'typical lowest price', value: formatRub(p.y) },
                  ...(p.low != null && p.high != null
                    ? [
                        {
                          label: 'middle half of prices',
                          value: `${formatRubShort(p.low)}–${formatRubShort(p.high)}`
                        }
                      ]
                    : []),
                  { label: 'prices', value: String(samplesAt.get(p.x) ?? 0) }
                ]
              })}
            />
          ) : (
            <div className="chart-empty">
              Shown once there are prices at two or more times of day on 4 or more days.
            </div>
          )}
          {stats && (
            <details>
              <summary>Show values</summary>
              <table className="values-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th className="num">Typical lowest</th>
                    <th className="num">Middle half</th>
                    <th className="num">Prices</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.buckets.map((b) => (
                    <tr key={b.startHour}>
                      <td>{formatSlot(b.startHour, bucketHours)}</td>
                      <td className="num">{formatRub(b.median)}</td>
                      <td className="num">
                        {b.q1 != null && b.q3 != null ? `${formatRub(b.q1)}–${formatRub(b.q3)}` : '—'}
                      </td>
                      <td className="num">{b.samples}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </figure>

        <figure>
          <figcaption>
            Lowest price over the last 60 days (tarkov.dev: every check for 30 days, then one a day)
          </figcaption>
          {dailyPoints.length > 1 ? (
            <LineChart
              ariaLabel={`Lowest price of ${item.name} over 60 days`}
              points={dailyPoints}
              xDomain={[firstDay, lastDay]}
              xTicks={dayTicks}
              yFormat={formatRubShort}
              tooltip={(p) => {
                const point = dailyByT.get(p.x)
                return {
                  title: dateLabel(p.x),
                  rows: [
                    { label: 'lowest price', value: formatRub(p.y) },
                    ...(point?.price ? [{ label: 'average price', value: formatRub(point.price) }] : []),
                    ...(point?.offers ? [{ label: 'offers up', value: point.offers.toLocaleString() }] : [])
                  ]
                }
              }}
            />
          ) : (
            <div className="chart-empty">
              {series?.dailyError
                ? `Couldn't load the daily history: ${friendlyError(series.dailyError)}`
                : series
                  ? 'No daily history for this item.'
                  : 'Loading…'}
            </div>
          )}
        </figure>
      </div>
    </section>
  )
}
