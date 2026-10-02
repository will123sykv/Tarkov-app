import { useEffect, useMemo } from 'react'
import { dataModeFor } from '../../../shared/gameModes'
import { forFaction, questStatus, type QuestContext, type QuestStatus } from '../../../shared/questProgress'
import type { GameMap, Quest, QuestDataState } from '../../../shared/questTypes'
import type { PublicSettings } from '../../../shared/types'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { storyQuests } from '../../../shared/storyQuests'
import { useStore } from '../store'

export interface QuestRow {
  quest: Quest
  status: QuestStatus
}

export interface QuestRows {
  questState: QuestDataState | undefined
  /** Every quest for the player's faction (and every story chapter), with its status. */
  rows: QuestRow[]
  ctx: QuestContext
  questsById: ReadonlyMap<string, Quest>
  mapsById: ReadonlyMap<string, GameMap>
}

/**
 * Loads quest data and progress for the current game mode, and works out each quest's status.
 * Before the settings load (null), it waits and returns nothing.
 */
export function useQuestRows(current: PublicSettings | null): QuestRows {
  const ready = current !== null
  const settings = current ?? DEFAULT_SETTINGS
  const dataMode = dataModeFor(settings.gameMode)
  const questState = useStore((s) => s.questData[dataMode])
  const priceItems = useStore((s) => s.prices[dataMode]?.dataset?.items)
  const progress = useStore((s) => s.questProgress[settings.gameMode])
  const loadQuestData = useStore((s) => s.loadQuestData)
  const loadPlayerData = useStore((s) => s.loadPlayerData)

  useEffect(() => {
    if (ready) void loadQuestData()
  }, [loadQuestData, dataMode, ready])
  useEffect(() => {
    if (ready) void loadPlayerData()
  }, [loadPlayerData, settings.gameMode, ready])

  const dataset = questState?.dataset ?? null
  const level = settings.playerLevels[settings.gameMode]
  const faction = settings.quests.faction
  const traders = useMemo(() => new Map((dataset?.traders ?? []).map((t) => [t.id, t])), [dataset])
  const ctx = useMemo<QuestContext>(
    () => ({ playerLevel: level, faction, traders }),
    [level, faction, traders]
  )
  // Story chapters' hand-overs name their items: match them to the price data's items.
  const itemIds = useMemo(
    () => new Map((priceItems ?? []).map((i) => [i.name.toLowerCase(), i.id])),
    [priceItems]
  )
  const quests = useMemo(
    () => [...(dataset?.quests ?? []), ...storyQuests(dataset?.storyChapters ?? [], itemIds)],
    [dataset, itemIds]
  )
  const questsById = useMemo(() => new Map(quests.map((q) => [q.id, q])), [quests])
  const mapsById = useMemo(() => new Map((dataset?.maps ?? []).map((m) => [m.id, m])), [dataset])
  const rows = useMemo<QuestRow[]>(
    () =>
      quests
        .filter((q) => forFaction(q, ctx.faction))
        .map((q) => ({ quest: q, status: questStatus(q, progress ?? {}, ctx, questsById) })),
    [quests, progress, ctx, questsById]
  )
  return { questState, rows, ctx, questsById, mapsById }
}
