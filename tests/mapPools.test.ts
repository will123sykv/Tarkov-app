import { describe, expect, it } from 'vitest'
import { createMapPoolService, reduceMapLoot, type TarkovDevMap } from '../src/main/pricing/mapPools'
import { MAP_POOL_TTL_MS } from '../src/shared/constants'
import { fixture, jsonResponse, mockFetch, requestBody, tempDir } from './helpers'

const mapsResponse = fixture<{ data: { maps: (TarkovDevMap | null)[] } }>('tarkovdev-maps.json')

describe('map pools', () => {
  it('reduces loose loot to unique item ids per map', () => {
    const pools = reduceMapLoot(mapsResponse.data.maps)
    expect(pools.map((p) => p.name)).toEqual(['Customs', 'The Lab'])
    expect(pools[0].itemIds).toEqual(['57347ca924597744596b4e71', '5448ba0b4bdc2d02308b456c'])
  })

  it('caches for a day, then refetches and falls back to stale data on failure', async () => {
    let clock = 0
    let fail = false
    const fetchFn = mockFetch({
      tarkovDev: () => (fail ? jsonResponse({}, 500) : jsonResponse(mapsResponse))
    })
    const cacheDir = await tempDir()
    const service = createMapPoolService({ fetchFn, cacheDir, now: () => clock })

    const first = await service.getPools('pve')
    expect(first).toMatchObject({ fetchedAt: 0, error: null })
    expect(requestBody(fetchFn.mock.calls[0][1]).variables).toEqual({ gameMode: 'pve' })

    clock = MAP_POOL_TTL_MS - 1
    await service.getPools('pve')
    expect(fetchFn).toHaveBeenCalledTimes(1)

    // A new service (fresh app start) reads the file cache.
    const restarted = createMapPoolService({ fetchFn, cacheDir, now: () => clock })
    expect((await restarted.getPools('pve')).pools).toHaveLength(2)
    expect(fetchFn).toHaveBeenCalledTimes(1)

    clock = MAP_POOL_TTL_MS + 1
    fail = true
    const stale = await service.getPools('pve')
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(stale).toMatchObject({ fetchedAt: 0, error: 'Map loot: HTTP 500' })
    expect(stale.pools).toHaveLength(2)

    fail = false
    expect(await service.getPools('pve', true)).toMatchObject({ fetchedAt: MAP_POOL_TTL_MS + 1, error: null })
  })
})
