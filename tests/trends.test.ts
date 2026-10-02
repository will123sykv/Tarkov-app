import { appendFile, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createPriceRecorder } from '../src/main/trends/recorder'
import { createTrendService, normalizeDailyHistory } from '../src/main/trends/trendService'
import type { LootItem, PriceDataset } from '../src/shared/types'
import { jsonResponse, mockFetch, tempDir } from './helpers'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const NOW = Date.UTC(2026, 8, 28, 12)

function item(id: string, offerCount: number | null, overrides: Partial<LootItem> = {}): LootItem {
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
    offerCount,
    ...overrides
  }
}

function dataset(items: LootItem[], dataMode: 'pvp' | 'pve' = 'pvp'): PriceDataset {
  return { dataMode, source: 'tarkov.dev', fetchedAt: NOW, fleaMinLevel: 15, items }
}

function clock(start = NOW) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

describe('createPriceRecorder', () => {
  it('records the most-listed tradable items worth ₽10k or more, one line per recording', async () => {
    const dir = await tempDir()
    const c = clock()
    const recorder = createPriceRecorder({ dir, now: c.now, maxItems: 2 })
    const recorded = await recorder.record(
      dataset([
        item('few', 5),
        item('most', 900),
        item('banned', 5_000, { bannedOnFlea: true }),
        item('unpriced', 5_000, { fleaPrice: null }),
        item('unknown', null),
        item('preset', 9_000, { types: ['preset'] }),
        item('cheap', 8_000, { fleaPrice: 9_999 }),
        item('many', 300)
      ])
    )
    expect(recorded).toBe(2)
    const text = await readFile(join(dir, 'pvp', '2026-09-28.ndjson'), 'utf8')
    expect(text).toBe(`[${NOW},["most","many"],[10000,10000],[900,300]]\n`)
  })

  it('records each mode at most once per interval', async () => {
    const dir = await tempDir()
    const c = clock()
    const recorder = createPriceRecorder({ dir, now: c.now, intervalMs: 15 * MIN })
    const items = [item('a', 50)]
    expect(await recorder.record(dataset(items))).toBe(1)
    c.advance(5 * MIN)
    expect(await recorder.record(dataset(items))).toBe(0)
    expect(await recorder.record(dataset(items, 'pve'))).toBe(1)
    c.advance(10 * MIN)
    expect(await recorder.record(dataset(items))).toBe(1)
    expect((await recorder.load('pvp', 1)).get('a')).toHaveLength(2)
  })

  it('loads recordings within the look-back window and skips damaged lines', async () => {
    const dir = await tempDir()
    const c = clock(NOW - 10 * DAY)
    const recorder = createPriceRecorder({ dir, now: c.now, minPrice: 0 })
    await recorder.record(dataset([item('a', 50, { fleaPrice: 1 })]))
    c.advance(9 * DAY)
    await recorder.record(dataset([item('a', 50, { fleaPrice: 2 })]))
    c.advance(DAY)
    await recorder.record(dataset([item('a', 60, { fleaPrice: 3 }), item('b', 40)]))
    await appendFile(
      join(dir, 'pvp', '2026-09-28.ndjson'),
      `[${NOW},["a"],[4\n{"not":"an array"}\n[${NOW},"a",5]\n[${NOW},["a",7,"b"],[5,6,"x"],null]\n`,
      'utf8'
    )

    const week = await recorder.load('pvp', 7)
    expect(week.get('a')).toEqual([
      { t: NOW - DAY, price: null, priceMin: 2, offers: 50 },
      { t: NOW, price: null, priceMin: 3, offers: 60 },
      // The hand-written line without offer counts.
      { t: NOW, price: null, priceMin: 5, offers: null }
    ])
    expect(week.get('b')).toHaveLength(1)
    expect((await recorder.load('pvp', 30)).get('a')).toHaveLength(4)
    expect((await recorder.load('pve', 7)).size).toBe(0)
  })

  it('deletes files older than the retention period, once a day', async () => {
    const dir = await tempDir()
    const c = clock()
    const recorder = createPriceRecorder({ dir, now: c.now, retentionDays: 30 })
    await recorder.record(dataset([item('a', 50)]))
    await writeFile(join(dir, 'pvp', '2026-08-01.ndjson'), '', 'utf8')
    await writeFile(join(dir, 'pvp', '2026-08-30.ndjson'), '', 'utf8')
    c.advance(HOUR)
    await recorder.record(dataset([item('a', 50)]))
    // Already pruned today.
    expect(await readdir(join(dir, 'pvp'))).toHaveLength(3)
    c.advance(DAY)
    await recorder.record(dataset([item('a', 50)]))
    expect((await readdir(join(dir, 'pvp'))).sort()).toEqual([
      '2026-08-30.ndjson',
      '2026-09-28.ndjson',
      '2026-09-29.ndjson'
    ])
  })
})

describe('normalizeDailyHistory', () => {
  it('reads tarkov.dev price points, sorted, dropping bad ones', () => {
    expect(
      normalizeDailyHistory([
        { timestamp: '200', price: 11, priceMin: 9, offerCount: 30 },
        { timestamp: 100, price: 10, priceMin: 0 },
        { price: 5 },
        null
      ])
    ).toEqual([
      { t: 100, price: 10, priceMin: null, offers: null },
      { t: 200, price: 11, priceMin: 9, offers: 30 }
    ])
    expect(normalizeDailyHistory({ data: [] })).toEqual([])
  })
})

describe('createTrendService', () => {
  const utc = {
    hourOf: (t: number) => new Date(t).getUTCHours(),
    dayOf: (t: number) => new Date(t).toISOString().slice(0, 10)
  }

  /** Records `a` every hour for `days` days ending at NOW: cheap at 04:00, dear at 20:00. */
  async function recorded(days: number) {
    const dir = await tempDir()
    const c = clock(NOW - days * DAY)
    const recorder = createPriceRecorder({ dir, now: c.now, minPrice: 0 })
    for (let t = NOW - days * DAY; t <= NOW; t += HOUR) {
      const hour = new Date(t).getUTCHours()
      const price = hour === 4 ? 8_000 : hour === 20 ? 13_000 : 10_000
      await recorder.record(dataset([item('a', 50, { fleaPrice: price })]))
      c.advance(HOUR)
    }
    return { recorder, now: () => NOW }
  }

  it('analyses every recorded item and reports coverage', async () => {
    const { recorder, now } = await recorded(5)
    const service = createTrendService({
      recorder,
      now,
      ...utc,
      fetchFn: mockFetch({}),
      getDataset: () => ({
        ...dataset([item('a', 50)]),
        fleaFeeRates: { sellOfferFeeRate: 0.03, sellRequirementFeeRate: 0.03 }
      })
    })
    // Two-hour intervals: 04:00–06:00 is the cheapest and 20:00–22:00 the dearest.
    const analysis = await service.analyze('pvp', 7, 2)
    expect(analysis).toMatchObject({
      dataMode: 'pvp',
      days: 7,
      bucketHours: 2,
      coverage: { snapshots: 5 * 24 + 1, days: 6, firstAt: NOW - 5 * DAY, lastAt: NOW, items: 1 }
    })
    expect(analysis.coverage.snapshotsByHour[12]).toBe(6)
    expect(analysis.coverage.snapshotsByHour[13]).toBe(5)
    expect(analysis.stats.a).toMatchObject({ buy: { startHour: 4 }, sell: { startHour: 20 } })
    expect(analysis.stats.a.profit).toBeGreaterThan(0)
    expect('series' in analysis.stats.a).toBe(false)
  })

  it('reuses the last analysis until something new is recorded', async () => {
    const dir = await tempDir()
    const c = clock()
    const recorder = createPriceRecorder({ dir, now: c.now })
    const load = vi.spyOn(recorder, 'load')
    const service = createTrendService({
      recorder,
      now: c.now,
      fetchFn: mockFetch({}),
      getDataset: () => null
    })
    await recorder.record(dataset([item('a', 50)]))
    const first = await service.analyze('pvp', 7)
    expect(await service.analyze('pvp', 7)).toBe(first)
    expect(load).toHaveBeenCalledTimes(1)
    await service.analyze('pvp', 14)
    expect(load).toHaveBeenCalledTimes(2)
    c.advance(15 * MIN)
    await recorder.record(dataset([item('a', 50)]))
    expect((await service.analyze('pvp', 14)).coverage.snapshots).toBe(2)
  })

  it('reports empty coverage before anything is recorded', async () => {
    const service = createTrendService({
      recorder: createPriceRecorder({ dir: await tempDir() }),
      fetchFn: mockFetch({}),
      getDataset: () => null
    })
    expect((await service.analyze('pve', 7)).coverage).toEqual({
      snapshots: 0,
      days: 0,
      firstAt: null,
      lastAt: null,
      snapshotsByHour: Array(24).fill(0),
      items: 0,
      // Without tarkov.dev's history, only the app's own recordings.
      sources: [{ id: 'local', items: 0, days: 0, byHour: Array(24).fill(0), lastAt: null, error: null }]
    })
  })

  it("serves one item's daily history from tarkov.dev for the last 60 days", async () => {
    const { recorder, now } = await recorded(3)
    const fetchFn = mockFetch({
      tarkovDevJson: (url) => {
        expect(url).toBe('https://json.tarkov.dev/regular/prices/a')
        return jsonResponse({
          data: [
            { timestamp: NOW - 90 * DAY, price: 1, priceMin: 1 },
            { timestamp: NOW - DAY, price: 10_500, priceMin: 9_000, offerCount: 70 }
          ]
        })
      }
    })
    const service = createTrendService({ recorder, now, ...utc, fetchFn, getDataset: () => null })
    const series = await service.series('pvp', 'a')
    expect(series.daily).toEqual([{ t: NOW - DAY, price: 10_500, priceMin: 9_000, offers: 70 }])
    expect(series.dailyError).toBeNull()
  })

  it('reports a failed daily history instead of throwing', async () => {
    const { recorder, now } = await recorded(1)
    const fetchFn = mockFetch({ tarkovDevJson: () => jsonResponse({ errors: ['nope'] }, 503) })
    const service = createTrendService({ recorder, now, ...utc, fetchFn, getDataset: () => null })
    const series = await service.series('pve', 'a')
    expect(series.daily).toEqual([])
    expect(series.dailyError).toMatch(/503/)
  })
})
