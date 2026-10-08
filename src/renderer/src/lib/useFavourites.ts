import { useEffect, useMemo } from 'react'
import {
  EMPTY_FAVOURITES,
  favouriteNeeds,
  type FavouriteNeed,
  type Favourites
} from '../../../shared/favourites'
import { EMPTY_HIDEOUT, getBackNow, hideoutNeeds } from '../../../shared/hideout'
import { neededItems } from '../../../shared/questProgress'
import type { GameMap } from '../../../shared/questTypes'
import type { PriceState, PublicSettings } from '../../../shared/types'
import { containerMapId, findScore, whereToFind, type WhereToFind } from '../../../shared/whereToFind'
import { containerLootKey, loadContainerLoot, useStore } from '../store'
import { configFor } from './questUi'
import { useItemLookup } from './useItemLookup'
import { useBuyContext, useCraftContext } from './useKeepList'
import { useQuestRows } from './useQuestRows'

/** What's starred in the current game mode. */
export function useFavourites(settings: PublicSettings): Favourites {
  return useStore((s) => s.favourites[settings.gameMode]) ?? EMPTY_FAVOURITES
}

/** What the starred items, upgrades and quests still need that's worth looking for in raid. */
export function useFavouriteNeeds(settings: PublicSettings, priceState: PriceState | null): FavouriteNeed[] {
  const favourites = useFavourites(settings)
  const { questState, rows, questsById, objectives } = useQuestRows(settings)
  const progress = useStore((s) => s.hideoutProgress[settings.gameMode]) ?? EMPTY_HIDEOUT
  const items = useItemLookup(priceState)
  const ctx = useBuyContext(settings, priceState)
  const cc = useCraftContext(settings, priceState)
  const stations = questState?.dataset?.stations
  return useMemo(() => {
    const finished = new Set(
      rows.filter((r) => r.status === 'completed' || r.status === 'failed').map((r) => r.quest.id)
    )
    const left = rows.filter((r) => !finished.has(r.quest.id)).map((r) => r.quest)
    const everything = new Map(
      hideoutNeeds(stations ?? [], progress, 'all', neededItems(left, objectives).items).map((n) => [
        n.itemId,
        n
      ])
    )
    return favouriteNeeds({
      favourites,
      everything,
      stations: stations ?? [],
      quests: questsById,
      finished: (id) => finished.has(id),
      objectives,
      progress,
      canGet: (itemId) => {
        const item = items.get(itemId)
        return item !== undefined && getBackNow(item, ctx, cc) !== null
      }
    })
  }, [favourites, rows, stations, progress, objectives, questsById, items, ctx, cc])
}

/** Where an item can be found on the map shown, and the map that gives clearly more chances, if any. */
export interface FindInfo {
  here: WhereToFind
  better: { key: string; name: string } | null
}

/** How many more chances another map must give to be suggested instead. */
const BETTER_BY = 1.5

/**
 * Where to look for items: on `map` (the map shown), and which other map gives more chances. Loads
 * the container tables for every map the first time.
 */
export function useWhereToFind(
  map: GameMap | null,
  allMaps: readonly GameMap[]
): (itemId: string) => FindInfo | null {
  const catalog = useStore((s) => s.containerCatalog)
  const containerLoot = useStore((s) => s.containerLoot)
  // One map per image (the main version: the Lab, not the Lab in the dark).
  const candidates = useMemo(() => {
    const byKey = new Map<string, GameMap>()
    for (const m of allMaps) {
      const config = configFor(m)
      if (!config) continue
      if (!byKey.has(config.key) || m.normalizedName === config.key) byKey.set(config.key, m)
    }
    return [...byKey.entries()].map(([key, m]) => ({ key, map: m }))
  }, [allMaps])
  useEffect(() => {
    for (const { map: m } of candidates) void loadContainerLoot(containerMapId(m))
  }, [candidates])
  return useMemo(() => {
    const cache = new Map<string, FindInfo | null>()
    const where = (itemId: string, m: GameMap): WhereToFind =>
      whereToFind(
        itemId,
        m,
        containerLoot[containerLootKey(containerMapId(m))] ?? [],
        catalog?.containers ?? []
      )
    return (itemId) => {
      if (!map) return null
      if (cache.has(itemId)) return cache.get(itemId)!
      const here = where(itemId, map)
      const score = findScore(here)
      let better: FindInfo['better'] = null
      let best = Math.max(1, score * BETTER_BY)
      for (const c of candidates) {
        if (c.map.id === map.id || configFor(c.map) === configFor(map)) continue
        const s = findScore(where(itemId, c.map))
        if (s > best) {
          best = s
          better = { key: c.key, name: c.map.name }
        }
      }
      const info = { here, better }
      cache.set(itemId, info)
      return info
    }
  }, [map, candidates, containerLoot, catalog])
}
