import { useMemo } from 'react'
import {
  EMPTY_FAVOURITES,
  favouriteNeeds,
  type FavouriteNeed,
  type Favourites
} from '../../../shared/favourites'
import { EMPTY_HIDEOUT, getBackNow, hideoutNeeds } from '../../../shared/hideout'
import { neededItems } from '../../../shared/questProgress'
import type { PriceState, PublicSettings } from '../../../shared/types'
import { useStore } from '../store'
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
