import { join } from 'node:path'
import { MAP_POOL_TTL_MS, LARGE_REQUEST_TIMEOUT_MS } from '../../shared/constants'
import { TARKOV_DEV_GAME_MODE } from '../../shared/gameModes'
import type { DataMode, MapPool, MapPoolsResult } from '../../shared/types'
import { readJsonFile, writeJsonFileAtomic } from '../jsonFile'
import { errorMessage, tarkovDevQuery, type FetchFn } from './http'
import { fetchJsonData, translator, values, type Collection } from './tarkovDevJson'

export const MAP_LOOT_QUERY = `query MapLoot($gameMode: GameMode) {
  maps(gameMode: $gameMode) {
    id
    name
    lootLoose { items { id } }
  }
}`

export interface TarkovDevMap {
  id: string | undefined
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

export interface JsonMap {
  id: string
  name?: string | null
  lootLoose?: ({ items?: string[] | null } | null)[] | null
}

/** json.tarkov.dev stores maps keyed by id, with translation-key names and bare item ids. */
export function mapPoolsFromJson(maps: Collection<JsonMap> | null | undefined, lang: Record<string, string>) {
  const text = translator(lang)
  return reduceMapLoot(
    values(maps).map((map) => ({
      id: map?.id,
      name: text(map?.name) ?? '',
      lootLoose: (map?.lootLoose ?? []).map((spawn) => ({
        items: (spawn?.items ?? []).map((id) => ({ id }))
      }))
    }))
  )
}

export async function fetchJsonPools(fetchFn: FetchFn, dataMode: DataMode): Promise<MapPool[]> {
  const [data, lang] = await Promise.all([
    fetchJsonData<{ maps?: Collection<JsonMap> | null }>(fetchFn, dataMode, 'maps'),
    fetchJsonData<Record<string, string>>(fetchFn, dataMode, 'maps_en')
  ])
  return mapPoolsFromJson(data.maps, lang)
}

async function fetchGraphqlPools(fetchFn: FetchFn, dataMode: DataMode): Promise<MapPool[]> {
  const data = await tarkovDevQuery<{ maps: (TarkovDevMap | null)[] | null }>(
    fetchFn,
    MAP_LOOT_QUERY,
    { gameMode: TARKOV_DEV_GAME_MODE[dataMode] },
    LARGE_REQUEST_TIMEOUT_MS
  )
  return reduceMapLoot(data.maps ?? [])
}

/** json.tarkov.dev first, then the GraphQL API. */
export async function fetchMapPools(fetchFn: FetchFn, dataMode: DataMode): Promise<MapPool[]> {
  const errors: string[] = []
  const sources: [string, typeof fetchJsonPools][] = [
    ['json.tarkov.dev', fetchJsonPools],
    ['api.tarkov.dev', fetchGraphqlPools]
  ]
  for (const [label, load] of sources) {
    try {
      const pools = await load(fetchFn, dataMode)
      if (pools.length > 0) return pools
      errors.push(`${label}: no map loot data`)
    } catch (err) {
      errors.push(`${label}: ${errorMessage(err)}`)
    }
  }
  throw new Error(errors.join(' · '))
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
      const fresh: MapPoolCache = { fetchedAt: now(), pools: await fetchMapPools(deps.fetchFn, dataMode) }
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
