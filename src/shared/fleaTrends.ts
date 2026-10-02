import { fleaMarketFee, type FleaFeeRates } from './fleaFee'
import type { LootItem } from './types'
import type { FleaAccess } from './valuation'

/** One scan of an item's flea offers. */
export interface HistoryPoint {
  /** Epoch ms. */
  t: number
  /** Average listed price. */
  price: number | null
  /** Lowest listed price: what you pay to buy, and roughly what you must list at to sell fast. */
  priceMin: number | null
  /** Number of offers up at the time, when the feed reports it. */
  offers: number | null
}

export interface TrendOptions {
  now: number
  /** Lookback window in days. */
  days: number
  /** Width of a time-of-day slot in hours (divides 24). */
  bucketHours: number
  /** Hour of day (0–23) for a timestamp, in the player's time zone. */
  hourOf: (t: number) => number
  /** Calendar day key for a timestamp, in the player's time zone. */
  dayOf: (t: number) => string
  basePrice: number | null
  feeRates?: FleaFeeRates
}

export interface TrendBucket {
  startHour: number
  /** Typical lowest price in this interval: its usual level against the day, at today's prices. */
  median: number | null
  q1: number | null
  q3: number | null
  samples: number
  /** Days with prices in this interval. */
  days: number
}

export interface TrendSlot {
  startHour: number
  price: number
}

export interface TrendStats {
  /** Why no pattern could be measured, or null when it could. */
  insufficient: string | null
  samples: number
  days: number
  buckets: TrendBucket[]
  buy: TrendSlot | null
  sell: TrendSlot | null
  /** (sell − buy) ÷ buy. */
  spreadPct: number | null
  /** Flea listing fee for one unit at the sell price. */
  fee: number | null
  /** Per unit, after the listing fee. */
  profit: number | null
  /** Days on which buying in the buy slot and selling in the sell slot would have made money. */
  consistency: { wins: number; days: number } | null
  /** Median over days of that day's (dearest − cheapest interval) ÷ its median lowest price. */
  volatility: number | null
  avgOffers: number | null
  latestMin: number | null
  /** Hours from the start of the buy slot to the start of the sell slot. */
  holdHours: number | null
  /** The last 24 hours' cheapest and dearest hour (hourly medians), once enough hours are recorded. */
  recent: { low: number; high: number; swing: number; hours: number } | null
  /** Start hours of the intervals with enough days of prices (all of them when the whole day is known). */
  coveredHours: number[]
}

/** An interval needs prices on this many days before it counts. */
export const MIN_INTERVAL_DAYS = 4
/** Hours with recordings in the last 24 needed before their range stands in for tarkov.dev's. */
const RECENT_MIN_HOURS = 6
const HOUR = 3_600_000
/** The price shown for an interval is its usual level times the median of this many recent days. */
const REFERENCE_DAYS = 3

function quantile(sorted: ArrayLike<number>, q: number): number {
  const pos = (sorted.length - 1) * q
  const lower = Math.floor(pos)
  const upper = Math.ceil(pos)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower)
}

/** Ascending copy; typed arrays sort numerically without a comparator, which is much faster. */
function sorted(values: number[]): Float64Array {
  return Float64Array.from(values).sort()
}

function median(values: number[]): number {
  return quantile(sorted(values), 0.5)
}

function emptyStats(
  insufficient: string,
  samples: number,
  days: number,
  latestMin: number | null,
  recent: TrendStats['recent']
): TrendStats {
  return {
    insufficient,
    samples,
    days,
    buckets: [],
    buy: null,
    sell: null,
    spreadPct: null,
    fee: null,
    profit: null,
    consistency: null,
    volatility: null,
    avgOffers: null,
    latestMin,
    holdHours: null,
    recent,
    coveredHours: []
  }
}

/**
 * The last 24 hours' price range from the recordings. Hourly medians, so a bait listing or a
 * moment when the cheap offers sold out doesn't count as the swing (tarkov.dev's own 24h high is
 * mostly such listings).
 */
function recentRange(window: readonly HistoryPoint[], now: number): TrendStats['recent'] {
  const byHour = new Map<number, number[]>()
  for (let i = window.length - 1; i >= 0 && window[i].t >= now - 24 * HOUR; i--) {
    const hour = Math.floor(window[i].t / HOUR)
    const values = byHour.get(hour)
    if (values) values.push(window[i].priceMin!)
    else byHour.set(hour, [window[i].priceMin!])
  }
  if (byHour.size < RECENT_MIN_HOURS) return null
  const medians = [...byHour.values()].map(median)
  const low = Math.min(...medians)
  const high = Math.max(...medians)
  return { low, high, swing: low > 0 ? (high - low) / low : 0, hours: byHour.size }
}

/**
 * Find the cheapest and dearest time of day for an item from its lowest-offer prices, and how
 * reliably buying in one and selling in the other would have paid off after the listing fee.
 *
 * The day is split into equal intervals. Each day's intervals are measured against that day's own
 * median, so a price that drifts over the week doesn't pass for a time-of-day effect; an interval's
 * usual level is the median of those over the days it has prices on. Only intervals with prices on
 * `MIN_INTERVAL_DAYS` days count, and two are enough: with recordings from only part of the day,
 * the buy and sell times are the best within those hours (`coveredHours`).
 */
export function analyzeHistory(points: readonly HistoryPoint[], opts: TrendOptions): TrendStats {
  const from = opts.now - opts.days * 24 * 3_600_000
  const window = points
    .filter((p) => p.t >= from && p.t <= opts.now && p.priceMin != null && p.priceMin > 0)
    .sort((a, b) => a.t - b.t)
  const latestMin = window.at(-1)?.priceMin ?? null
  const recent = recentRange(window, opts.now)
  const slotCount = Math.round(24 / opts.bucketHours)
  const slotOf = (t: number): number => Math.min(slotCount - 1, Math.floor(opts.hourOf(t) / opts.bucketHours))

  const samples = Array.from({ length: slotCount }, () => 0)
  const byDay = new Map<string, number[][]>()
  for (const p of window) {
    const slot = slotOf(p.t)
    samples[slot]++
    const day = opts.dayOf(p.t)
    let slots = byDay.get(day)
    if (!slots) {
      slots = Array.from({ length: slotCount }, () => [])
      byDay.set(day, slots)
    }
    slots[slot].push(p.priceMin!)
  }

  if (byDay.size < MIN_INTERVAL_DAYS)
    return emptyStats(`only ${byDay.size} day(s) of prices`, window.length, byDay.size, latestMin, recent)

  // Each day's intervals against the day's median (days with prices in only one interval say nothing).
  const ratios: number[][] = Array.from({ length: slotCount }, () => [])
  const dailyRanges: number[] = []
  for (const slots of byDay.values()) {
    const medians = slots.map((values) => (values.length ? median(values) : null))
    const known = medians.filter((m): m is number => m !== null)
    if (known.length < 2) continue
    const mid = median(slots.flat())
    if (!(mid > 0)) continue
    medians.forEach((m, slot) => m !== null && ratios[slot].push(m / mid))
    // Interval medians, so a single silly listing doesn't count as the day's swing.
    if (known.length >= 3) dailyRanges.push((Math.max(...known) - Math.min(...known)) / mid)
  }

  // Today's price level: the median of the last few days, which the usual levels scale.
  const lastDays = new Set([...byDay.keys()].sort().slice(-REFERENCE_DAYS))
  const reference = median(window.filter((p) => lastDays.has(opts.dayOf(p.t))).map((p) => p.priceMin!))
  const buckets: TrendBucket[] = ratios.map((values, slot) => {
    const ordered = sorted(values)
    const enough = values.length >= MIN_INTERVAL_DAYS
    return {
      startHour: slot * opts.bucketHours,
      median: enough ? quantile(ordered, 0.5) * reference : null,
      q1: enough ? quantile(ordered, 0.25) * reference : null,
      q3: enough ? quantile(ordered, 0.75) * reference : null,
      samples: samples[slot],
      days: values.length
    }
  })
  const filled = buckets.filter((b) => b.median !== null)
  if (filled.length < 2)
    return {
      ...emptyStats(
        `prices at fewer than two times of day on ${MIN_INTERVAL_DAYS}+ days`,
        window.length,
        byDay.size,
        latestMin,
        recent
      ),
      buckets
    }

  const cheapest = filled.reduce((a, b) => (b.median! < a.median! ? b : a))
  const dearest = filled.reduce((a, b) => (b.median! > a.median! ? b : a))
  const buy = { startHour: cheapest.startHour, price: cheapest.median! }
  const sell = { startHour: dearest.startHour, price: dearest.median! }
  const feeFor = (price: number): number | null =>
    opts.basePrice ? fleaMarketFee(opts.basePrice, price, opts.feeRates) : null
  const fee = feeFor(sell.price)
  const profit = fee === null ? null : sell.price - fee - buy.price

  // A day "wins" if that day's sell-slot price, after the fee, beat its buy-slot price.
  const buySlot = cheapest.startHour / opts.bucketHours
  const sellSlot = dearest.startHour / opts.bucketHours
  let wins = 0
  let comparable = 0
  for (const slots of byDay.values()) {
    if (!slots[buySlot].length || !slots[sellSlot].length) continue
    const dayBuy = median(slots[buySlot])
    const daySell = median(slots[sellSlot])
    comparable++
    if (daySell - (feeFor(daySell) ?? 0) > dayBuy) wins++
  }

  const offers = window.map((p) => p.offers).filter((o): o is number => o != null)
  return {
    insufficient: null,
    samples: window.length,
    days: byDay.size,
    buckets,
    buy,
    sell,
    spreadPct: buy.price > 0 ? (sell.price - buy.price) / buy.price : null,
    fee,
    profit,
    consistency: comparable ? { wins, days: comparable } : null,
    volatility: dailyRanges.length ? median(dailyRanges) : null,
    avgOffers: offers.length ? offers.reduce((a, b) => a + b, 0) / offers.length : null,
    latestMin,
    holdHours: (sell.startHour - buy.startHour + 24) % 24 || 24,
    recent,
    coveredHours: filled.map((b) => b.startHour)
  }
}

/** What to do with an item at an hour of the day: buy or sell now, and hours until each next opens. */
export interface Timing {
  now: 'buy' | 'sell' | null
  buyIn: number
  sellIn: number
}

/** Where the hour falls against an item's buy and sell intervals. */
export function timing(stats: TrendStats, hour: number, bucketHours: number): Timing | null {
  if (!stats.buy || !stats.sell || stats.buy.startHour === stats.sell.startHour) return null
  const hoursUntil = (start: number): number => {
    const into = (hour - start + 24) % 24
    return into < bucketHours ? 0 : 24 - into
  }
  const buyIn = hoursUntil(stats.buy.startHour)
  const sellIn = hoursUntil(stats.sell.startHour)
  return { now: buyIn === 0 ? 'buy' : sellIn === 0 ? 'sell' : null, buyIn, sellIn }
}

export interface TrendRow {
  item: LootItem
  /** Time-of-day statistics from the recordings; null while the item has none. */
  stats: TrendStats | null
  access: FleaAccess
}

/** A 24h low or high this far from the current price is a bait or mistaken listing, not a swing. */
const OUTLIER_FACTOR = 1.5

/**
 * Today's price range as a share of the low: (high24h − low24h) ÷ low24h. Null when unknown, or
 * when the range includes outlier listings (under 2/3 or over 1.5× the current price), which
 * tarkov.dev's 24h figures often do.
 */
export function todaySwing(item: LootItem): number | null {
  const low = item.low24hPrice ?? null
  const high = item.high24hPrice ?? null
  const price = item.fleaPrice ?? null
  if (!low || !high || !price || high < low) return null
  if (high > price * OUTLIER_FACTOR || low < price / OUTLIER_FACTOR) return null
  return (high - low) / low
}

/** Today's swing: the recordings' last 24 hours once there are enough, else tarkov.dev's 24h range. */
export function currentSwing(row: TrendRow): number | null {
  return row.stats?.recent?.swing ?? todaySwing(row.item)
}

export interface TrendFilters {
  /** Liquidity: minimum average number of offers up. */
  minOffers: number
  minPrice: number
  /** Per unit, after the fee. */
  minProfit: number
  /** Share of days the trade would have made money, 0–1. */
  minConsistency: number
  /**
   * Minimum swing, as a share of the day's low: today's low→high while collecting (see
   * `currentSwing`), then the typical day's cheapest→dearest hour from the recordings (the same
   * scale, so the list doesn't empty when patterns are ready). 0 turns it off.
   */
  minSwing: number
  /** Only items the player can buy and sell on the flea at their level. */
  tradableOnly: boolean
  /** Only items whose buy or sell interval is now. */
  nowOnly: boolean
}

/** The time of day the "now" filter uses, and the analysis' interval length. */
export interface TrendClock {
  hour: number
  bucketHours: number
}

export type TrendSortKey = 'profit' | 'spread' | 'volatility' | 'consistency' | 'offers' | 'swing'

/** Offers up for an item: the recordings' average when there is one, else the latest count. */
export function liquidity(row: TrendRow): number | null {
  return row.stats?.avgOffers ?? row.item.offerCount ?? null
}

export function consistencyShare(stats: TrendRow['stats']): number {
  return stats?.consistency && stats.consistency.days ? stats.consistency.wins / stats.consistency.days : 0
}

export function hasPattern(row: TrendRow): boolean {
  return row.stats !== null && row.stats.insufficient === null && row.stats.buy !== null
}

function sortValue(row: TrendRow, key: TrendSortKey): number {
  switch (key) {
    case 'profit':
      return row.stats?.profit ?? -Infinity
    case 'spread':
      return row.stats?.spreadPct ?? -Infinity
    case 'volatility':
      return row.stats?.volatility ?? -Infinity
    case 'consistency':
      return hasPattern(row) ? consistencyShare(row.stats) : -Infinity
    case 'offers':
      return liquidity(row) ?? -Infinity
    case 'swing':
      return currentSwing(row) ?? -Infinity
  }
}

/** A filter of the flea trends list; `trendSteps` applies them in order. */
export type TrendFilterKey =
  'tradableOnly' | 'minOffers' | 'minPrice' | 'minSwing' | 'pattern' | 'minProfit' | 'minConsistency' | 'now'

function trendSteps(
  filters: TrendFilters,
  patternsOnly: boolean,
  clock: TrendClock | null
): { key: TrendFilterKey; pass: (row: TrendRow) => boolean }[] {
  const steps: { key: TrendFilterKey; pass: (row: TrendRow) => boolean }[] = [
    { key: 'tradableOnly', pass: (row) => !filters.tradableOnly || row.access.status === 'sellable' },
    { key: 'minOffers', pass: (row) => (liquidity(row) ?? 0) >= filters.minOffers },
    { key: 'minPrice', pass: (row) => (row.stats?.latestMin ?? row.item.fleaPrice ?? 0) >= filters.minPrice }
  ]
  if (!patternsOnly) {
    steps.push({
      key: 'minSwing',
      pass: (row) => filters.minSwing <= 0 || (currentSwing(row) ?? -1) >= filters.minSwing
    })
    return steps
  }
  steps.push(
    { key: 'pattern', pass: hasPattern },
    {
      key: 'minSwing',
      pass: (row) => filters.minSwing <= 0 || (row.stats!.volatility ?? -1) >= filters.minSwing
    },
    { key: 'minProfit', pass: (row) => (row.stats!.profit ?? -Infinity) >= filters.minProfit },
    { key: 'minConsistency', pass: (row) => consistencyShare(row.stats) >= filters.minConsistency }
  )
  if (filters.nowOnly && clock)
    steps.push({
      key: 'now',
      pass: (row) => timing(row.stats!, clock.hour, clock.bucketHours)?.now != null
    })
  return steps
}

/** Items that can be traded on the flea at all. Weapon presets duplicate their base guns. */
const onFlea = (row: TrendRow): boolean => !row.item.bannedOnFlea && !row.item.types.includes('preset')

/** Whether any item on the flea has a buy and sell time yet: until then, the list ranks by today's swing. */
export function anyPattern(rows: readonly TrendRow[]): boolean {
  return rows.some((row) => onFlea(row) && hasPattern(row))
}

/**
 * Liquid, tradable items that pass the filters, best first. With `patternsOnly`, only items
 * with a measurable time-of-day pattern count, and the swing filter applies to the typical day's
 * swing along with the profit and consistency filters (and, with `nowOnly` and a clock, only items
 * to buy or sell now); without it (before any item has a pattern) the swing filter applies to
 * today's 24h swing.
 */
export function rankTrends(
  rows: readonly TrendRow[],
  filters: TrendFilters,
  sort: TrendSortKey,
  patternsOnly: boolean,
  clock: TrendClock | null = null
): TrendRow[] {
  const steps = trendSteps(filters, patternsOnly, clock)
  return rows
    .filter((row) => onFlea(row) && steps.every((step) => step.pass(row)))
    .sort((a, b) => sortValue(b, sort) - sortValue(a, sort) || a.item.name.localeCompare(b.item.name))
}

/**
 * How many items are left after each filter, in order, to explain a short list: the first entry
 * (`key: null`) counts every item on the flea.
 */
export function trendFunnel(
  rows: readonly TrendRow[],
  filters: TrendFilters,
  patternsOnly: boolean,
  clock: TrendClock | null = null
): { key: TrendFilterKey | null; count: number }[] {
  let left = rows.filter(onFlea)
  const funnel: { key: TrendFilterKey | null; count: number }[] = [{ key: null, count: left.length }]
  for (const step of trendSteps(filters, patternsOnly, clock)) {
    left = left.filter(step.pass)
    funnel.push({ key: step.key, count: left.length })
  }
  return funnel
}
