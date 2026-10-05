import type { RaidRecord } from './logTypes'
import { objectiveTarget, satisfies, type ObjectiveProgress, type QuestProgress } from './questProgress'
import type { Quest, QuestObjective } from './questTypes'

// Objectives the app can tick off by itself, from what it already knows: the player's level (set in
// Settings), their loyalty levels (set in the Items to collect tab), other quests' progress, and for story steps
// like "visit Customs 3 times", the raids in the game's logs. The logs say nothing else about objectives.

export interface DetectionContext {
  playerLevel: number
  /** Loyalty level per trader id; a trader not in here is at level 1. */
  traderLevels: Readonly<Record<string, number>>
  progress: QuestProgress
  /** Raids read from the logs. */
  raids: readonly RaidRecord[]
  /** The map ids a raid on a location (as the logs write it, e.g. `bigmap`) counts for. */
  raidMaps: (location: string) => readonly string[]
  traderName: (id: string) => string | undefined
  questName: (id: string) => string | undefined
  mapName: (id: string) => string | undefined
}

/** How far along an objective is by what the app knows, and how it knows. */
export interface Detected {
  value: number
  why: string
}

/** Quest id → objective id → what was detected (only objectives with some progress). */
export type DetectedProgress = Record<string, Record<string, Detected>>

const STATUS_WORD = { completed: 'finished', active: 'started', failed: 'failed' } as const

function detect(quest: Quest, objective: QuestObjective, ctx: DetectionContext): Detected | null {
  if (objective.playerLevel !== null && objective.playerLevel !== undefined) {
    return ctx.playerLevel >= objective.playerLevel
      ? { value: 1, why: `Your level is ${ctx.playerLevel} (set in Settings)` }
      : null
  }
  if (objective.traderLevel) {
    const { traderId, level } = objective.traderLevel
    const yours = ctx.traderLevels[traderId] ?? 1
    return yours >= level
      ? {
          value: 1,
          why: `You're LL${yours} with ${ctx.traderName(traderId) ?? 'the trader'} (set in the Items to collect tab)`
        }
      : null
  }
  if (objective.questStatus) {
    const { questId, status } = objective.questStatus
    const entry = ctx.progress[questId]
    if (!entry || !satisfies(entry, status)) return null
    return { value: 1, why: `${ctx.questName(questId) ?? 'That quest'} is ${STATUS_WORD[entry.status]}` }
  }
  if (objective.visits && objective.maps.length) {
    // Raids from when the chapter started (as the logs or a click recorded it), not as a scav.
    const start = ctx.progress[quest.id]
    if (start?.status !== 'active') return null
    const maps = new Set(objective.maps)
    const n = ctx.raids.filter(
      (r) =>
        r.side !== 'scav' &&
        r.startedAt !== null &&
        r.startedAt >= start.at &&
        ctx.raidMaps(r.map).some((id) => maps.has(id))
    ).length
    if (!n) return null
    const where = objective.maps.map((id) => ctx.mapName(id) ?? 'the map').join(' or ')
    return {
      value: Math.min(objectiveTarget(objective), n),
      why: `${n} raid${n === 1 ? '' : 's'} on ${where} since you started ${quest.name} (from the game's logs)`
    }
  }
  return null
}

/** What the app can tell of each quest's objectives by itself (finished quests are left out). */
export function detectObjectives(quests: readonly Quest[], ctx: DetectionContext): DetectedProgress {
  const result: DetectedProgress = {}
  for (const quest of quests) {
    if (ctx.progress[quest.id]?.status === 'completed') continue
    for (const objective of quest.objectives) {
      const found = detect(quest, objective, ctx)
      if (found) (result[quest.id] ??= {})[objective.id] = found
    }
  }
  return result
}

/** The player's ticks with what was detected: whichever is further along. */
export function withDetected(
  ticked: ObjectiveProgress | undefined,
  detected: DetectedProgress
): ObjectiveProgress {
  const result: ObjectiveProgress = { ...ticked }
  for (const [questId, objectives] of Object.entries(detected)) {
    const quest = { ...result[questId] }
    for (const [objectiveId, { value }] of Object.entries(objectives))
      quest[objectiveId] = Math.max(quest[objectiveId] ?? 0, value)
    result[questId] = quest
  }
  return result
}
