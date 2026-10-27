import { useMemo } from 'react'
import { allocateHave, coveredOf, haveDemands, levelKey, questKey } from '../../../shared/allocate'
import { EMPTY_HIDEOUT, haveTotals } from '../../../shared/hideout'
import { neededItems } from '../../../shared/questProgress'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import type { PublicSettings } from '../../../shared/types'
import { useStore } from '../store'
import { useQuestRows } from './useQuestRows'

/** What the shared Have gives each need: a hideout level's part, or a quest's hand-over. */
export interface HaveShare {
  level(stationId: string, level: number, itemId: string, foundInRaid: boolean): number
  quest(questId: string, itemId: string, foundInRaid: boolean): number
}

/**
 * One shared Have count for the game mode played (since 1.66.0): what's put aside, split across the
 * hideout's levels (those in the Items to collect scope first), the active quests, the later levels and
 * the other quests left, so two needs never count the same copies.
 */
export function useHaveShare(current: PublicSettings | null): HaveShare {
  const settings = current ?? DEFAULT_SETTINGS
  const { questState, rows, objectives } = useQuestRows(current)
  const progress = useStore((s) => s.hideoutProgress[settings.gameMode]) ?? EMPTY_HIDEOUT
  const stations = questState?.dataset?.stations
  const scope = settings.hideout.scope
  return useMemo(() => {
    const left = rows.filter((r) => r.status !== 'completed' && r.status !== 'failed')
    const active = neededItems(
      left.filter((r) => r.status === 'active').map((r) => r.quest),
      objectives
    ).items
    const others = neededItems(
      left.filter((r) => r.status !== 'active').map((r) => r.quest),
      objectives
    ).items
    const share = allocateHave(progress, haveDemands(stations ?? [], progress, scope, active, others))
    return {
      level: (stationId, level, itemId, fir) => coveredOf(share, levelKey(stationId, level, itemId, fir)),
      quest: (questId, itemId, fir) => coveredOf(share, questKey(questId, itemId, fir))
    }
  }, [rows, objectives, progress, stations, scope])
}

/** Every item's count put aside, both kinds together (for what doesn't care which). */
export function useHaveTotals(current: PublicSettings | null): Readonly<Record<string, number>> {
  const settings = current ?? DEFAULT_SETTINGS
  const progress = useStore((s) => s.hideoutProgress[settings.gameMode]) ?? EMPTY_HIDEOUT
  return useMemo(() => haveTotals(progress), [progress])
}
