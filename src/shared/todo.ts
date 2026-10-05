import {
  handOverItemOf,
  objectiveTarget,
  objectiveValue,
  type ObjectiveProgress,
  type QuestStatus
} from './questProgress'
import type { Quest, QuestObjective } from './questTypes'
import { missingKeys, opens } from './keys'

// The To do tab: which map to raid next. Each map gets the unfinished objectives of active quests that
// are done there, and maps are ranked by how many quests a raid there moves on, counting twice the ones
// with nothing left in raid anywhere else (finishing a quest is what opens up the next ones).

/** Objective types done away from raids: at a trader, in the stash or menus, or by levelling. */
const OFF_RAID = new Set([
  'giveItem',
  'giveQuestItem',
  'traderLevel',
  'traderStanding',
  'skill',
  'playerLevel',
  'taskStatus',
  'sellItem',
  'buildWeapon'
])

/** Objectives that use up an item in raid: you bring it with you. */
const BRING = new Set(['mark', 'plantItem', 'useItem'])

/** Every map an objective names: its own list, its zones' and where its quest item can be. */
export function objectiveMapIds(objective: Pick<QuestObjective, 'maps' | 'zones' | 'locations'>): string[] {
  return [
    ...new Set([
      ...objective.maps,
      ...objective.zones.map((z) => z.map),
      ...objective.locations.map((l) => l.map)
    ])
  ]
}

/** Whether an objective is done in a raid (a story step only when it names a map). */
export function inRaid(objective: QuestObjective): boolean {
  if (OFF_RAID.has(objective.type)) return false
  if (objective.traderLevel || objective.questStatus || objective.playerLevel != null) return false
  return objective.type !== 'story' || objectiveMapIds(objective).length > 0
}

/** Maps shown as one, like Factory and Night Factory. */
export interface MapGroup {
  key: string
  name: string
  mapIds: string[]
  /** Items needed to get in, any one of them (the Labs access keycard). */
  accessKeys?: string[]
}

/** An unfinished objective, and how many of it are still to do. */
export interface TodoStep {
  quest: Quest
  objective: QuestObjective
  left: number
  /** Locks it needs opened that none of the player's keys open (empty when keys aren't checked). */
  missing: string[][]
}

/** What a raid on one map would get done. */
export interface MapPlan {
  group: MapGroup
  /** Unfinished in-raid objectives of active quests that can be done here. */
  steps: TodoStep[]
  /** Active quests with something to do here: ones to finish first, then the most steps. */
  quests: Quest[]
  /** Of those, the ones with nothing left in raid anywhere else (only hand-ins, if anything). */
  finishes: Quest[]
  /** Quests not started yet that have objectives here, to pick up from their traders first. */
  available: Quest[]
  /** Active quests with objectives here, but only behind locks (or a way in) the player has no key for. */
  blocked: Quest[]
  /** The items needed to get onto the map, when the player has none of them. */
  noAccess: string[] | null
  /** Keys the steps here need: one list per lock, any key in a list opens it. */
  keys: string[][]
  /** Items the steps here use up (to mark, plant or use), with how many. */
  bring: { itemId: string; count: number }[]
  /** Quest items to take in and plant, given when the quest started. */
  questItems: { name: string; questId: string }[]
}

/** A hand-over that can be done now: the items are put aside, or the quest item has been found. */
export interface HandOverReady {
  quest: Quest
  objective: QuestObjective
  /** The item, or null for a quest item. */
  itemId: string | null
  count: number
  /** How many are put aside (null for a quest item). */
  have: number | null
}

export interface TodoPlan {
  /** Best first; maps where only quests not started yet have objectives come last. */
  maps: MapPlan[]
  /** In-raid objectives of active quests that can be done on any map (items to find aside). */
  anyMap: TodoStep[]
  /** Items to find in raid on any map, less those already put aside. */
  finds: TodoStep[]
  /** Active quests with every objective done: hand them in. */
  turnIn: Quest[]
  handOvers: HandOverReady[]
  /** Keys the player doesn't have that would open up objectives of active quests. */
  keysToGet: KeyToGet[]
  /** How many quests are active. */
  active: number
}

/** A lock (or a map's way in) holding up active quests. */
export interface KeyToGet {
  /** Any one of these opens it. */
  keyIds: string[]
  quests: Quest[]
  /** Map ids of the objectives behind it. */
  mapIds: string[]
  /** The item gets you onto a map, rather than opening a lock. */
  access: boolean
}

const score = (plan: MapPlan): number => plan.quests.length + plan.finishes.length
/** Steps that can be done there with the player's keys. */
const doable = (plan: MapPlan): number =>
  plan.noAccess ? 0 : plan.steps.filter((s) => !s.missing.length).length

/**
 * Where to raid next for the active quests, and what can be done without a raid. `groupOf` says which
 * map (group) a map id belongs to; `have` is what's put aside, for hand-overs and items to find. With
 * `owned` (the player's keys), objectives behind a lock none of them opens, or on a map they can't get
 * onto, don't count.
 */
export function todoPlan(
  rows: readonly { quest: Quest; status: QuestStatus }[],
  objectives: ObjectiveProgress | undefined,
  groupOf: (mapId: string) => MapGroup | undefined,
  have: Readonly<Record<string, number>> = {},
  owned: ReadonlySet<string> | null = null
): TodoPlan {
  const plans = new Map<string, MapPlan>()
  const plan = (group: MapGroup): MapPlan => {
    let p = plans.get(group.key)
    if (!p) {
      const shut = owned && group.accessKeys?.length && !opens(group.accessKeys, owned)
      p = {
        group,
        steps: [],
        quests: [],
        finishes: [],
        available: [],
        blocked: [],
        noAccess: shut ? group.accessKeys! : null,
        keys: [],
        bring: [],
        questItems: []
      }
      plans.set(group.key, p)
    }
    return p
  }
  const toGet = new Map<string, KeyToGet>()
  const needKey = (keyIds: string[], quest: Quest, mapIds: readonly string[], access: boolean): void => {
    const id = [...keyIds].sort().join()
    const entry = toGet.get(id) ?? { keyIds, quests: [], mapIds: [], access }
    if (!entry.quests.includes(quest)) entry.quests.push(quest)
    for (const map of mapIds) if (!entry.mapIds.includes(map)) entry.mapIds.push(map)
    toGet.set(id, entry)
  }
  const groupsOf = (objective: QuestObjective): MapGroup[] => [
    ...new Map(
      objectiveMapIds(objective)
        .map(groupOf)
        .filter((g): g is MapGroup => g !== undefined)
        .map((g) => [g.key, g])
    ).values()
  ]
  const result: TodoPlan = {
    maps: [],
    anyMap: [],
    finds: [],
    turnIn: [],
    handOvers: [],
    keysToGet: [],
    active: 0
  }

  for (const { quest, status } of rows) {
    if (status !== 'active' && status !== 'available') continue
    const open = quest.objectives
      .filter((o) => !o.optional)
      .map((o) => ({
        quest,
        objective: o,
        left: objectiveTarget(o) - objectiveValue(o, quest.id, objectives),
        missing: owned ? missingKeys(o, owned) : []
      }))
      .filter((s) => s.left > 0)
    const raid = open.filter((s) => inRaid(s.objective)).map((s) => ({ ...s, groups: groupsOf(s.objective) }))

    if (status === 'available') {
      // Story chapters start by themselves: only quests a trader hands out are picked up.
      if (quest.story) continue
      const touched = new Map(raid.flatMap((s) => s.groups).map((g) => [g.key, g]))
      for (const group of touched.values()) plan(group).available.push(quest)
      continue
    }

    result.active++
    if (!open.length) {
      if (quest.objectives.some((o) => !o.optional)) result.turnIn.push(quest)
      continue
    }
    for (const step of open) {
      const itemId = handOverItemOf(step.objective)
      if (itemId) {
        const count = have[itemId] ?? 0
        if (count >= step.left) result.handOvers.push({ ...step, itemId, count: step.left, have: count })
      } else if (step.objective.type === 'giveQuestItem' && step.objective.questItem) {
        // Ready once the quest's own "find" of the same quest item is done.
        const id = step.objective.questItem.id
        const find = quest.objectives.find((o) => o.type === 'findQuestItem' && o.questItem?.id === id)
        if (find && objectiveValue(find, quest.id, objectives) >= objectiveTarget(find))
          result.handOvers.push({ ...step, itemId: null, count: step.left, have: null })
      }
    }

    const onMaps = raid.filter((s) => s.groups.length)
    for (const step of raid) {
      if (step.groups.length) continue
      if (step.objective.type !== 'findItem') {
        result.anyMap.push(step)
        for (const keyIds of step.missing) needKey(keyIds, quest, [], false)
      } else {
        const single = step.objective.items.length === 1 ? step.objective.items[0] : null
        if (!single || (have[single] ?? 0) < step.left) result.finds.push(step)
      }
    }
    const touched = new Map(onMaps.flatMap((s) => s.groups).map((g) => [g.key, g]))
    for (const group of touched.values()) {
      const p = plan(group)
      const here = onMaps.filter((s) => s.groups.some((g) => g.key === group.key))
      p.steps.push(...here.map(({ groups: _, ...s }) => s))
      // What can be done here with the player's keys: not behind a lock they can't open, on a map they
      // can get onto.
      const ready = p.noAccess ? [] : here.filter((s) => !s.missing.length)
      if (!ready.length) p.blocked.push(quest)
      else {
        p.quests.push(quest)
        if (here.length === onMaps.length && ready.length === here.length) p.finishes.push(quest)
      }
      if (p.noAccess) needKey(p.noAccess, quest, group.mapIds.slice(0, 1), true)
      for (const { objective, missing } of here)
        for (const keyIds of missing) needKey(keyIds, quest, objective.maps, false)
      for (const { objective, left } of here) {
        for (const keyIds of objective.requiredKeys)
          if (keyIds.length && !p.keys.some((k) => k.join() === keyIds.join())) p.keys.push(keyIds)
        if (BRING.has(objective.type) && objective.items.length === 1) {
          const itemId = objective.items[0]
          const entry = p.bring.find((b) => b.itemId === itemId)
          if (entry) entry.count += left
          else p.bring.push({ itemId, count: left })
        }
        if (objective.type === 'plantQuestItem' && objective.questItem)
          p.questItems.push({ name: objective.questItem.name, questId: quest.id })
      }
      // tarkov.dev's own list of the quest's keys on this map, for locks no objective names.
      const named = new Set(quest.objectives.flatMap((o) => o.requiredKeys.flat()))
      for (const { map, keyIds } of quest.neededKeys) {
        if (!group.mapIds.includes(map)) continue
        for (const id of keyIds) if (!named.has(id) && !p.keys.some((k) => k.includes(id))) p.keys.push([id])
      }
    }
  }

  for (const p of plans.values()) {
    const stepsOf = (q: Quest): number => p.steps.filter((s) => s.quest === q).length
    p.quests.sort(
      (a, b) =>
        Number(p.finishes.includes(b)) - Number(p.finishes.includes(a)) ||
        stepsOf(b) - stepsOf(a) ||
        a.name.localeCompare(b.name)
    )
    p.available.sort((a, b) => a.name.localeCompare(b.name))
    p.blocked.sort((a, b) => a.name.localeCompare(b.name))
  }
  // The keys holding up the most quests first.
  result.keysToGet = [...toGet.values()].sort(
    (a, b) => b.quests.length - a.quests.length || Number(b.access) - Number(a.access)
  )
  result.maps = [...plans.values()].sort(
    (a, b) =>
      score(b) - score(a) ||
      doable(b) - doable(a) ||
      b.available.length - a.available.length ||
      a.group.name.localeCompare(b.group.name)
  )
  return result
}
