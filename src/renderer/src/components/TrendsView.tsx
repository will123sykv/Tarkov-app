import { useEffect, useRef } from 'react'
import {
  consistencyShare,
  hasPattern,
  liquidity,
  todaySwing,
  type TrendSortKey
} from '../../../shared/fleaTrends'
import { dataModeFor } from '../../../shared/gameModes'
import type { PriceState, PublicSettings, TrendAnalysis, TrendSettings } from '../../../shared/types'
import { formatAgo, formatPercent, formatRub, formatRubCompact, formatSlot } from '../lib/format'
import { useNow } from '../lib/useNow'
import { MIN_PATTERN_DAYS, type TrendRanking } from '../lib/useTrendRanking'
import { useStore } from '../store'
import BackgroundToggles from './BackgroundToggles'
import TrendDetail from './TrendDetail'

interface Props {
  settings: PublicSettings
  priceState: PriceState | null
  ranking: TrendRanking
}

const MAX_ROWS = 200
const SORT_LABELS: Record<TrendSortKey, string> = {
  profit: 'Profit per unit',
  spread: 'Price spread',
  consistency: 'Consistency',
  volatility: 'Usual daily swing',
  offers: 'Offers up',
  swing: "Today's swing"
}

/** "01:00–08:00, 23:00–00:00" for the hours with no recordings. */
function missingHours(byHour: number[]): string {
  const ranges: string[] = []
  let start: number | null = null
  for (let h = 0; h <= 24; h++) {
    const empty = h < 24 && byHour[h] === 0
    if (empty && start === null) start = h
    if (!empty && start !== null) {
      ranges.push(formatSlot(start, h - start))
      start = null
    }
  }
  return ranges.join(', ')
}

function Coverage({ analysis }: { analysis: TrendAnalysis | undefined }): React.JSX.Element {
  const now = useNow(60_000)
  if (!analysis) return <p className="hint">Loading recordings…</p>
  const { coverage } = analysis
  if (coverage.snapshots === 0) {
    return (
      <p className="hint">
        Nothing recorded yet. The app records the most-listed items at each price refresh (at most every 15
        minutes) while it's running.
      </p>
    )
  }
  const gaps = missingHours(coverage.snapshotsByHour)
  return (
    <p className="hint">
      Recording {coverage.items} items:{' '}
      {coverage.days >= MIN_PATTERN_DAYS
        ? `${coverage.days} days so far`
        : `${coverage.days} of the ${MIN_PATTERN_DAYS} days needed`}
      {coverage.lastAt ? `, last ${formatAgo(coverage.lastAt, now)}` : ''}.
      {gaps && ` No recordings yet for ${gaps}; keep the app running then (see below) to fill the gaps.`}
    </p>
  )
}

interface SidebarProps {
  settings: PublicSettings
  analysis: TrendAnalysis | undefined
  /** The sort in effect, when it differs from the chosen one. */
  sort: TrendSortKey
}

function Sidebar({ settings, analysis, sort }: SidebarProps): React.JSX.Element {
  const updateSettings = useStore((s) => s.updateSettings)
  const loadTrends = useStore((s) => s.loadTrends)
  const trendsLoading = useStore((s) => s.trendsLoading)
  const t = settings.trends
  const set = (patch: Partial<TrendSettings>): void => void updateSettings({ trends: { ...t, ...patch } })
  const number = (value: string): number => Number(value) || 0

  return (
    <aside className="sidebar">
      <section>
        <h2>Recording</h2>
        <Coverage analysis={analysis} />
        <BackgroundToggles settings={settings} />
        <button className="button small" onClick={() => void loadTrends()} disabled={trendsLoading}>
          {trendsLoading ? 'Analysing…' : 'Re-analyse now'}
        </button>
      </section>

      <section>
        <h2>Look back</h2>
        <div className="mini-toggle wide" role="radiogroup" aria-label="Look back">
          {([7, 14, 30] as const).map((days) => (
            <button
              key={days}
              role="radio"
              aria-checked={t.days === days}
              className={t.days === days ? 'active' : ''}
              onClick={() => set({ days })}
            >
              {days} days
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Filters</h2>
        <label className="field">
          <span>Min offers up (sells quickly)</span>
          <input
            type="number"
            min={0}
            step={5}
            value={t.minOffers}
            onChange={(e) => set({ minOffers: number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span>Min price</span>
          <input
            type="number"
            min={0}
            step={1000}
            value={t.minPrice}
            onChange={(e) => set({ minPrice: number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span>Min profit per unit (after fee)</span>
          <input
            type="number"
            step={500}
            value={t.minProfit}
            onChange={(e) => set({ minProfit: number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span>Worked on at least</span>
          <select value={t.minConsistency} onChange={(e) => set({ minConsistency: Number(e.target.value) })}>
            {[0, 0.5, 0.6, 0.7, 0.8].map((share) => (
              <option key={share} value={share}>
                {share === 0 ? 'Any share of days' : `${formatPercent(share)} of days`}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={t.tradableOnly}
            onChange={(e) => set({ tradableOnly: e.target.checked })}
          />
          Only items I can trade at my level
        </label>
        <label className="field">
          <span>Sort by</span>
          <select value={t.sort} onChange={(e) => set({ sort: e.target.value as TrendSortKey })}>
            {(Object.keys(SORT_LABELS) as TrendSortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        {sort !== t.sort && (
          <p className="hint">
            Sorted by {SORT_LABELS[sort].toLowerCase()} until {MIN_PATTERN_DAYS} days are recorded.
          </p>
        )}
      </section>
    </aside>
  )
}

export default function TrendsView({ settings, priceState, ranking }: Props): React.JSX.Element {
  const dataMode = dataModeFor(settings.gameMode)
  const { analysis, rows: ranked, patternsReady, sort } = ranking
  const loadTrends = useStore((s) => s.loadTrends)
  const trendsError = useStore((s) => s.trendsError)
  const selected = useStore((s) => s.selectedTrendItem)
  const selectTrendItem = useStore((s) => s.selectTrendItem)
  const updateSettings = useStore((s) => s.updateSettings)
  const dataset = priceState?.dataset ?? null
  const lastLoad = useRef(0)

  // Re-analyse when the view opens, the mode or window changes, and (at most once a minute)
  // after refreshes, which add new recordings.
  useEffect(() => {
    lastLoad.current = Date.now()
    void loadTrends()
  }, [loadTrends, dataMode, settings.trends.days])
  useEffect(() => {
    if (Date.now() - lastLoad.current < 60_000) return
    lastLoad.current = Date.now()
    void loadTrends()
  }, [loadTrends, dataset?.fetchedAt])

  const t = settings.trends
  const selectedRow = ranked.find((r) => r.item.id === selected) ?? null
  const setSort = (key: TrendSortKey): void => void updateSettings({ trends: { ...t, sort: key } })
  const header = (key: TrendSortKey, label: string): React.JSX.Element => (
    <button className={`sort ${sort === key ? 'active' : ''}`} onClick={() => setSort(key)}>
      {label}
      {sort === key && <span aria-hidden> ▼</span>}
    </button>
  )

  return (
    <div className="trends">
      <Sidebar settings={settings} analysis={analysis} sort={sort} />
      <main className="content">
        {dataset?.foundInRaidRequired && (
          <div className="banner error" role="status">
            The flea market currently only accepts found-in-raid items, so items you buy there can't be
            relisted. These patterns are only useful for timing sales of your own loot.
          </div>
        )}
        <div className="summary">
          <div className="summary-title">
            <strong>Flea trends</strong>
            <span className="muted">
              {patternsReady
                ? `Best time to buy and to sell, from ${analysis!.coverage.days} days of recordings`
                : `Collecting prices (${analysis?.coverage.days ?? 0} of ${MIN_PATTERN_DAYS} days). Until then, items are ranked by today's price swing.`}
            </span>
          </div>
          <div className="summary-stats muted">
            <span>
              Offers up stand in for sales volume, which isn't published. Past patterns aren't guarantees:
              prices move, and the listing fee is charged when you list.
            </span>
          </div>
          {trendsError && <div className="hint error">Couldn't read recordings: {trendsError}</div>}
        </div>

        <div className="trends-table-wrap">
          <table className="trends-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">{header('offers', 'Offers up')}</th>
                <th className="num">Lowest now</th>
                <th className="num">{header('swing', 'Today (low–high)')}</th>
                <th>Buy at</th>
                <th>{header('spread', 'Sell at')}</th>
                <th className="num">{header('profit', 'Profit / unit')}</th>
                <th className="num">{header('consistency', 'Worked on')}</th>
              </tr>
            </thead>
            <tbody>
              {ranked.slice(0, MAX_ROWS).map((row) => {
                const { item, stats, access } = row
                const swing = todaySwing(item)
                const pattern = hasPattern(row) ? stats! : null
                const bucket = analysis?.bucketHours ?? 1
                return (
                  <tr
                    key={item.id}
                    className={item.id === selected ? 'selected' : ''}
                    onClick={() => selectTrendItem(item.id === selected ? null : item.id)}
                    tabIndex={0}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && selectTrendItem(item.id === selected ? null : item.id)
                    }
                  >
                    <td className="name">
                      <span title={item.name}>{item.name}</span>
                      <small>
                        {item.shortName}
                        {access.status === 'locked' && ` · locked until level ${access.unlockLevel}`}
                      </small>
                    </td>
                    <td className="num">{Math.round(liquidity(row) ?? 0).toLocaleString()}</td>
                    <td className="num">{formatRub(item.fleaPrice)}</td>
                    <td className="num">
                      {item.low24hPrice && item.high24hPrice
                        ? `${formatRubCompact(item.low24hPrice)}–${formatRubCompact(item.high24hPrice)}`
                        : '—'}
                      {swing !== null && <small>{formatPercent(swing)} swing</small>}
                    </td>
                    <td>
                      {pattern ? (
                        <>
                          {formatSlot(pattern.buy!.startHour, bucket)}
                          <small>~{formatRubCompact(pattern.buy!.price)}</small>
                        </>
                      ) : (
                        <span className="muted">{patternsReady ? 'not enough data' : 'collecting…'}</span>
                      )}
                    </td>
                    <td>
                      {pattern && (
                        <>
                          {formatSlot(pattern.sell!.startHour, bucket)}
                          <small>
                            ~{formatRubCompact(pattern.sell!.price)}
                            {pattern.spreadPct !== null && ` (+${formatPercent(pattern.spreadPct)})`}
                          </small>
                        </>
                      )}
                    </td>
                    <td className={`num ${pattern?.profit != null && pattern.profit > 0 ? 'profit' : ''}`}>
                      {pattern?.profit != null ? formatRub(pattern.profit) : ''}
                      {pattern?.fee != null && <small>after {formatRubCompact(pattern.fee)} fee</small>}
                    </td>
                    <td className="num">
                      {pattern?.consistency
                        ? `${pattern.consistency.wins} of ${pattern.consistency.days} days`
                        : ''}
                      {pattern?.consistency && <small>{formatPercent(consistencyShare(pattern))}</small>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {ranked.length === 0 && (
            <div className="empty">
              <p>{dataset ? 'No items match these filters.' : 'Waiting for prices…'}</p>
            </div>
          )}
        </div>

        {selectedRow && (
          <TrendDetail row={selectedRow} analysis={analysis} days={t.days} dataMode={dataMode} />
        )}
      </main>
    </div>
  )
}
