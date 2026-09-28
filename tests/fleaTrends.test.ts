import { describe, expect, it } from 'vitest'
import { fleaMarketFee } from '../src/shared/fleaFee'
import {
  analyzeHistory,
  rankTrends,
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
    expect(stats.buckets[4]).toMatchObject({ median: 8_000, q1: 8_000, q3: 8_000, samples: 28 })
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

  it('needs at least three days of prices', () => {
    const stats = analyzeHistory(record(2, cycle), opts())
    expect(stats).toMatchObject({ insufficient: 'only 2 day(s) of prices', buy: null, profit: null, days: 2 })
    expect(stats.samples).toBe(2 * 96)
  })

  it('needs most hours of the day covered on more than one day', () => {
    // Only recorded during the working day.
    const office = analyzeHistory(
      record(5, (hour) => (hour >= 9 && hour < 17 ? cycle(hour) : null)),
      opts()
    )
    expect(office.insufficient).toBe('too many gaps in the price history')

    // One 26-hour session touches three calendar days but covers most hours only once.
    const session = record(2, cycle, NOW - 3 * DAY + 23 * HOUR).filter((p) => p.t < NOW - DAY + HOUR)
    expect(analyzeHistory(session, opts()).insufficient).toBe('too many gaps in the price history')
  })

  it('ignores prices outside the look-back window and missing prices', () => {
    const old = record(3, () => 1, NOW - 20 * DAY)
    const recent = record(7, (hour) => (hour === 12 ? null : cycle(hour)))
    const stats = analyzeHistory([...old, ...recent], opts())
    expect(stats.buy).toEqual({ startHour: 4, price: 8_000 })
    expect(stats.buckets[12]).toMatchObject({ median: null, samples: 0 })
  })

  it('leaves profit unknown without a base price to work out the fee', () => {
    const stats = analyzeHistory(record(4, cycle), opts({ basePrice: null }))
    expect(stats.fee).toBeNull()
    expect(stats.profit).toBeNull()
    expect(stats.consistency).toEqual({ wins: 4, days: 4 })
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

function pattern(overrides: Partial<TrendStats> = {}): TrendRow['stats'] {
  return { ...analyzeHistory(record(7, cycle), opts()), ...overrides }
}

function row(lootItem: LootItem, stats: TrendRow['stats'] = null, level = 20): TrendRow {
  return { item: lootItem, stats, access: fleaAccess(lootItem, level, 15) }
}

const filters = (overrides: Partial<TrendFilters> = {}): TrendFilters => ({
  minOffers: 25,
  minPrice: 5_000,
  minProfit: 1_000,
  minConsistency: 0.6,
  tradableOnly: true,
  ...overrides
})
const ids = (rows: TrendRow[]): string[] => rows.map((r) => r.item.id)

describe('todaySwing', () => {
  it("is today's range as a share of the low", () => {
    expect(todaySwing(item('a'))).toBeCloseTo(2_000 / 9_000)
    expect(todaySwing(item('a', { low24hPrice: null }))).toBeNull()
    expect(todaySwing(item('a', { low24hPrice: 12_000 }))).toBeNull()
  })

  it('ignores ranges that include joke listings far from the current price', () => {
    expect(todaySwing(item('a', { high24hPrice: 999_999 }))).toBeNull()
    expect(todaySwing(item('a', { low24hPrice: 1_000 }))).toBeNull()
    expect(todaySwing(item('a', { low24hPrice: 5_000, high24hPrice: 20_000 }))).toBe(3)
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
  const unrecorded = row(item('unrecorded', { low24hPrice: 5_000, high24hPrice: 10_000 }))
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
