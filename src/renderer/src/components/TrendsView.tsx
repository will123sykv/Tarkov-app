import { useCallback, useEffect, useRef } from 'react'
import type { TrendFilterKey, TrendSortKey } from '../../../shared/fleaTrends'
import { dataModeFor } from '../../../shared/gameModes'
import { TREND_INTERVALS } from '../../../shared/settings'
import type {
  HistorySourceStatus,
  PriceState,
  PublicSettings,
  TrendAnalysis,
  TrendSettings
} from '../../../shared/types'
import { formatAgo, formatPercent, formatRub, formatSlot } from '../lib/format'
import { useNow } from '../lib/useNow'
import type { TrendRanking } from '../lib/useTrendRanking'
import { useStore } from '../store'
import BackgroundToggles from './BackgroundToggles'
import NumberField from './NumberField'
import TrendDetail from './TrendDetail'
import TrendTableRow from './TrendTableRow'

interface Props {
  settings: PublicSettings
  priceState: PriceState | null
  ranking: TrendRanking
}

const MAX_ROWS = 100
/** Below this many items, the view explains which filters removed the rest. */
const FEW_ROWS = 10
const SWING_OPTIONS = [0, 0.1, 0.15, 0.2, 0.3, 0.5, 0.75]
const CONSISTENCY_OPTIONS = [0, 0.5, 0.6, 0.7, 0.8]
const SORT_LABELS: Record<TrendSortKey, string> = {
  profit: 'Profit per unit',
  spread: 'Price spread',
  consistency: 'Consistency',
  volatility: 'Usual daily swing',
  offers: 'Offers up',
  swing: "Today's swing"
}

/** What's left after a filter, in words. */
function stepLabel(
  key: TrendFilterKey | null,
  t: TrendSettings,
  level: number,
  patternsReady: boolean
): string {
  switch (key) {
    case null:
      return 'items on the flea market'
    case 'tradableOnly':
      return `you can trade at level ${level}`
    case 'minOffers':
      return `with ${t.minOffers}+ offers up`
    case 'minPrice':
      return `at ${formatRub(t.minPrice)} or more`
    case 'pattern':
      return 'with buy and sell times (prices at two or more times of day on 4+ days)'
    case 'minSwing':
      return `swinging ${formatPercent(t.minSwing)}+ ${patternsReady ? 'on a usual day' : 'today'}`
    case 'minProfit':
      return `making ${formatRub(t.minProfit)}+ after the fee`
    case 'minConsistency':
      return `that worked on ${formatPercent(t.minConsistency)}+ of days`
    case 'now':
      return 'to buy or sell now'
  }
}

/** The next looser setting of a filter, with a description, or null when it can't go lower. */
function loosen(
  key: TrendFilterKey,
  t: TrendSettings
): { patch: Partial<TrendSettings>; text: string } | null {
  const lower = (options: number[], value: number): number | undefined =>
    [...options].reverse().find((o) => o < value)
  switch (key) {
    case 'tradableOnly':
      return t.tradableOnly ? { patch: { tradableOnly: false }, text: 'include items above my level' } : null
    case 'minOffers': {
      const v = Math.floor(t.minOffers / 10) * 5
      return t.minOffers > 0 ? { patch: { minOffers: v }, text: `min offers ${t.minOffers} → ${v}` } : null
    }
    case 'minPrice': {
      const v = Math.floor(t.minPrice / 2000) * 1000
      return t.minPrice > 0
        ? { patch: { minPrice: v }, text: `min price ${formatRub(t.minPrice)} → ${formatRub(v)}` }
        : null
    }
    case 'minSwing': {
      const v = lower(SWING_OPTIONS, t.minSwing)
      return v === undefined
        ? null
        : {
            patch: { minSwing: v },
            text: `min swing ${formatPercent(t.minSwing)} → ${v === 0 ? 'any' : formatPercent(v)}`
          }
    }
    case 'minProfit': {
      const v = Math.floor(t.minProfit / 1000) * 500
      return t.minProfit > 0
        ? { patch: { minProfit: v }, text: `min profit ${formatRub(t.minProfit)} → ${formatRub(v)}` }
        : null
    }
    case 'minConsistency': {
      const v = lower(CONSISTENCY_OPTIONS, t.minConsistency)
      return v === undefined
        ? null
        : {
            patch: { minConsistency: v },
            text: `worked on ${formatPercent(t.minConsistency)} → ${v === 0 ? 'any share' : formatPercent(v)} of days`
          }
    }
    case 'pattern':
      return null
    case 'now':
      return t.nowOnly ? { patch: { nowOnly: false }, text: 'show every time of day' } : null
  }
}

/** Why the list is short: how many items each filter leaves, and a button to loosen the tightest. */
function FilterFunnel({
  settings,
  ranking
}: {
  settings: PublicSettings
  ranking: TrendRanking
}): React.JSX.Element {
  const updateSettings = useStore((s) => s.updateSettings)
  const t = settings.trends
  const level = settings.playerLevels[settings.gameMode]
  const { funnel, rows, patternsReady } = ranking
  // Offer to loosen the filter that removes the most items.
  let chosen: { patch: Partial<TrendSettings>; text: string } | null = null
  let biggestDrop = 0
  for (let i = 1; i < funnel.length; i++) {
    const { key, count } = funnel[i]
    const change = key ? loosen(key, t) : null
    const drop = funnel[i - 1].count - count
    if (change && drop > biggestDrop) {
      chosen = change
      biggestDrop = drop
    }
  }
  return (
    <div className="trend-funnel">
      <p>
        <strong>
          {rows.length === 0 ? 'No items pass the filters.' : `Only ${rows.length} items pass the filters.`}
        </strong>{' '}
        What each one leaves:
      </p>
      <ol>
        {funnel.map((step) => (
          <li key={step.key ?? 'all'}>
            <span className="num">{step.count.toLocaleString()}</span>{' '}
            {stepLabel(step.key, t, level, patternsReady)}
          </li>
        ))}
      </ol>
      {chosen && (
        <button
          className="button small"
          onClick={() => void updateSettings({ trends: { ...t, ...chosen.patch } })}
        >
          Loosen: {chosen.text}
        </button>
      )}
    </div>
  )
}

/** "18:00–23:00" for the hours of the day with prices. */
function hourRanges(byHour: number[]): string {
  const ranges: string[] = []
  let start: number | null = null
  for (let h = 0; h <= 24; h++) {
    const has = h < 24 && byHour[h] > 0
    if (has && start === null) start = h
    if (!has && start !== null) {
      ranges.push(formatSlot(start, h - start))
      start = null
    }
  }
  return ranges.join(', ')
}

/** Where the prices come from, and what each source covers. */
function PriceHistory({
  analysis,
  loading
}: {
  analysis: TrendAnalysis | undefined
  loading: boolean
}): React.JSX.Element {
  const now = useNow(60_000)
  if (!analysis) return <p className="hint">{loading ? 'Loading tarkov.dev’s price history…' : 'Loading…'}</p>
  const source = (id: HistorySourceStatus['id']): HistorySourceStatus | undefined =>
    analysis.coverage.sources?.find((s) => s.id === id)
  const theirs = source('tarkov.dev')
  const ours = source('local')
  return (
    <ul className="history-sources">
      <li>
        <strong>tarkov.dev:</strong>{' '}
        {theirs && theirs.items > 0
          ? `${theirs.items} items, ${theirs.days} days, a price about every 2 hours ✓`
          : loading
            ? 'loading the last 30 days of prices…'
            : 'no prices yet.'}
        {theirs?.error && <span className="error"> Couldn’t update: {theirs.error}</span>}
      </li>
      <li>
        <strong>This app:</strong>{' '}
        {ours && ours.items > 0
          ? `recorded ${hourRanges(ours.byHour)} on ${ours.days} day${ours.days === 1 ? '' : 's'}` +
            (ours.lastAt ? `, last ${formatAgo(ours.lastAt, now)}` : '') +
            ' (finer detail at those times)'
          : 'records prices every 15 minutes while it’s running, for finer detail.'}
      </li>
    </ul>
  )
}

interface SidebarProps {
  settings: PublicSettings
  analysis: TrendAnalysis | undefined
  /** The sort in effect, when it differs from the chosen one. */
  sort: TrendSortKey
  patternsReady: boolean
}

function Sidebar({ settings, analysis, sort, patternsReady }: SidebarProps): React.JSX.Element {
  const updateSettings = useStore((s) => s.updateSettings)
  const loadTrends = useStore((s) => s.loadTrends)
  const trendsLoading = useStore((s) => s.trendsLoading)
  const t = settings.trends
  const set = (patch: Partial<TrendSettings>): void => void updateSettings({ trends: { ...t, ...patch } })

  return (
    <aside className="sidebar">
      <section>
        <h2>Price history</h2>
        <PriceHistory analysis={analysis} loading={trendsLoading} />
        <BackgroundToggles settings={settings} />
        <button className="button small" onClick={() => void loadTrends()} disabled={trendsLoading}>
          {trendsLoading ? 'Analysing…' : 'Re-analyse now'}
        </button>
      </section>

      <section>
        <h2>Split the day into</h2>
        <div className="mini-toggle wide" role="radiogroup" aria-label="Interval length">
          {TREND_INTERVALS.map((hours) => (
            <button
              key={hours}
              role="radio"
              aria-checked={t.intervalHours === hours}
              className={t.intervalHours === hours ? 'active' : ''}
              onClick={() => set({ intervalHours: hours })}
            >
              {hours} h
            </button>
          ))}
        </div>
        <p className="hint">
          {24 / t.intervalHours} parts of {t.intervalHours} hours. Shorter parts are more precise; longer ones
          are steadier. tarkov.dev checks prices about every 2 hours.
        </p>
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
          <span>Min swing</span>
          <select value={t.minSwing} onChange={(e) => set({ minSwing: Number(e.target.value) })}>
            {[...new Set([...SWING_OPTIONS, t.minSwing])]
              .sort((a, b) => a - b)
              .map((share) => (
                <option key={share} value={share}>
                  {share === 0 ? 'Any' : `${formatPercent(share)} or more`}
                </option>
              ))}
          </select>
        </label>
        <p className="hint">
          {patternsReady
            ? "A usual day's cheapest part to its dearest, from the price history."
            : "Today's low to high: from the price history once there are 6 hours of it, before that tarkov.dev's 24h range (which bait offers can inflate)."}
        </p>
        <NumberField
          label="Min offers up (sells quickly)"
          min={0}
          step={5}
          value={t.minOffers}
          onCommit={(minOffers) => set({ minOffers })}
        />
        <NumberField
          label="Min price"
          min={0}
          step={1000}
          value={t.minPrice}
          onCommit={(minPrice) => set({ minPrice })}
        />
        <NumberField
          label="Min profit per unit (after fee)"
          step={500}
          value={t.minProfit}
          onCommit={(minProfit) => set({ minProfit })}
        />
        <label className="field">
          <span>Worked on at least</span>
          <select value={t.minConsistency} onChange={(e) => set({ minConsistency: Number(e.target.value) })}>
            {[...new Set([0, 0.5, 0.6, 0.7, 0.8, t.minConsistency])]
              .sort((a, b) => a - b)
              .map((share) => (
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
        <label className="check">
          <input type="checkbox" checked={t.nowOnly} onChange={(e) => set({ nowOnly: e.target.checked })} />
          Only items to buy or sell now
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
            Sorted by {SORT_LABELS[sort].toLowerCase()} until buy and sell times are known.
          </p>
        )}
      </section>
    </aside>
  )
}

export default function TrendsView({ settings, priceState, ranking }: Props): React.JSX.Element {
  const dataMode = dataModeFor(settings.gameMode)
  const { analysis, rows: ranked, patternsReady, sort, clock } = ranking
  const loadTrends = useStore((s) => s.loadTrends)
  const trendsError = useStore((s) => s.trendsError)
  const selected = useStore((s) => s.selectedTrendItem)
  const selectTrendItem = useStore((s) => s.selectTrendItem)
  const updateSettings = useStore((s) => s.updateSettings)
  const dataset = priceState?.dataset ?? null
  const lastLoad = useRef(0)

  // Re-analyse when the view opens, the mode or window changes, once prices have loaded (profit
  // needs each item's base price), and (at most once a minute) after refreshes, which add new
  // recordings.
  const hasPrices = dataset !== null
  useEffect(() => {
    lastLoad.current = Date.now()
    void loadTrends()
  }, [loadTrends, dataMode, settings.trends.days, settings.trends.intervalHours, hasPrices])
  useEffect(() => {
    if (Date.now() - lastLoad.current < 60_000) return
    lastLoad.current = Date.now()
    void loadTrends()
  }, [loadTrends, dataset?.fetchedAt])

  const t = settings.trends
  const selectedRow = ranked.find((r) => r.item.id === selected) ?? null
  const bucketHours = clock.bucketHours
  // Stable, so memoised rows don't all re-render when the selection changes.
  const toggleItem = useCallback(
    (itemId: string) => selectTrendItem(useStore.getState().selectedTrendItem === itemId ? null : itemId),
    [selectTrendItem]
  )
  const setSort = (key: TrendSortKey): void => void updateSettings({ trends: { ...t, sort: key } })
  const header = (key: TrendSortKey, label: string): React.JSX.Element => (
    <button className={`sort ${sort === key ? 'active' : ''}`} onClick={() => setSort(key)}>
      {label}
      {sort === key && <span aria-hidden> ▼</span>}
    </button>
  )

  return (
    <div className="trends">
      <Sidebar settings={settings} analysis={analysis} sort={sort} patternsReady={patternsReady} />
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
                ? `The ${bucketHours}-hour part of the day each item is usually cheapest and dearest in, over the last ${t.days} days (your time zone).`
                : 'No buy and sell times yet (they need prices at two or more times of day on 4+ days). Until then, items are ranked by today’s price swing.'}
              {t.minSwing > 0 &&
                ` Showing items that swing ${formatPercent(t.minSwing)} or more ${
                  patternsReady ? 'on a usual day' : 'today'
                }.`}
            </span>
          </div>
          <div className="summary-stats muted">
            {patternsReady && (
              <span className="day-legend" aria-label="Day column key">
                Day:
                <span className="day-cell cheap" style={{ '--strength': '100%' } as React.CSSProperties} />
                cheaper
                <span className="day-cell dear" style={{ '--strength': '100%' } as React.CSSProperties} />
                dearer than the rest of the day · <b>B</b> buy · <b>S</b> sell ·
                <span className="day-cell now" />
                now
              </span>
            )}
            <span>
              Offers up stand in for sales volume, which isn't published. Past patterns aren't guarantees:
              prices move, and the listing fee is charged when you list.
            </span>
          </div>
          {trendsError && <div className="hint error">Couldn't load the price history: {trendsError}</div>}
        </div>

        <div className="trends-table-wrap">
          <table className="trends-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Now</th>
                <th className="num">{header('offers', 'Offers up')}</th>
                <th className="num">Lowest now</th>
                <th className="num">{header('swing', 'Today (low–high)')}</th>
                <th>Day</th>
                <th>Buy at</th>
                <th>{header('spread', 'Sell at')}</th>
                <th className="num">{header('profit', 'Profit / unit')}</th>
                <th className="num">{header('consistency', 'Worked on')}</th>
              </tr>
            </thead>
            <tbody>
              {ranked.slice(0, MAX_ROWS).map((row) => (
                <TrendTableRow
                  key={row.item.id}
                  row={row}
                  selected={row.item.id === selected}
                  bucketHours={bucketHours}
                  hour={clock.hour}
                  patternsReady={patternsReady}
                  onSelect={toggleItem}
                />
              ))}
            </tbody>
          </table>
          {ranked.length > MAX_ROWS && (
            <p className="table-note muted">
              Showing the top {MAX_ROWS} of {ranked.length.toLocaleString()}. Tighten the filters to narrow it
              down.
            </p>
          )}
          {!dataset && (
            <div className="empty">
              <p>Waiting for prices…</p>
            </div>
          )}
          {dataset && ranked.length < FEW_ROWS && <FilterFunnel settings={settings} ranking={ranking} />}
        </div>

        {selectedRow && (
          <TrendDetail row={selectedRow} analysis={analysis} days={t.days} dataMode={dataMode} />
        )}
      </main>
    </div>
  )
}
