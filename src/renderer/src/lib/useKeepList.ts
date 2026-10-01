import { useMemo } from 'react'
import { EMPTY_HIDEOUT, hideoutNeeds, keepList, type KeepInfo } from '../../../shared/hideout'
import { neededItems } from '../../../shared/questProgress'
import type { PriceState, PublicSettings } from '../../../shared/types'
import { useStore } from '../store'
import { useItemLookup } from './useItemLookup'
import { useQuestRows } from './useQuestRows'

/** Items not to sell: what the hideout (in the Hideout tab's scope) and active quests still need. */
export function useKeepList(
  settings: PublicSettings,
  priceState: PriceState | null
): ReadonlyMap<string, KeepInfo> {
  const { questState, rows } = useQuestRows(settings)
  const progress = useStore((s) => s.hideoutProgress[settings.gameMode]) ?? EMPTY_HIDEOUT
  const items = useItemLookup(priceState)
  const scope = settings.hideout.scope
  const stations = questState?.dataset?.stations
  return useMemo(() => {
    const hideout = hideoutNeeds(stations ?? [], progress, scope)
    const quests = neededItems(rows.filter((r) => r.status === 'active').map((r) => r.quest)).items
    return keepList(hideout, quests, items)
  }, [stations, progress, scope, rows, items])
}
