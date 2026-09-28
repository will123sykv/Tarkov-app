import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createPriceService } from '../src/main/pricing/priceService'
import { fixture, jsonFixtureRoute, jsonResponse, mockFetch, tempDir } from './helpers'

const graphqlResponse = fixture('tarkovdev-prices.json')
const marketResponse = fixture('tarkovmarket-items.json')

type Health = 'ok' | 'fail'

async function setup(options: { apiKey?: string | null; json?: Health; graphql?: Health; market?: Health }) {
  const cacheDir = await tempDir()
  let clock = 1_000
  const health = {
    json: options.json ?? 'ok',
    graphql: options.graphql ?? 'ok',
    market: options.market ?? 'ok'
  }
  const fetchFn = mockFetch({
    tarkovDevJson: (url) => (health.json === 'ok' ? jsonFixtureRoute(url) : jsonResponse({}, 503)),
    tarkovDev: () => (health.graphql === 'ok' ? jsonResponse(graphqlResponse) : jsonResponse({}, 422)),
    tarkovMarket: () => (health.market === 'ok' ? jsonResponse(marketResponse) : jsonResponse({}, 429))
  })
  const service = createPriceService({
    fetchFn,
    cacheDir,
    getTarkovMarketKey: () => options.apiKey ?? null,
    now: () => clock
  })
  const hosts = () => fetchFn.mock.calls.map(([url]) => new URL(url).host)
  return { service, fetchFn, cacheDir, health, hosts, tick: (ms: number) => (clock += ms) }
}

describe('price service', () => {
  it('fetches from json.tarkov.dev and caches the result', async () => {
    const { service, hosts } = await setup({})
    const result = await service.fetchFresh('pvp')
    expect(result).toMatchObject({ fromCache: false, error: null, dataset: { source: 'tarkov.dev' } })
    expect(new Set(hosts())).toEqual(new Set(['json.tarkov.dev']))
    expect((await service.loadCached('pvp'))?.items).toHaveLength(7)
    expect(await service.loadCached('pve')).toBeNull()
  })

  it('falls back to the GraphQL API when the JSON files fail', async () => {
    const { service } = await setup({ json: 'fail' })
    const result = await service.fetchFresh('pvp')
    expect(result.error).toBe('json.tarkov.dev: HTTP 503')
    expect(result).toMatchObject({ fromCache: false, dataset: { source: 'tarkov.dev' } })
    expect(result.dataset?.items.find((i) => i.shortName === 'LEDX')?.fleaFee).toBe(41_000)
  })

  it('falls back to tarkov-market when tarkov.dev fails and a key is set', async () => {
    const { service, health, tick } = await setup({ apiKey: 'key' })
    await service.fetchFresh('pvp')
    health.json = 'fail'
    health.graphql = 'fail'
    tick(60_000)
    const result = await service.fetchFresh('pvp')
    expect(result.fromCache).toBe(false)
    expect(result.error).toBe('json.tarkov.dev: HTTP 503 · api.tarkov.dev: HTTP 422')
    expect(result.dataset).toMatchObject({ source: 'tarkov-market', fetchedAt: 61_000 })
    // Static data carried over from the cached tarkov.dev dataset.
    expect(result.dataset?.items.find((i) => i.shortName === 'GPU')?.width).toBe(2)
    expect((await service.loadCached('pvp'))?.source).toBe('tarkov-market')
  })

  it('skips tarkov-market without a key and serves the cache', async () => {
    const { service, hosts, health } = await setup({})
    await service.fetchFresh('pve')
    health.json = 'fail'
    health.graphql = 'fail'
    const result = await service.fetchFresh('pve')
    expect(hosts()).not.toContain('api.tarkov-market.app')
    expect(result).toMatchObject({
      fromCache: true,
      error: 'json.tarkov.dev: HTTP 503 · api.tarkov.dev: HTTP 422',
      dataset: { source: 'tarkov.dev' }
    })
  })

  it('reports every failure when nothing is available', async () => {
    const { service } = await setup({ json: 'fail', graphql: 'fail', market: 'fail', apiKey: 'key' })
    expect(await service.fetchFresh('pvp')).toEqual({
      dataset: null,
      fromCache: false,
      error: 'json.tarkov.dev: HTTP 503 · api.tarkov.dev: HTTP 422 · tarkov-market: HTTP 429'
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
