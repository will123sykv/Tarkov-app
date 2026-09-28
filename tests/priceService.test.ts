import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createPriceService } from '../src/main/pricing/priceService'
import { fixture, jsonResponse, mockFetch, tempDir } from './helpers'

const devResponse = fixture('tarkovdev-prices.json')
const marketResponse = fixture('tarkovmarket-items.json')

async function setup(options: { apiKey?: string | null; dev?: 'ok' | 'fail'; market?: 'ok' | 'fail' }) {
  const cacheDir = await tempDir()
  let clock = 1_000
  let dev = options.dev ?? 'ok'
  const fetchFn = mockFetch({
    tarkovDev: () => (dev === 'ok' ? jsonResponse(devResponse) : jsonResponse({}, 503)),
    tarkovMarket: () => (options.market === 'fail' ? jsonResponse({}, 429) : jsonResponse(marketResponse))
  })
  const service = createPriceService({
    fetchFn,
    cacheDir,
    getTarkovMarketKey: () => options.apiKey ?? null,
    now: () => clock
  })
  return {
    service,
    fetchFn,
    cacheDir,
    setDev: (next: 'ok' | 'fail') => (dev = next),
    tick: (ms: number) => (clock += ms)
  }
}

describe('price service', () => {
  it('fetches from tarkov.dev and caches the result', async () => {
    const { service } = await setup({})
    const result = await service.fetchFresh('pvp')
    expect(result).toMatchObject({ fromCache: false, error: null })
    expect(result.dataset?.source).toBe('tarkov.dev')
    expect((await service.loadCached('pvp'))?.items).toHaveLength(7)
    expect(await service.loadCached('pve')).toBeNull()
  })

  it('falls back to tarkov-market when tarkov.dev fails and a key is set', async () => {
    const { service, setDev, tick } = await setup({ apiKey: 'key' })
    await service.fetchFresh('pvp')
    setDev('fail')
    tick(60_000)
    const result = await service.fetchFresh('pvp')
    expect(result.fromCache).toBe(false)
    expect(result.error).toBe('tarkov.dev: HTTP 503')
    expect(result.dataset).toMatchObject({ source: 'tarkov-market', fetchedAt: 61_000 })
    // Static data carried over from the cached tarkov.dev dataset.
    expect(result.dataset?.items.find((i) => i.shortName === 'GPU')?.width).toBe(2)
    expect((await service.loadCached('pvp'))?.source).toBe('tarkov-market')
  })

  it('skips tarkov-market without a key and serves the cache', async () => {
    const { service, fetchFn, setDev } = await setup({})
    await service.fetchFresh('pve')
    setDev('fail')
    const result = await service.fetchFresh('pve')
    expect(fetchFn.mock.calls.every(([url]) => url.startsWith('https://api.tarkov.dev/'))).toBe(true)
    expect(result).toMatchObject({ fromCache: true, error: 'tarkov.dev: HTTP 503' })
    expect(result.dataset?.source).toBe('tarkov.dev')
  })

  it('reports every failure when nothing is available', async () => {
    const { service } = await setup({ dev: 'fail', apiKey: 'key', market: 'fail' })
    const result = await service.fetchFresh('pvp')
    expect(result).toEqual({
      dataset: null,
      fromCache: false,
      error: 'tarkov.dev: HTTP 503 · tarkov-market: HTTP 429'
    })
  })

  it('ignores corrupt or mismatched cache files', async () => {
    const { service, cacheDir } = await setup({})
    await writeFile(join(cacheDir, 'prices-pvp.json'), '{not json')
    expect(await service.loadCached('pvp')).toBeNull()
    await writeFile(
      join(cacheDir, 'prices-pve.json'),
      JSON.stringify({ dataMode: 'pvp', fetchedAt: 1, fleaMinLevel: 15, items: [] })
    )
    expect(await service.loadCached('pve')).toBeNull()
  })
})
