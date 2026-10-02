import { useMemo } from 'react'
import { DEFAULT_FLEA_MIN_LEVEL } from '../../../shared/constants'
import {
  EMPTY_HIDEOUT,
  hideoutNeeds,
  keepList,
  type BuyContext,
  type KeepInfo
} from '../../../shared/hideout'
import { neededItems } from '../../../shared/questProgress'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import type { PriceState, PublicSettings } from '../../../shared/types'
import { useStore } from '../store'
import { useItemLookup } from './useItemLookup'
import { useQuestRows } from './useQuestRows'

/** What the player can buy: their level, the flea's unlock level, trader loyalty and finished quests. */
export function useBuyContext(current: PublicSettings | null, priceState: PriceState | null): BuyContext {
  const settings = current ?? DEFAULT_SETTINGS
  const { questState } = useQuestRows(current)
  const progress = useStore((s) => s.questProgress[settings.gameMode])
  const traders = useStore((s) => s.hideoutProgress[settings.gameMode]?.traders) ?? EMPTY_HIDEOUT.traders
  const playerLevel = settings.playerLevels[settings.gameMode]
  const fleaMinLevel = priceState?.dataset?.fleaMinLevel ?? DEFAULT_FLEA_MIN_LEVEL
  const quests = questState?.dataset?.quests
  return useMemo(
    () => ({
      playerLevel,
      fleaMinLevel,
      traderLevels: traders,
      completedQuests: new Set(
        Object.entries(progress ?? {})
          .filter(([, entry]) => entry.status === 'completed')
          .map(([id]) => id)
      ),
      questNames: new Map((quests ?? []).map((q) => [q.id, q.name]))
    }),
    [playerLevel, fleaMinLevel, traders, progress, quests]
  )
}

/** Items not to sell: what the hideout (in the Hideout tab's scope) and active quests still need. */
export function useKeepList(
  current: PublicSettings | null,
  priceState: PriceState | null
): ReadonlyMap<string, KeepInfo> {
  const settings = current ?? DEFAULT_SETTINGS
  const { questState, rows } = useQuestRows(current)
  const progress = useStore((s) => s.hideoutProgress[settings.gameMode]) ?? EMPTY_HIDEOUT
  const objectives = useStore((s) => s.objectiveProgress[settings.gameMode])
  const items = useItemLookup(priceState)
  const ctx = useBuyContext(current, priceState)
  const scope = settings.hideout.scope
  const stations = questState?.dataset?.stations
  return useMemo(() => {
    const hideout = hideoutNeeds(stations ?? [], progress, scope)
    const quests = neededItems(
      rows.filter((r) => r.status === 'active').map((r) => r.quest),
      objectives
    ).items
    return keepList(hideout, quests, items, ctx)
  }, [stations, progress, scope, rows, items, ctx, objectives])
}
