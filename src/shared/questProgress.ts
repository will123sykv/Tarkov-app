import type { Quest, QuestObjective, QuestTrader, RequirementStatus } from './questTypes'

/** What the player did with a quest, from the logs or set by hand. */
export interface ProgressEntry {
  status: 'active' | 'completed' | 'failed'
  /** Epoch ms of the log event or the click. */
  at: number
  source: 'log' | 'manual'
}

/** Quest id → progress, for one game mode. Quests with no entry haven't been started. */
export type QuestProgress = Record<string, ProgressEntry>

/**
 * How far the player has got with each quest's objectives, set by hand (the game's logs don't say):
 * quest id → objective id → a count (items handed over, kills…), or 1 for one that's done.
 */
export type ObjectiveProgress = Record<string, Record<string, number>>

/** What finishing an objective takes: its count, or 1 for a one-off. */
export const objectiveTarget = (objective: Pick<QuestObjective, 'count'>): number =>
  Math.max(1, Math.round(objective.count ?? 1))

/** How far along one objective is; every objective of a completed quest is done. */
export function objectiveValue(
  objective: Pick<QuestObjective, 'id' | 'count'>,
  questId: string,
  objectives: ObjectiveProgress | undefined,
  completed = false
): number {
  if (completed) return objectiveTarget(objective)
  return Math.min(objectiveTarget(objective), Math.max(0, objectives?.[questId]?.[objective.id] ?? 0))
}

/** Set (or with 0, clear) how far along an objective is. */
export function setObjective(
  progress: ObjectiveProgress,
  questId: string,
  objectiveId: string,
  value: number
): ObjectiveProgress {
  const quest = { ...progress[questId] }
  const n = Math.max(0, Math.round(value))
  if (n > 0) quest[objectiveId] = n
  else delete quest[objectiveId]
  const next = { ...progress }
  if (Object.keys(quest).length) next[questId] = quest
  else delete next[questId]
  return next
}

/** One objective ticked off, and what the player had ticked before (to undo it). */
export interface TickChange {
  objectiveId: string
  value: number
  previous: number
}

/**
 * Ticking off a quest's objectives in one go (double-clicking its pin on the map): each one not yet
 * done (by `done`, the player's ticks with what the app worked out) goes to its target. `ticked` is the
 * player's own ticks, which an undo puts back.
 */
export function tickAll(
  objectives: readonly Pick<QuestObjective, 'id' | 'count'>[],
  questId: string,
  ticked: ObjectiveProgress | undefined,
  done: ObjectiveProgress | undefined = ticked
): TickChange[] {
  return objectives
    .filter((o) => objectiveValue(o, questId, done) < objectiveTarget(o))
    .map((o) => ({ objectiveId: o.id, value: objectiveTarget(o), previous: ticked?.[questId]?.[o.id] ?? 0 }))
}

/** The quest's required objectives, and how many of them are done. */
export function objectiveSummary(
  quest: Pick<Quest, 'id' | 'objectives'>,
  objectives: ObjectiveProgress | undefined,
  completed = false
): { done: number; total: number } {
  const required = quest.objectives.filter((o) => !o.optional)
  return {
    done: required.filter((o) => objectiveValue(o, quest.id, objectives, completed) >= objectiveTarget(o))
      .length,
    total: required.length
  }
}

export type QuestStatus = 'completed' | 'failed' | 'active' | 'available' | 'locked'

export interface QuestContext {
  playerLevel: number
  /** 'USEC', 'BEAR', or null to show quests for both. */
  faction: string | null
  /** Trader names and loyalty levels, by id. */
  traders?: ReadonlyMap<string, QuestTrader>
}

/** The player level a trader's loyalty level needs (0 when unknown). */
export function loyaltyPlayerLevel(
  traders: ReadonlyMap<string, QuestTrader> | undefined,
  traderId: string,
  level: number
): number {
  return traders?.get(traderId)?.levels.find((l) => l.level === level)?.playerLevel ?? 0
}

export interface LevelRequirement {
  /**
   * Whether `quest.minPlayerLevel` is the quest's own level requirement, the one the game shows.
   * tarkov.dev raises it to what the loyalty levels and earlier quests it needs require, and since
   * update 1.1 most quests are gated by loyalty level rather than by level.
   */
  own: boolean
  /** Where the level comes from when it isn't the quest's own. */
  gate: { kind: 'loyalty'; traderId: string; level: number } | { kind: 'quest'; questId: string } | null
}

/**
 * Tell a quest's own level requirement from one tarkov.dev inherits: its level is the highest of the
 * quest's own, the player level each loyalty level it needs requires, and each earlier quest's level
 * (with that quest's "reach loyalty level" objectives). When nothing inherited reaches it, it's the
 * quest's own.
 */
export function levelRequirement(
  quest: Quest,
  questsById: ReadonlyMap<string, Quest>,
  traders: ReadonlyMap<string, QuestTrader> | undefined
): LevelRequirement {
  let inherited = 0
  let gate: LevelRequirement['gate'] = null
  const consider = (level: number, from: NonNullable<LevelRequirement['gate']>): void => {
    if (level > inherited) {
      inherited = level
      gate = from
    }
  }
  for (const req of quest.traderRequirements) {
    if (req.type !== 'level') continue
    const from = { kind: 'loyalty' as const, traderId: req.traderId, level: req.value }
    consider(loyaltyPlayerLevel(traders, req.traderId, req.value), from)
    // A loyalty level is the gate even when it needs no particular player level.
    gate ??= from
  }
  for (const req of quest.requires) {
    const before = questsById.get(req.questId)
    if (!before) continue
    const from = { kind: 'quest' as const, questId: before.id }
    consider(before.minPlayerLevel, from)
    for (const o of before.objectives)
      if (o.traderLevel)
        consider(loyaltyPlayerLevel(traders, o.traderLevel.traderId, o.traderLevel.level), from)
  }
  return { own: quest.minPlayerLevel > inherited, gate }
}

const COMPARE: Record<string, string> = { '>=': '≥', '<=': '≤', '>': '>', '<': '<' }

/**
 * What a quest needs before it's offered, as the game shows it: its own level (when it has one
 * above 1), loyalty levels and reputation. Earlier quests are listed separately.
 */
export function requirementLabels(
  quest: Quest,
  questsById: ReadonlyMap<string, Quest>,
  traders: ReadonlyMap<string, QuestTrader> | undefined
): string[] {
  const labels: string[] = []
  if (levelRequirement(quest, questsById, traders).own && quest.minPlayerLevel > 1)
    labels.push(`Level ${quest.minPlayerLevel}`)
  for (const req of quest.traderRequirements) {
    const name = traders?.get(req.traderId)?.name ?? 'Trader'
    labels.push(
      req.type === 'level'
        ? `${name} LL${req.value}`
        : `${name} rep ${COMPARE[req.compareMethod] ?? req.compareMethod} ${req.value}`
    )
  }
  return labels
}

/** Whether a quest's progress is one of the statuses wanted (finished counts as started). */
export const satisfies = (entry: ProgressEntry | undefined, wanted: RequirementStatus[]): boolean =>
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
  if (ctx.playerLevel < quest.minPlayerLevel) {
    const { own, gate } = levelRequirement(quest, questsById, ctx.traders)
    const trader = gate?.kind === 'loyalty' ? (ctx.traders?.get(gate.traderId)?.name ?? 'the trader') : null
    reasons.push(
      !own && gate?.kind === 'loyalty'
        ? `Needs ${trader} LL${gate.level} (from level ${quest.minPlayerLevel})`
        : `Needs level ${quest.minPlayerLevel}`
    )
  }
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

/** The one item an objective hands over or plants, or null when it takes none or any of several. */
export function handOverItemOf(
  objective: Pick<QuestObjective, 'type' | 'items' | 'optional'>
): string | null {
  return CONSUMING.has(objective.type) && objective.items.length === 1 && !objective.optional
    ? objective.items[0]
    : null
}

/**
 * Items still to hand over or plant for the given quests (less what's been handed over already). Only
 * objectives that name a single item add up per item; "any of these" objectives are listed separately.
 */
export function neededItems(
  quests: readonly Quest[],
  objectives?: ObjectiveProgress
): {
  items: NeededItem[]
  /** With how many are still to hand over. */
  anyOf: { quest: Quest; objective: QuestObjective; count: number }[]
} {
  const byKey = new Map<string, NeededItem>()
  const anyOf: { quest: Quest; objective: QuestObjective; count: number }[] = []
  for (const quest of quests) {
    for (const objective of quest.objectives) {
      if (!CONSUMING.has(objective.type) || !objective.items.length || objective.optional) continue
      const count = (objective.count ?? 1) - objectiveValue(objective, quest.id, objectives)
      if (count <= 0) continue
      if (objective.items.length > 1) {
        anyOf.push({ quest, objective, count })
        continue
      }
      const itemId = objective.items[0]
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
