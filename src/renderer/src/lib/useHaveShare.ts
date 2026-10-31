import { useMemo } from 'react'
import {
  allocateHave,
  coveredOf,
  haveDemands,
  levelKey,
  parseKey,
  questKey,
  whereCopiesWent
} from '../../../shared/allocate'
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
  /** The other needs holding copies of a level's part, by name (since 1.72.0): "Bitcoin farm 1". */
  elsewhere(
    stationId: string,
    level: number,
    itemId: string,
    foundInRaid: boolean
  ): { name: string; count: number }[]
}

/**
 * One shared Have count for the game mode played (since 1.66.0): what's put aside, split across the
 * hideout's levels (those in the Items to collect scope first), the active quests, the later levels and
 * the other quests left, so two needs never count the same copies.
 */
export function useHaveShare(current: PublicSettings | null): HaveShare {
  const settings = current ?? DEFAULT_SETTINGS
  const { questState, rows, objectives, questsById } = useQuestRows(current)
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
    const stationNames = new Map((stations ?? []).map((s) => [s.id, s.name]))
    const name = (key: string): string => {
      const k = parseKey(key)
      if (k?.kind === 'level') return `${stationNames.get(k.stationId) ?? 'Another station'} ${k.level}`
      return (k && questsById.get(k.questId)?.name) ?? 'A quest'
    }
    return {
      level: (stationId, level, itemId, fir) => coveredOf(share, levelKey(stationId, level, itemId, fir)),
      quest: (questId, itemId, fir) => coveredOf(share, questKey(questId, itemId, fir)),
      elsewhere: (stationId, level, itemId, fir) => {
        const own = levelKey(stationId, level, itemId, fir)
        return whereCopiesWent(share, itemId)
          .filter((w) => w.key !== own)
          .map((w) => ({ name: name(w.key), count: w.count }))
      }
    }
  }, [rows, objectives, progress, stations, scope, questsById])
}

/** Every item's count put aside, both kinds together (for what doesn't care which). */
export function useHaveTotals(current: PublicSettings | null): Readonly<Record<string, number>> {
  const settings = current ?? DEFAULT_SETTINGS
  const progress = useStore((s) => s.hideoutProgress[settings.gameMode]) ?? EMPTY_HIDEOUT
  return useMemo(() => haveTotals(progress), [progress])
}
