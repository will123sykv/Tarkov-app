import { join } from 'node:path'
import { MAP_POOL_TTL_MS, MAP_REQUEST_TIMEOUT_MS } from '../../shared/constants'
import { TARKOV_DEV_GAME_MODE } from '../../shared/gameModes'
import type { DataMode, MapPool, MapPoolsResult } from '../../shared/types'
import { readJsonFile, writeJsonFileAtomic } from '../jsonFile'
import { errorMessage, tarkovDevQuery, type FetchFn } from './http'

export const MAP_LOOT_QUERY = `query MapLoot($gameMode: GameMode) {
  maps(gameMode: $gameMode) {
    id
    name
    lootLoose { items { id } }
  }
}`

export interface TarkovDevMap {
  id: string
  name: string
  lootLoose: ({ items: ({ id: string } | null)[] | null } | null)[] | null
}

/** Collapse loose-loot spawn points into the set of item ids each map can spawn. */
export function reduceMapLoot(maps: (TarkovDevMap | null)[]): MapPool[] {
  const pools: MapPool[] = []
  for (const map of maps) {
    if (!map?.id || !map.name) continue
    const ids = new Set<string>()
    for (const spawn of map.lootLoose ?? []) {
      for (const item of spawn?.items ?? []) {
        if (item?.id) ids.add(item.id)
      }
    }
    if (ids.size > 0) pools.push({ id: map.id, name: map.name, itemIds: [...ids] })
  }
  return pools.sort((a, b) => a.name.localeCompare(b.name))
}

interface MapPoolCache {
  fetchedAt: number
  pools: MapPool[]
}

export interface MapPoolServiceDeps {
  fetchFn: FetchFn
  cacheDir: string
  now?: () => number
}

export function createMapPoolService(deps: MapPoolServiceDeps) {
  const now = deps.now ?? Date.now
  const memory = new Map<DataMode, MapPoolCache>()
  const inflight = new Map<DataMode, Promise<MapPoolsResult>>()
  const cachePath = (dataMode: DataMode): string => join(deps.cacheDir, `maps-${dataMode}.json`)

  async function loadCache(dataMode: DataMode): Promise<MapPoolCache | null> {
    const hit = memory.get(dataMode)
    if (hit) return hit
    const raw = (await readJsonFile(cachePath(dataMode))) as MapPoolCache | undefined
    if (!raw || typeof raw.fetchedAt !== 'number' || !Array.isArray(raw.pools)) return null
    memory.set(dataMode, raw)
    return raw
  }

  async function load(dataMode: DataMode, force: boolean): Promise<MapPoolsResult> {
    const cached = await loadCache(dataMode)
    if (cached && !force && now() - cached.fetchedAt < MAP_POOL_TTL_MS) {
      return { pools: cached.pools, fetchedAt: cached.fetchedAt, error: null }
    }
    try {
      const data = await tarkovDevQuery<{ maps: (TarkovDevMap | null)[] | null }>(
        deps.fetchFn,
        MAP_LOOT_QUERY,
        { gameMode: TARKOV_DEV_GAME_MODE[dataMode] },
        MAP_REQUEST_TIMEOUT_MS
      )
      const fresh: MapPoolCache = { fetchedAt: now(), pools: reduceMapLoot(data.maps ?? []) }
      if (fresh.pools.length === 0) throw new Error('no map loot data returned')
      memory.set(dataMode, fresh)
      await writeJsonFileAtomic(cachePath(dataMode), fresh).catch(() => {})
      return { pools: fresh.pools, fetchedAt: fresh.fetchedAt, error: null }
    } catch (err) {
      return {
        pools: cached?.pools ?? [],
        fetchedAt: cached?.fetchedAt ?? null,
        error: `Map loot: ${errorMessage(err)}`
      }
    }
  }

  return {
    getPools(dataMode: DataMode, force = false): Promise<MapPoolsResult> {
      const pending = inflight.get(dataMode)
      if (pending) return pending
      const p = load(dataMode, force).finally(() => inflight.delete(dataMode))
      inflight.set(dataMode, p)
      return p
    }
  }
}

export type MapPoolService = ReturnType<typeof createMapPoolService>
