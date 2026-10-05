import { objectiveTarget, objectiveValue, type ObjectiveProgress, type QuestStatus } from './questProgress'
import type { Quest, QuestObjective } from './questTypes'

// The key tracker: which keys the player has (ticked by hand, per game mode), which keys their quests
// still need, and which quest objectives a missing key holds up.

/** The player's keys in one game mode. Since 1.17.0. */
export interface KeyInventory {
  /** Keys the player has. */
  owned: string[]
  /** Keys the player wants to get, listed in the To do tab. */
  toDo: string[]
}

export const EMPTY_KEYS: KeyInventory = { owned: [], toDo: [] }

/** Far more than there are keys in the game. */
export const MAX_KEYS = 2000

/** A quest that needs a key, and where. */
export interface KeyUse {
  quest: Quest
  status: QuestStatus
  /** Unfinished objectives behind the lock (empty when tarkov.dev only lists the key for the quest). */
  objectives: QuestObjective[]
  /** Maps the lock is on. */
  mapIds: string[]
}

/** A lock some quest still needs opened. */
export interface KeyNeed {
  /** Any one of these opens it (most locks take one key). */
  keyIds: string[]
  /** Active quests first, then available, then locked ones. */
  uses: KeyUse[]
}

const STATUS_ORDER: Partial<Record<QuestStatus, number>> = { active: 0, available: 1, locked: 2 }

/**
 * What reading the player's keys from screenshots changes: the keys found that aren't ticked yet, and
 * the ticked ones the screenshots don't show (the screenshots are the whole list).
 */
export function keyScanChanges(
  found: Iterable<string>,
  owned: readonly string[]
): { add: string[]; remove: string[]; unchanged: number } {
  const seen = new Set(found)
  const have = new Set(owned)
  return {
    add: [...seen].filter((id) => !have.has(id)),
    remove: [...have].filter((id) => !seen.has(id)),
    unchanged: [...seen].filter((id) => have.has(id)).length
  }
}

/** Whether one of a lock's keys is owned. */
export const opens = (keyIds: readonly string[], owned: ReadonlySet<string>): boolean =>
  keyIds.some((id) => owned.has(id))

/** The locks an objective needs opened that none of the player's keys open. */
export function missingKeys(
  objective: Pick<QuestObjective, 'requiredKeys'>,
  owned: ReadonlySet<string>
): string[][] {
  return objective.requiredKeys.filter((keyIds) => keyIds.length > 0 && !opens(keyIds, owned))
}

/**
 * The keys the player's quests still need, for quests with one of the given statuses: each objective
 * not yet done adds the locks it names, and tarkov.dev's list of the quest's keys adds the rest.
 */
export function keysNeeded(
  rows: readonly { quest: Quest; status: QuestStatus }[],
  objectives: ObjectiveProgress | undefined,
  statuses: ReadonlySet<QuestStatus> = new Set(['active', 'available', 'locked'])
): KeyNeed[] {
  const needs = new Map<string, KeyNeed>()
  const use = (keyIds: string[], row: { quest: Quest; status: QuestStatus }): KeyUse => {
    const key = [...keyIds].sort().join()
    let need = needs.get(key)
    if (!need) {
      need = { keyIds, uses: [] }
      needs.set(key, need)
    }
    let entry = need.uses.find((u) => u.quest === row.quest)
    if (!entry) {
      entry = { quest: row.quest, status: row.status, objectives: [], mapIds: [] }
      need.uses.push(entry)
    }
    return entry
  }
  for (const row of rows) {
    if (!statuses.has(row.status)) continue
    const { quest } = row
    const open = quest.objectives.filter((o) => objectiveValue(o, quest.id, objectives) < objectiveTarget(o))
    if (!open.length) continue
    for (const o of open) {
      for (const keyIds of o.requiredKeys) {
        if (!keyIds.length) continue
        const entry = use(keyIds, row)
        entry.objectives.push(o)
        for (const map of o.maps) if (!entry.mapIds.includes(map)) entry.mapIds.push(map)
      }
    }
    // tarkov.dev's list adds keys no objective names (an objective already done needs none).
    const named = new Set(quest.objectives.flatMap((o) => o.requiredKeys.flat()))
    for (const { map, keyIds } of quest.neededKeys)
      for (const id of keyIds) {
        if (named.has(id)) continue
        const entry = use([id], row)
        if (map && !entry.mapIds.includes(map)) entry.mapIds.push(map)
      }
  }
  const order = (u: KeyUse): number => STATUS_ORDER[u.status] ?? 3
  for (const need of needs.values())
    need.uses.sort((a, b) => order(a) - order(b) || a.quest.minPlayerLevel - b.quest.minPlayerLevel)
  return [...needs.values()].sort(
    (a, b) =>
      order(a.uses[0]) - order(b.uses[0]) ||
      a.uses[0].quest.minPlayerLevel - b.uses[0].quest.minPlayerLevel ||
      a.keyIds.join().localeCompare(b.keyIds.join())
  )
}

/** Quests that hand out each key: as a reward, or when accepted. */
export function keyRewards(
  quests: readonly Quest[],
  isKey: (itemId: string) => boolean
): Map<string, { quest: Quest; onStart: boolean }[]> {
  const result = new Map<string, { quest: Quest; onStart: boolean }[]>()
  for (const quest of quests)
    for (const [items, onStart] of [
      [quest.rewards.items, false],
      [quest.startRewards.items, true]
    ] as const)
      for (const { itemId } of items) {
        if (!isKey(itemId)) continue
        const list = result.get(itemId) ?? []
        if (!list.some((r) => r.quest === quest)) list.push({ quest, onStart })
        result.set(itemId, list)
      }
  return result
}
