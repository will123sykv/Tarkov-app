import type { Quest, QuestObjective, RequirementStatus } from './questTypes'

/** What the player did with a quest, from the logs or set by hand. */
export interface ProgressEntry {
  status: 'active' | 'completed' | 'failed'
  /** Epoch ms of the log event or the click. */
  at: number
  source: 'log' | 'manual'
}

/** Quest id → progress, for one game mode. Quests with no entry haven't been started. */
export type QuestProgress = Record<string, ProgressEntry>

export type QuestStatus = 'completed' | 'failed' | 'active' | 'available' | 'locked'

export interface QuestContext {
  playerLevel: number
  /** 'USEC', 'BEAR', or null to show quests for both. */
  faction: string | null
}

const satisfies = (entry: ProgressEntry | undefined, wanted: RequirementStatus[]): boolean =>
  (wanted.includes('complete') && entry?.status === 'completed') ||
  (wanted.includes('active') && (entry?.status === 'active' || entry?.status === 'completed')) ||
  (wanted.includes('failed') && entry?.status === 'failed')

/** Why a quest isn't available yet (empty when it is). */
export function lockReasons(
  quest: Quest,
  progress: QuestProgress,
  ctx: QuestContext,
  questsById: ReadonlyMap<string, Quest>
): string[] {
  const reasons: string[] = []
  if (ctx.playerLevel < quest.minPlayerLevel) reasons.push(`Needs level ${quest.minPlayerLevel}`)
  for (const req of quest.requires) {
    if (satisfies(progress[req.questId], req.status)) continue
    const name = questsById.get(req.questId)?.name ?? 'another quest'
    const how = req.status.includes('complete')
      ? 'completed'
      : req.status.includes('active')
        ? 'started'
        : 'failed'
    reasons.push(`Needs ${name} ${how}`)
  }
  return reasons
}

export function questStatus(
  quest: Quest,
  progress: QuestProgress,
  ctx: QuestContext,
  questsById: ReadonlyMap<string, Quest>
): QuestStatus {
  const entry = progress[quest.id]
  if (entry) return entry.status
  return lockReasons(quest, progress, ctx, questsById).length ? 'locked' : 'available'
}

/** Whether the quest is offered to the player's faction. */
export function forFaction(quest: Quest, faction: string | null): boolean {
  return !faction || quest.faction === 'Any' || quest.faction === faction
}

/**
 * Record a log event unless something newer is already known: a later click beats an older
 * event, and a later event (say, the quest was restarted) beats an older click.
 */
export function applyQuestEvent(
  progress: QuestProgress,
  questId: string,
  status: ProgressEntry['status'],
  at: number
): QuestProgress {
  const current = progress[questId]
  if (current && current.at > at) return progress
  return { ...progress, [questId]: { status, at, source: 'log' } }
}

/** Set (or with null, clear) a quest's status by hand. */
export function setQuestStatus(
  progress: QuestProgress,
  questId: string,
  status: ProgressEntry['status'] | null,
  at: number
): QuestProgress {
  const next = { ...progress }
  if (status) next[questId] = { status, at, source: 'manual' }
  else delete next[questId]
  return next
}

/**
 * Mark a quest completed along with everything that had to come before it, following the
 * prerequisites back to the start. Prerequisites that only needed to be failed are marked failed.
 * Quests already recorded as completed or failed keep their entry.
 */
export function markUpTo(
  progress: QuestProgress,
  questId: string,
  questsById: ReadonlyMap<string, Quest>,
  at: number
): QuestProgress {
  const next = { ...progress }
  const seen = new Set<string>()
  const visit = (id: string, status: 'completed' | 'failed'): void => {
    if (seen.has(id)) return
    seen.add(id)
    const existing = next[id]
    if (!existing || existing.status === 'active') next[id] = { status, at, source: 'manual' }
    for (const req of questsById.get(id)?.requires ?? []) {
      visit(
        req.questId,
        req.status.includes('failed') && !req.status.includes('complete') ? 'failed' : 'completed'
      )
    }
  }
  visit(questId, 'completed')
  return next
}

/** Drop what the logs said, keeping manual changes (before reading every log again). */
export function withoutLogEntries(progress: QuestProgress): QuestProgress {
  return Object.fromEntries(Object.entries(progress).filter(([, e]) => e.source === 'manual'))
}

export interface NeededItem {
  itemId: string
  count: number
  foundInRaid: boolean
  quests: { questId: string; name: string; count: number }[]
}

/** Objectives that consume items: hand-overs and plants. (Finding them is the same items again.) */
const CONSUMING = new Set(['giveItem', 'plantItem'])

/**
 * Items still to hand over or plant for the given quests. Only objectives that name a single item
 * add up per item; "any of these" objectives are listed separately.
 */
export function neededItems(quests: readonly Quest[]): {
  items: NeededItem[]
  anyOf: { quest: Quest; objective: QuestObjective }[]
} {
  const byKey = new Map<string, NeededItem>()
  const anyOf: { quest: Quest; objective: QuestObjective }[] = []
  for (const quest of quests) {
    for (const objective of quest.objectives) {
      if (!CONSUMING.has(objective.type) || !objective.items.length || objective.optional) continue
      if (objective.items.length > 1) {
        anyOf.push({ quest, objective })
        continue
      }
      const itemId = objective.items[0]
      const count = objective.count ?? 1
      const key = `${itemId}:${objective.foundInRaid}`
      const entry = byKey.get(key) ?? { itemId, count: 0, foundInRaid: objective.foundInRaid, quests: [] }
      entry.count += count
      entry.quests.push({ questId: quest.id, name: quest.name, count })
      byKey.set(key, entry)
    }
  }
  const items = [...byKey.values()].sort((a, b) => b.count - a.count || a.itemId.localeCompare(b.itemId))
  return { items, anyOf }
}

/** Map ids a quest involves: its main map plus every objective's. */
export function questMaps(quest: Quest): Set<string> {
  const maps = new Set<string>()
  if (quest.map) maps.add(quest.map)
  for (const o of quest.objectives) {
    for (const m of o.maps) maps.add(m)
    for (const z of o.zones) maps.add(z.map)
    for (const l of o.locations) maps.add(l.map)
  }
  return maps
}
