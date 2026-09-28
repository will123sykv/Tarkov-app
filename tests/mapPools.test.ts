import { describe, expect, it } from 'vitest'
import {
  createMapPoolService,
  mapPoolsFromJson,
  reduceMapLoot,
  type JsonMap,
  type TarkovDevMap
} from '../src/main/pricing/mapPools'
import { MAP_POOL_TTL_MS } from '../src/shared/constants'
import { fixture, jsonFixtureRoute, jsonResponse, mockFetch, requestBody, tempDir } from './helpers'

const graphqlMaps = fixture<{ data: { maps: (TarkovDevMap | null)[] } }>('tarkovdev-maps.json')

describe('map pools', () => {
  it('reduces loose loot to unique item ids per map', () => {
    const pools = reduceMapLoot(graphqlMaps.data.maps)
    expect(pools.map((p) => p.name)).toEqual(['Customs', 'The Lab'])
    expect(pools[0].itemIds).toEqual(['57347ca924597744596b4e71', '5448ba0b4bdc2d02308b456c'])
  })

  it('reads the json.tarkov.dev map dump the same way', () => {
    const pools = mapPoolsFromJson(
      fixture<{ data: { maps: Record<string, JsonMap> } }>('json-maps.json').data.maps,
      fixture<{ data: Record<string, string> }>('json-maps_en.json').data
    )
    expect(pools).toEqual(reduceMapLoot(graphqlMaps.data.maps))
  })

  it('caches for a day, then refetches and falls back to stale data on failure', async () => {
    let clock = 0
    let fail = false
    const fetchFn = mockFetch({
      tarkovDevJson: (url) => (fail ? jsonResponse({}, 503) : jsonFixtureRoute(url)),
      tarkovDev: () => jsonResponse({}, 422)
    })
    const cacheDir = await tempDir()
    const service = createMapPoolService({ fetchFn, cacheDir, now: () => clock })

    const first = await service.getPools('pve')
    expect(first).toMatchObject({ fetchedAt: 0, error: null })
    expect(first.pools.map((p) => p.name)).toEqual(['Customs', 'The Lab'])
    expect(fetchFn.mock.calls.map(([url]) => url).sort()).toEqual([
      'https://json.tarkov.dev/pve/maps',
      'https://json.tarkov.dev/pve/maps_en'
    ])

    clock = MAP_POOL_TTL_MS - 1
    await service.getPools('pve')
    expect(fetchFn).toHaveBeenCalledTimes(2)

    // A new service (fresh app start) reads the file cache.
    const restarted = createMapPoolService({ fetchFn, cacheDir, now: () => clock })
    expect((await restarted.getPools('pve')).pools).toHaveLength(2)
    expect(fetchFn).toHaveBeenCalledTimes(2)

    clock = MAP_POOL_TTL_MS + 1
    fail = true
    const stale = await service.getPools('pve')
    expect(stale).toMatchObject({
      fetchedAt: 0,
      error: 'Map loot: json.tarkov.dev: HTTP 503 · api.tarkov.dev: HTTP 422'
    })
    expect(stale.pools).toHaveLength(2)

    fail = false
    expect(await service.getPools('pve', true)).toMatchObject({ fetchedAt: MAP_POOL_TTL_MS + 1, error: null })
  })

  it('falls back to the GraphQL API for map loot', async () => {
    const fetchFn = mockFetch({
      tarkovDevJson: () => jsonResponse({}, 503),
      tarkovDev: () => jsonResponse(graphqlMaps)
    })
    const service = createMapPoolService({ fetchFn, cacheDir: await tempDir() })
    const result = await service.getPools('pvp')
    expect(result.error).toBeNull()
    expect(result.pools).toHaveLength(2)
    const graphqlCall = fetchFn.mock.calls.find(([url]) => url.startsWith('https://api.tarkov.dev/'))!
    expect(requestBody(graphqlCall[1]).variables).toEqual({ gameMode: 'regular' })
  })
})
