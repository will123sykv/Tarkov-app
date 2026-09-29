import { useEffect, useMemo } from 'react'
import { dataModeFor } from '../../../shared/gameModes'
import { forFaction, questStatus, type QuestContext, type QuestStatus } from '../../../shared/questProgress'
import type { GameMap, Quest, QuestDataState } from '../../../shared/questTypes'
import type { PublicSettings } from '../../../shared/types'
import { useStore } from '../store'

export interface QuestRow {
  quest: Quest
  status: QuestStatus
}

export interface QuestRows {
  questState: QuestDataState | undefined
  /** Every quest for the player's faction, with its status. */
  rows: QuestRow[]
  ctx: QuestContext
  questsById: ReadonlyMap<string, Quest>
  mapsById: ReadonlyMap<string, GameMap>
}

/** Loads quest data and progress for the current game mode, and works out each quest's status. */
export function useQuestRows(settings: PublicSettings): QuestRows {
  const dataMode = dataModeFor(settings.gameMode)
  const questState = useStore((s) => s.questData[dataMode])
  const progress = useStore((s) => s.questProgress[settings.gameMode])
  const loadQuestData = useStore((s) => s.loadQuestData)
  const loadPlayerData = useStore((s) => s.loadPlayerData)

  useEffect(() => {
    void loadQuestData()
  }, [loadQuestData, dataMode])
  useEffect(() => {
    void loadPlayerData()
  }, [loadPlayerData, settings.gameMode])

  const dataset = questState?.dataset ?? null
  const level = settings.playerLevels[settings.gameMode]
  const faction = settings.quests.faction
  const ctx = useMemo<QuestContext>(() => ({ playerLevel: level, faction }), [level, faction])
  const questsById = useMemo(() => new Map((dataset?.quests ?? []).map((q) => [q.id, q])), [dataset])
  const mapsById = useMemo(() => new Map((dataset?.maps ?? []).map((m) => [m.id, m])), [dataset])
  const rows = useMemo<QuestRow[]>(
    () =>
      (dataset?.quests ?? [])
        .filter((q) => forFaction(q, ctx.faction))
        .map((q) => ({ quest: q, status: questStatus(q, progress ?? {}, ctx, questsById) })),
    [dataset, progress, ctx, questsById]
  )
  return { questState, rows, ctx, questsById, mapsById }
}
