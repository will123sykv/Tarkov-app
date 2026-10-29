import { useMemo } from 'react'
import { DEFAULT_FLEA_MIN_LEVEL } from '../../../shared/constants'
import { dataModeFor } from '../../../shared/gameModes'
import {
  EMPTY_HIDEOUT,
  hideoutNeeds,
  keepList,
  type BuyContext,
  type CraftContext,
  type KeepInfo
} from '../../../shared/hideout'
import { lockedTraders, neededItems } from '../../../shared/questProgress'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import type { PriceState, PublicSettings } from '../../../shared/types'
import type { ValuationContext } from '../../../shared/valuation'
import { useStore } from '../store'
import { useItemLookup } from './useItemLookup'
import { useHaveShare } from './useHaveShare'
import { useQuestRows } from './useQuestRows'

/** Traders not unlocked yet, by id, with the quests that unlock each (since 1.66.0). */
export function useLockedTraders(current: PublicSettings | null): ReadonlyMap<string, readonly string[]> {
  const settings = current ?? DEFAULT_SETTINGS
  // Straight from the store, so it's cheap to use anywhere.
  const quests = useStore((s) => s.questData[dataModeFor(settings.gameMode)]?.dataset?.quests)
  const progress = useStore((s) => s.questProgress[settings.gameMode])
  // What the player says over what their quests say (since 1.71.0).
  const overrides = useStore((s) => s.hideoutProgress[settings.gameMode]?.traderUnlocks)
  return useMemo(() => lockedTraders(quests ?? [], progress, overrides), [quests, progress, overrides])
}

/** How to value what the player sells: level, the flea, its fee and the traders unlocked. */
export function useValuation(
  current: PublicSettings | null,
  priceState: PriceState | null
): ValuationContext {
  const settings = current ?? DEFAULT_SETTINGS
  const locked = useLockedTraders(current)
  const playerLevel = settings.playerLevels[settings.gameMode]
  const fleaMinLevel = priceState?.dataset?.fleaMinLevel ?? DEFAULT_FLEA_MIN_LEVEL
  const subtractFleaFee = settings.subtractFleaFee
  return useMemo(
    () => ({ playerLevel, fleaMinLevel, subtractFleaFee, lockedTraders: locked }),
    [playerLevel, fleaMinLevel, subtractFleaFee, locked]
  )
}

/** What the player can buy: their level, the flea's unlock level, trader loyalty and finished quests. */
export function useBuyContext(current: PublicSettings | null, priceState: PriceState | null): BuyContext {
  const settings = current ?? DEFAULT_SETTINGS
  const { questState } = useQuestRows(current)
  const progress = useStore((s) => s.questProgress[settings.gameMode])
  const traders = useStore((s) => s.hideoutProgress[settings.gameMode]?.traders) ?? EMPTY_HIDEOUT.traders
  const playerLevel = settings.playerLevels[settings.gameMode]
  const fleaMinLevel = priceState?.dataset?.fleaMinLevel ?? DEFAULT_FLEA_MIN_LEVEL
  const quests = questState?.dataset?.quests
  const traderList = questState?.dataset?.traders
  const locked = useLockedTraders(current)
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
      questNames: new Map((quests ?? []).map((q) => [q.id, q.name])),
      traderNames: new Map((traderList ?? []).map((t) => [t.id, t.name])),
      lockedTraders: locked
    }),
    [playerLevel, fleaMinLevel, traders, progress, quests, traderList, locked]
  )
}

/** What the hideout's stations make, how far they're built, and prices: for crafting found-in-raid items. */
export function useCraftContext(current: PublicSettings | null, priceState: PriceState | null): CraftContext {
  const settings = current ?? DEFAULT_SETTINGS
  const { questState } = useQuestRows(current)
  const progress = useStore((s) => s.hideoutProgress[settings.gameMode]) ?? EMPTY_HIDEOUT
  const items = useItemLookup(priceState)
  const dataset = questState?.dataset
  return useMemo(
    () => ({
      crafts: dataset?.crafts ?? [],
      barters: dataset?.barters ?? [],
      stations: new Map((dataset?.stations ?? []).map((s) => [s.id, s])),
      progress,
      items
    }),
    [dataset, progress, items]
  )
}

/**
 * Items not to sell: what the hideout (in the Items to collect tab's scope) and active quests still need,
 * less what's put aside for them.
 */
export function useKeepList(
  current: PublicSettings | null,
  priceState: PriceState | null
): ReadonlyMap<string, KeepInfo> {
  const settings = current ?? DEFAULT_SETTINGS
  const { questState, rows, objectives } = useQuestRows(current)
  const progress = useStore((s) => s.hideoutProgress[settings.gameMode]) ?? EMPTY_HIDEOUT
  const items = useItemLookup(priceState)
  const ctx = useBuyContext(current, priceState)
  const share = useHaveShare(current)
  const scope = settings.hideout.scope
  const stations = questState?.dataset?.stations
  return useMemo(() => {
    const hideout = hideoutNeeds(stations ?? [], progress, scope)
    const quests = neededItems(
      rows.filter((r) => r.status === 'active').map((r) => r.quest),
      objectives
    ).items
    // Each quest's hand-over less the copies the shared Have gives it (the hideout's come first).
    return keepList(hideout, quests, items, ctx, {}, share.quest)
  }, [stations, progress, scope, rows, items, ctx, objectives, share])
}
