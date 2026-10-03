import { describe, expect, it } from 'vitest'
import { fleaMarketFee } from '../src/shared/fleaFee'
import {
  analyzeHistory,
  anyPattern,
  currentSwing,
  rankTrends,
  timing,
  trendFunnel,
  todaySwing,
  type HistoryPoint,
  type TrendFilters,
  type TrendOptions,
  type TrendRow,
  type TrendStats
} from '../src/shared/fleaTrends'
import type { LootItem } from '../src/shared/types'
import { fleaAccess } from '../src/shared/valuation'

const HOUR = 3_600_000
const DAY = 24 * HOUR
/** Midnight UTC; the tests read times in UTC. */
const NOW = Date.UTC(2026, 8, 28)

const opts = (overrides: Partial<TrendOptions> = {}): TrendOptions => ({
  now: NOW,
  days: 7,
  bucketHours: 1,
  hourOf: (t) => new Date(t).getUTCHours(),
  dayOf: (t) => new Date(t).toISOString().slice(0, 10),
  basePrice: 5_000,
  ...overrides
})

/** A point every 15 minutes over the `days` days before NOW, priced by `price(hour, day)`. */
function record(
  days: number,
  price: (hour: number, day: number) => number | null,
  from = NOW - days * DAY
): HistoryPoint[] {
  const points: HistoryPoint[] = []
  for (let t = from; t < from + days * DAY; t += 15 * 60_000) {
    const day = Math.floor((t - from) / DAY)
    points.push({ t, price: null, priceMin: price(new Date(t).getUTCHours(), day), offers: 40 })
  }
  return points
}

/** Cheapest at 04:00, dearest at 20:00, flat otherwise. */
const cycle = (hour: number): number => (hour === 4 ? 8_000 : hour === 20 ? 13_000 : 10_000)

describe('analyzeHistory', () => {
  it('finds the cheapest and dearest hours of a daily cycle and the profit after the fee', () => {
    const stats = analyzeHistory(record(7, cycle), opts())
    const fee = fleaMarketFee(5_000, 13_000)!
    expect(stats).toMatchObject({
      insufficient: null,
      days: 7,
      buy: { startHour: 4, price: 8_000 },
      sell: { startHour: 20, price: 13_000 },
      spreadPct: 5_000 / 8_000,
      fee,
      profit: 13_000 - fee - 8_000,
      consistency: { wins: 7, days: 7 },
      holdHours: 16,
      avgOffers: 40,
      latestMin: 10_000
    })
    expect(stats.buckets).toHaveLength(24)
    expect(stats.buckets[4]).toMatchObject({ median: 8_000, q1: 8_000, q3: 8_000, samples: 28, days: 7 })
    expect(stats.coveredHours).toHaveLength(24)
    // Each day's hours range from 8k to 13k around a 10k median.
    expect(stats.volatility).toBeCloseTo(0.5)
  })

  it('keeps one silly listing a day out of the prices and the daily swing', () => {
    const points = record(4, cycle).map((p) =>
      new Date(p.t).getUTCHours() === 10 && new Date(p.t).getUTCMinutes() === 0 ? { ...p, priceMin: 1 } : p
    )
    const stats = analyzeHistory(points, opts())
    expect(stats.buy).toEqual({ startHour: 4, price: 8_000 })
    expect(stats.volatility).toBeCloseTo(0.5)
  })

  it('wraps the hold time past midnight', () => {
    const late = (hour: number): number => (hour === 22 ? 8_000 : hour === 3 ? 13_000 : 10_000)
    const stats = analyzeHistory(record(5, late), opts())
    expect(stats.buy?.startHour).toBe(22)
    expect(stats.sell?.startHour).toBe(3)
    expect(stats.holdHours).toBe(5)
  })

  it('counts the days on which the trade would have lost money', () => {
    // On days 1 and 4 the cycle runs the other way round.
    const stats = analyzeHistory(
      record(7, (hour, day) => (day === 1 || day === 4 ? cycle(24 - hour) : cycle(hour))),
      opts()
    )
    expect(stats.buy?.startHour).toBe(4)
    expect(stats.sell?.startHour).toBe(20)
    expect(stats.consistency).toEqual({ wins: 5, days: 7 })
  })

  it('still finds the cycle through noise', () => {
    let seed = 7
    const noise = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31
      return (seed / 2 ** 31 - 0.5) * 1_200
    }
    const stats = analyzeHistory(
      record(14, (hour) => cycle(hour) + noise()),
      opts({ days: 14 })
    )
    expect(stats.buy?.startHour).toBe(4)
    expect(stats.sell?.startHour).toBe(20)
    expect(stats.profit).toBeGreaterThan(3_000)
  })

  it('shows a flat price as no spread and a loss of the fee', () => {
    const stats = analyzeHistory(
      record(4, () => 10_000),
      opts()
    )
    expect(stats.insufficient).toBeNull()
    expect(stats.spreadPct).toBe(0)
    expect(stats.profit).toBe(-fleaMarketFee(5_000, 10_000)!)
    expect(stats.consistency).toEqual({ wins: 0, days: 4 })
    expect(stats.volatility).toBe(0)
  })

  it('needs prices on at least four days', () => {
    const stats = analyzeHistory(record(3, cycle), opts())
    expect(stats).toMatchObject({ insufficient: 'only 3 day(s) of prices', buy: null, profit: null, days: 3 })
    expect(stats.samples).toBe(3 * 96)
    // One 26-hour session touches three calendar days.
    const session = record(2, cycle, NOW - 3 * DAY + 23 * HOUR).filter((p) => p.t < NOW - DAY + HOUR)
    expect(analyzeHistory(session, opts()).insufficient).toBe('only 3 day(s) of prices')
  })

  it('finds the best times within the hours recorded, when only part of the day is', () => {
    // Recorded only in the evenings: cheapest 18:00–21:00, dearest 21:00–24:00.
    const evenings = (hour: number): number | null => (hour < 18 ? null : hour < 21 ? 9_000 : 11_000)
    const stats = analyzeHistory(record(6, evenings), opts({ bucketHours: 3 }))
    expect(stats).toMatchObject({
      insufficient: null,
      buy: { startHour: 18, price: 9_000 },
      sell: { startHour: 21, price: 11_000 },
      coveredHours: [18, 21],
      consistency: { wins: 6, days: 6 }
    })
    expect(stats.buckets.filter((b) => b.median === null)).toHaveLength(6)
    // A single time of day can't be compared with anything.
    const one = analyzeHistory(
      record(6, (hour) => (hour === 20 ? 10_000 : null)),
      opts({ bucketHours: 3 })
    )
    expect(one.insufficient).toBe('prices at fewer than two times of day on 4+ days')
  })

  it('splits the day into equal intervals of the chosen length', () => {
    // Cheap 03:00–06:00, dear 18:00–21:00.
    const blocks = (hour: number): number =>
      hour >= 3 && hour < 6 ? 8_000 : hour >= 18 && hour < 21 ? 12_000 : 10_000
    const three = analyzeHistory(record(7, blocks), opts({ bucketHours: 3 }))
    expect(three.buckets.map((b) => b.startHour)).toEqual([0, 3, 6, 9, 12, 15, 18, 21])
    expect(three).toMatchObject({
      buy: { startHour: 3, price: 8_000 },
      sell: { startHour: 18, price: 12_000 }
    })
    const six = analyzeHistory(record(7, blocks), opts({ bucketHours: 6 }))
    expect(six.buckets.map((b) => b.startHour)).toEqual([0, 6, 12, 18])
    expect(six.buy?.startHour).toBe(0)
    expect(six.sell?.startHour).toBe(18)
  })

  it("doesn't take a price drifting over the week for a time of day", () => {
    // Falling 5% a day with no daily cycle, recorded in the mornings on some days and the
    // evenings on others: raw prices would make the evenings look cheap.
    const days = 8
    const points = record(days, (hour, day) => {
      const morning = day % 2 === 0
      if (morning ? hour >= 12 : hour < 12) return null
      return 20_000 * (1 - 0.05 * day)
    })
    const stats = analyzeHistory(points, opts({ days, bucketHours: 6 }))
    expect(stats.insufficient).toBeNull()
    expect(stats.spreadPct).toBeCloseTo(0)
    // Shown at today's price level: the last three days' median.
    expect(stats.buy?.price).toBeCloseTo(20_000 * (1 - 0.05 * 6))
  })

  it('ignores prices outside the look-back window and missing prices', () => {
    const old = record(3, () => 1, NOW - 20 * DAY)
    const recent = record(7, (hour) => (hour === 12 ? null : cycle(hour)))
    const stats = analyzeHistory([...old, ...recent], opts())
    expect(stats.buy).toEqual({ startHour: 4, price: 8_000 })
    expect(stats.buckets[12]).toMatchObject({ median: null, samples: 0, days: 0 })
  })

  it('leaves profit unknown without a base price to work out the fee', () => {
    const stats = analyzeHistory(record(4, cycle), opts({ basePrice: null }))
    expect(stats.fee).toBeNull()
    expect(stats.profit).toBeNull()
    expect(stats.consistency).toEqual({ wins: 4, days: 4 })
  })

  it("measures the last 24 hours' range from hourly medians, once 6 hours are recorded", () => {
    // Cheapest at 04:00 (8k), dearest at 20:00 (13k), with one bait listing at 99,999 that a single
    // scan picked up: it's outvoted within its hour.
    const points = record(1, cycle)
    points[40] = { ...points[40], priceMin: 99_999 }
    expect(analyzeHistory(points, opts()).recent).toEqual({
      low: 8_000,
      high: 13_000,
      swing: 5 / 8,
      hours: 24,
      prices: points.filter((p) => p.t >= NOW - 24 * HOUR).length
    })
    // Five hours aren't enough to judge the day by.
    expect(analyzeHistory(record(1, cycle, NOW - 5 * HOUR).slice(0, 20), opts()).recent).toBeNull()
  })

  it("doesn't call one price all day a 0% swing, and lets tarkov.dev's checks show the range", () => {
    // The same price every 15 minutes all day: an old copy recorded over and over.
    const flat = record(1, () => 10_000)
    expect(analyzeHistory(flat, opts()).recent).toBeNull()
    // tarkov.dev's checks every 2 hours over the same day do move.
    const checks = Array.from({ length: 12 }, (_, i) => ({
      t: NOW - 23 * HOUR + i * 2 * HOUR,
      price: null,
      priceMin: i === 3 ? 9_000 : i === 9 ? 11_500 : 10_000,
      offers: 40
    }))
    // Recorded once (the recorder skips repeats), next to the checks.
    const merged = [flat[0], ...checks]
    expect(analyzeHistory(merged, opts()).recent).toMatchObject({ low: 9_000, high: 11_500, prices: 13 })
  })

  it('uses the dataset fee rates', () => {
    const feeRates = { sellOfferFeeRate: 0.05, sellRequirementFeeRate: 0.05 }
    const stats = analyzeHistory(record(4, cycle), opts({ feeRates }))
    expect(stats.fee).toBe(fleaMarketFee(5_000, 13_000, feeRates))
  })
})

function item(id: string, overrides: Partial<LootItem> = {}): LootItem {
  return {
    id,
    name: id,
    shortName: id,
    iconLink: null,
    wikiLink: null,
    width: 1,
    height: 1,
    slots: 1,
    types: [],
    category: null,
    bannedOnFlea: false,
    minLevelForFlea: null,
    fleaPrice: 10_000,
    fleaFee: null,
    bestTrader: null,
    basePrice: 5_000,
    offerCount: 100,
    low24hPrice: 9_000,
    high24hPrice: 11_000,
    ...overrides
  }
}

/** A week's pattern; no recorded last-24-hours range unless given, so today's swing is tarkov.dev's. */
function pattern(overrides: Partial<TrendStats> = {}): TrendRow['stats'] {
  return { ...analyzeHistory(record(7, cycle), opts()), recent: null, ...overrides }
}

function row(lootItem: LootItem, stats: TrendRow['stats'] = null, level = 20): TrendRow {
  return { item: lootItem, stats, access: fleaAccess(lootItem, level, 15) }
}

const filters = (overrides: Partial<TrendFilters> = {}): TrendFilters => ({
  minOffers: 25,
  minPrice: 5_000,
  minProfit: 1_000,
  minConsistency: 0.6,
  minSwing: 0,
  tradableOnly: true,
  nowOnly: false,
  ...overrides
})
const ids = (rows: TrendRow[]): string[] => rows.map((r) => r.item.id)

describe('timing', () => {
  // Buy 03:00–06:00, sell 18:00–21:00.
  const blocks = (hour: number): number =>
    hour >= 3 && hour < 6 ? 8_000 : hour >= 18 && hour < 21 ? 12_000 : 10_000
  const stats = analyzeHistory(record(7, blocks), opts({ bucketHours: 3 }))

  it('says when to buy and sell, and how long until each', () => {
    expect(timing(stats, 4, 3)).toEqual({ now: 'buy', buyIn: 0, sellIn: 14 })
    expect(timing(stats, 20, 3)).toEqual({ now: 'sell', buyIn: 7, sellIn: 0 })
    expect(timing(stats, 10, 3)).toEqual({ now: null, buyIn: 17, sellIn: 8 })
    // Past midnight.
    expect(timing(stats, 23, 3)).toEqual({ now: null, buyIn: 4, sellIn: 19 })
  })

  it('has nothing to say for a flat price', () => {
    expect(
      timing(
        analyzeHistory(
          record(5, () => 10_000),
          opts({ bucketHours: 3 })
        ),
        4,
        3
      )
    ).toBeNull()
  })
})

describe('currentSwing', () => {
  it("prefers the recordings' last 24 hours to tarkov.dev's range, which bait listings inflate", () => {
    const bait = item('bait', { high24hPrice: 99_999 })
    expect(currentSwing(row(bait))).toBeNull()
    expect(
      currentSwing(
        row(bait, pattern({ recent: { low: 9_000, high: 10_800, swing: 0.2, hours: 12, prices: 48 } }))
      )
    ).toBe(0.2)
    expect(currentSwing(row(item('a')))).toBeCloseTo(2_000 / 9_000)
    // While collecting, the swing filter goes by it.
    const recorded = row(
      bait,
      pattern({ recent: { low: 9_000, high: 10_800, swing: 0.2, hours: 12, prices: 48 } })
    )
    expect(ids(rankTrends([recorded], filters({ minSwing: 0.15 }), 'swing', false))).toEqual(['bait'])
  })
})

describe('todaySwing', () => {
  it("is today's range as a share of the low", () => {
    expect(todaySwing(item('a'))).toBeCloseTo(2_000 / 9_000)
    expect(todaySwing(item('a', { low24hPrice: null }))).toBeNull()
    expect(todaySwing(item('a', { low24hPrice: 12_000 }))).toBeNull()
  })

  it('ignores ranges that include joke listings far from the current price', () => {
    expect(todaySwing(item('a', { high24hPrice: 999_999 }))).toBeNull()
    expect(todaySwing(item('a', { low24hPrice: 1_000 }))).toBeNull()
    expect(todaySwing(item('a', { high24hPrice: 16_000 }))).toBeNull()
    expect(todaySwing(item('a', { low24hPrice: 7_000, high24hPrice: 14_000 }))).toBe(1)
    expect(todaySwing(item('a', { fleaPrice: null }))).toBeNull()
  })
})

describe('rankTrends', () => {
  const liquid = row(item('liquid', { offerCount: 500 }), pattern())
  const thin = row(item('thin', { offerCount: 3 }), pattern({ avgOffers: 3 }))
  const cheap = row(item('cheap', { fleaPrice: 1_000 }), pattern({ latestMin: 1_000 }))
  const banned = row(item('banned', { bannedOnFlea: true }), pattern())
  const locked = row(item('locked', { minLevelForFlea: 40 }), pattern())
  const unprofitable = row(item('unprofitable'), pattern({ profit: 500 }))
  const unreliable = row(item('unreliable'), pattern({ consistency: { wins: 3, days: 7 } }))
  const unrecorded = row(item('unrecorded', { low24hPrice: 7_000, high24hPrice: 14_000 }))
  const all = [liquid, thin, cheap, banned, locked, unprofitable, unreliable, unrecorded]

  it('keeps liquid, tradable items with a profitable, reliable pattern', () => {
    expect(ids(rankTrends(all, filters(), 'profit', true))).toEqual(['liquid'])
  })

  it('relaxes each filter independently', () => {
    expect(ids(rankTrends(all, filters({ minOffers: 0 }), 'profit', true))).toContain('thin')
    expect(ids(rankTrends(all, filters({ minPrice: 0 }), 'profit', true))).toContain('cheap')
    expect(ids(rankTrends(all, filters({ tradableOnly: false }), 'profit', true))).toContain('locked')
    expect(ids(rankTrends(all, filters({ minProfit: 0 }), 'profit', true))).toContain('unprofitable')
    expect(ids(rankTrends(all, filters({ minConsistency: 0.4 }), 'profit', true))).toContain('unreliable')
  })

  it("filters on today's swing while collecting, then on the typical day's swing", () => {
    const f = filters({ minSwing: 0.3 })
    // Most fixtures swing 9k–11k today (22%); "unrecorded" swings 7k–14k (100%).
    expect(ids(rankTrends(all, f, 'swing', false))).toEqual(['unrecorded'])
    const outlier = row(item('outlier', { high24hPrice: 999_999 }))
    const unknown = row(item('unknown', { low24hPrice: null }))
    expect(ids(rankTrends([outlier, unknown], f, 'swing', false))).toEqual([])
    expect(ids(rankTrends([outlier, unknown], filters(), 'swing', false))).toEqual(['outlier', 'unknown'])

    // The recorded days swing between 8k and 13k; a calmer item's days swing 25%. The gap between
    // the usual cheapest and dearest hour doesn't count here (profit and consistency judge that).
    expect(liquid.stats!.volatility).toBeGreaterThan(0.3)
    const calm = row(item('calm'), pattern({ volatility: 0.25 }))
    const narrowGap = row(item('narrowGap'), pattern({ spreadPct: 0.05 }))
    expect(ids(rankTrends([liquid, calm, narrowGap], f, 'profit', true))).toEqual(['liquid', 'narrowGap'])
    expect(ids(rankTrends([liquid, calm], filters({ minSwing: 0.2 }), 'profit', true)).sort()).toEqual([
      'calm',
      'liquid'
    ])
  })

  it('counts what each filter leaves, in order, to explain a short list', () => {
    expect(trendFunnel(all, filters({ minSwing: 0.3 }), true)).toEqual([
      { key: null, count: 7 },
      { key: 'tradableOnly', count: 6 },
      { key: 'minOffers', count: 5 },
      { key: 'minPrice', count: 4 },
      { key: 'pattern', count: 3 },
      { key: 'minSwing', count: 3 },
      { key: 'minProfit', count: 2 },
      { key: 'minConsistency', count: 1 }
    ])
    expect(trendFunnel(all, filters({ minSwing: 0.3 }), false).map((s) => s.count)).toEqual([7, 6, 5, 4, 1])
    expect(trendFunnel(all, filters(), false).at(-1)!.count).toBe(
      rankTrends(all, filters(), 'swing', false).length
    )
  })

  it('lists only items to buy or sell now, when asked', () => {
    // The fixtures buy at 04:00 and sell at 20:00 (one-hour intervals).
    const f = filters({ nowOnly: true })
    expect(ids(rankTrends(all, f, 'profit', true, { hour: 4, bucketHours: 1 }))).toEqual(['liquid'])
    expect(ids(rankTrends(all, f, 'profit', true, { hour: 20, bucketHours: 1 }))).toEqual(['liquid'])
    expect(ids(rankTrends(all, f, 'profit', true, { hour: 12, bucketHours: 1 }))).toEqual([])
    expect(trendFunnel(all, f, true, { hour: 12, bucketHours: 1 }).at(-1)).toEqual({ key: 'now', count: 0 })
    // Without a clock (or while there are no patterns), it doesn't apply.
    expect(ids(rankTrends(all, f, 'profit', true))).toEqual(['liquid'])
  })

  it('knows whether any item has a pattern yet', () => {
    expect(anyPattern(all)).toBe(true)
    expect(anyPattern([unrecorded, banned])).toBe(false)
    expect(anyPattern([row(item('short'), analyzeHistory(record(2, cycle), opts()))])).toBe(false)
  })

  it('never lists flea-banned items or weapon presets', () => {
    const none = filters({
      minOffers: 0,
      minPrice: 0,
      minProfit: -Infinity,
      minConsistency: 0,
      tradableOnly: false
    })
    const preset = row(item('preset', { types: ['preset'] }), pattern())
    expect(ids(rankTrends([...all, preset], none, 'profit', true))).not.toContain('banned')
    expect(ids(rankTrends([...all, preset], none, 'swing', false))).not.toContain('banned')
    expect(ids(rankTrends([...all, preset], none, 'swing', false))).not.toContain('preset')
  })

  it('lists every liquid item by today’s swing while recordings are too short', () => {
    expect(ids(rankTrends(all, filters(), 'swing', false))).toEqual([
      'unrecorded',
      'liquid',
      'unprofitable',
      'unreliable'
    ])
  })

  it('sorts by the chosen measure, best first, then by name', () => {
    const a = row(item('a'), pattern({ profit: 2_000, spreadPct: 0.5, volatility: 0.1 }))
    const b = row(item('b'), pattern({ profit: 3_000, spreadPct: 0.2, volatility: 0.4, avgOffers: 900 }))
    const c = row(item('c'), pattern({ profit: 2_000, spreadPct: 0.3, volatility: 0.2 }))
    const rows = [a, b, c]
    const f = filters({ minConsistency: 0 })
    expect(ids(rankTrends(rows, f, 'profit', true))).toEqual(['b', 'a', 'c'])
    expect(ids(rankTrends(rows, f, 'spread', true))).toEqual(['a', 'c', 'b'])
    expect(ids(rankTrends(rows, f, 'volatility', true))).toEqual(['b', 'c', 'a'])
    expect(ids(rankTrends(rows, f, 'offers', true))).toEqual(['b', 'a', 'c'])
    expect(
      ids(
        rankTrends(
          [a, row(item('d'), pattern({ consistency: { wins: 6, days: 7 } }))],
          f,
          'consistency',
          true
        )
      )
    ).toEqual(['a', 'd'])
  })
})
