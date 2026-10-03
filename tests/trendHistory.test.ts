import { describe, expect, it } from 'vitest'
import { createTarkovDevHistory } from '../src/main/trends/history'
import { createPriceRecorder, liquidItems } from '../src/main/trends/recorder'
import { createTrendService } from '../src/main/trends/trendService'
import type { LootItem, PriceDataset } from '../src/shared/types'
import { jsonResponse, mockFetch, tempDir } from './helpers'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const NOW = Date.UTC(2026, 9, 2, 12)

function item(id: string, offerCount: number, overrides: Partial<LootItem> = {}): LootItem {
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
    fleaPrice: 20_000,
    fleaFee: null,
    bestTrader: null,
    basePrice: 10_000,
    offerCount,
    ...overrides
  }
}

const dataset = (items: LootItem[]): PriceDataset => ({
  dataMode: 'pvp',
  source: 'tarkov.dev',
  fetchedAt: NOW,
  fleaMinLevel: 15,
  items
})

/** tarkov.dev's history: a point a day for 90 days, then every 2 hours for the last 30, cheapest 12:00–15:00. */
function tarkovDevPoints(now: number): Record<string, number>[] {
  const points: Record<string, number>[] = []
  for (let t = now - 90 * DAY; t < now - 30 * DAY; t += DAY)
    points.push({ timestamp: t, price: 1, priceMin: 1, offerCount: 5 })
  for (let t = now - 30 * DAY; t <= now; t += 2 * HOUR) {
    const hour = new Date(t).getUTCHours()
    points.push({
      timestamp: t,
      price: 20_000,
      priceMin: hour >= 12 && hour < 15 ? 16_000 : 20_000,
      offerCount: 40
    })
  }
  return points
}

function setup(fail: () => boolean = () => false) {
  let t = NOW
  const requested: string[] = []
  const fetchFn = mockFetch({
    tarkovDevJson: (url) => {
      requested.push(url.split('/').pop()!)
      return fail() ? jsonResponse({ error: 'down' }, 503) : jsonResponse({ data: tarkovDevPoints(t) })
    }
  })
  return { fetchFn, requested, now: () => t, advance: (ms: number) => (t += ms) }
}

describe('liquidItems', () => {
  it('picks the most-listed tradable items worth the minimum, as the recorder always has', () => {
    const items = [
      item('few', 5),
      item('most', 900),
      item('banned', 5_000, { bannedOnFlea: true }),
      item('preset', 9_000, { types: ['preset'] }),
      item('cheap', 8_000, { fleaPrice: 9_999 }),
      item('none', 0),
      item('many', 300)
    ]
    expect(liquidItems(items, 10_000, 2).map((i) => i.id)).toEqual(['most', 'many'])
    expect(liquidItems(items, 10_000, 10).map((i) => i.id)).toEqual(['most', 'many', 'few'])
  })
})

describe("tarkov.dev's 30-day history", () => {
  it('fetches the most-listed items and keeps their last 30 days', async () => {
    const s = setup()
    const history = createTarkovDevHistory({
      dir: await tempDir(),
      fetchFn: s.fetchFn,
      now: s.now,
      maxItems: 2
    })
    const result = await history.load('pvp', dataset([item('a', 50), item('b', 40), item('c', 30)]))
    expect(s.requested.sort()).toEqual(['a', 'b'])
    expect(result.error).toBeNull()
    expect(result.fetchedAt).toBe(NOW)
    const points = result.byItem.get('a')!
    // 30 days every 2 hours, and none of the older daily points.
    expect(points).toHaveLength(30 * 12 + 1)
    expect(points[0]).toEqual({ t: NOW - 30 * DAY, price: null, priceMin: 16_000, offers: 40 })
    expect(Math.min(...points.map((p) => p.priceMin!))).toBe(16_000)
  })

  it('reuses copies under 2 hours old and refetches older ones', async () => {
    const s = setup()
    const dir = await tempDir()
    const history = createTarkovDevHistory({ dir, fetchFn: s.fetchFn, now: s.now })
    const data = dataset([item('a', 50)])
    await history.load('pvp', data)
    s.advance(HOUR)
    await history.load('pvp', data)
    expect(s.requested).toEqual(['a'])
    s.advance(HOUR + MIN)
    await history.load('pvp', data)
    expect(s.requested).toEqual(['a', 'a'])
    // Kept on disk: a new session has it without fetching.
    const next = createTarkovDevHistory({ dir, fetchFn: s.fetchFn, now: s.now })
    expect((await next.load('pvp', null)).byItem.get('a')).toHaveLength(30 * 12 + 1)
    expect(s.requested).toHaveLength(2)
  })

  it('keeps what it has when tarkov.dev fails, and waits 10 minutes before trying again', async () => {
    let down = false
    const s = setup(() => down)
    const history = createTarkovDevHistory({ dir: await tempDir(), fetchFn: s.fetchFn, now: s.now })
    const data = dataset([item('a', 50), item('b', 40)])
    await history.load('pvp', data)
    down = true
    s.advance(3 * HOUR)
    const failed = await history.load('pvp', data)
    expect(failed.error).toMatch(/503/)
    expect(failed.byItem.get('a')).toBeDefined()
    // Offline: it stops after the first batch rather than asking for every item.
    expect(s.requested).toHaveLength(4)
    s.advance(5 * MIN)
    await history.load('pvp', data)
    expect(s.requested).toHaveLength(4)
    down = false
    s.advance(6 * MIN)
    expect((await history.load('pvp', data)).error).toBeNull()
    expect(s.requested).toHaveLength(6)
  })
})

describe('the trend service with both sources', () => {
  it("merges tarkov.dev's history with the app's recordings and reports both", async () => {
    const s = setup()
    const dir = await tempDir()
    const data = dataset([item('a', 50), item('b', 40)])
    // The app recorded "a" in the evenings for the last 5 days.
    let t = NOW - 5 * DAY
    const recorder = createPriceRecorder({ dir, now: () => t, minPrice: 0 })
    for (; t <= NOW; t += 15 * MIN) {
      const hour = new Date(t).getUTCHours()
      // The offer count changes with every snapshot, as it does live.
      if (hour >= 18) await recorder.record(dataset([item('a', 50 + ((t / (15 * MIN)) % 2))]))
    }
    const service = createTrendService({
      recorder,
      history: createTarkovDevHistory({ dir, fetchFn: s.fetchFn, now: s.now }),
      now: s.now,
      hourOf: (time) => new Date(time).getUTCHours(),
      dayOf: (time) => new Date(time).toISOString().slice(0, 10),
      fetchFn: s.fetchFn,
      getDataset: () => data
    })
    const analysis = await service.analyze('pvp', 14, 3)
    expect(analysis.bucketHours).toBe(3)
    expect(analysis.stats.a).toMatchObject({ buy: { startHour: 12 }, sell: { startHour: 0 } })
    expect(analysis.stats.b).toMatchObject({ buy: { startHour: 12 } })
    expect(analysis.stats.a.coveredHours).toHaveLength(8)
    const [theirs, ours] = analysis.coverage.sources
    expect(theirs).toMatchObject({ id: 'tarkov.dev', items: 2, days: 15, error: null })
    // A point every 2 hours: every other hour of the day.
    expect(theirs.byHour.filter((n) => n > 0)).toHaveLength(12)
    // Five evenings (today's hasn't come yet).
    expect(ours).toMatchObject({ id: 'local', items: 1, days: 5 })
    expect(ours.byHour.slice(0, 18).every((n) => n === 0)).toBe(true)
    // The same inputs give the same analysis back.
    expect(await service.analyze('pvp', 14, 3)).toBe(analysis)
    expect(await service.analyze('pvp', 14, 6)).not.toBe(analysis)
  })
})
