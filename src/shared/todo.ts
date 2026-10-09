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

export type ObjectiveKind = 'visit' | 'pickup' | 'stash' | 'mark' | 'kill' | 'extract' | 'other'

/** What an objective has you do, for its icon and summary. */
export function objectiveKind(objective: Pick<QuestObjective, 'type'>): ObjectiveKind {
  switch (objective.type) {
    case 'visit':
      return 'visit'
    case 'findQuestItem':
    case 'findItem':
      return 'pickup'
    case 'plantItem':
    case 'plantQuestItem':
      return 'stash'
    case 'mark':
      return 'mark'
    case 'shoot':
      return 'kill'
    case 'extract':
      return 'extract'
    default:
      return 'other'
  }
}

/** Kill objectives (eliminate enemies), and locate ones (go to, mark, find, stash, extract…). */
export type ObjectiveCategory = 'kill' | 'locate'

export const objectiveCategory = (objective: Pick<QuestObjective, 'type'>): ObjectiveCategory =>
  objective.type === 'shoot' ? 'kill' : 'locate'

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
  /** Their in-raid objectives here (of the kinds shown) already done: with `steps`, how far along. */
  done: number
  /** Of those, the ones with nothing left in raid anywhere else (only hand-ins, if anything). */
  finishes: Quest[]
  /** Quests not started yet that have objectives here, to pick up from their traders first. */
  available: Quest[]
  /**
   * Quests here whose objectives here are all behind locks (or a way in) the player has no key for. They
   * count only when blocked objectives are shown; with them hidden, there are none.
   */
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
  /** Keys the player doesn't have that would open up objectives of active quests ("Keys to buy"). */
  keysToGet: KeyToGet[]
  /** How many quests are active. */
  active: number
  /** Active quests with objectives left out because they're behind keys the player doesn't have. */
  hidden: number
}

export interface TodoOptions {
  /** What's put aside, for hand-overs and items to find. */
  have?: Readonly<Record<string, number>>
  /** The player's keys, to tell which objectives are behind a lock they can't open; null: not checked. */
  owned?: ReadonlySet<string> | null
  /** Leave out objectives behind a lock the player can't open, or on a map they can't get onto. */
  hideBlocked?: boolean
  /** Only kill objectives, or only locate ones (a quest with both shows just those). */
  kinds?: 'all' | ObjectiveCategory
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

/**
 * Where to raid next for the active quests, and what can be done without a raid. `groupOf` says which
 * map (group) a map id belongs to. With `owned` (the player's keys), objectives behind a lock none of them
 * opens, or on a map they can't get onto, are flagged; with `hideBlocked`, a quest such a lock holds up
 * is left out entirely (its keys still listed to get), and so is what's on a map they can't get onto.
 */
export function todoPlan(
  rows: readonly { quest: Quest; status: QuestStatus }[],
  objectives: ObjectiveProgress | undefined,
  groupOf: (mapId: string) => MapGroup | undefined,
  { have = {}, owned = null, hideBlocked = false, kinds = 'all' }: TodoOptions = {}
): TodoPlan {
  const wanted = (o: QuestObjective): boolean => kinds === 'all' || objectiveCategory(o) === kinds
  const hidden = new Set<Quest>()
  const plans = new Map<string, MapPlan>()
  const plan = (group: MapGroup): MapPlan => {
    let p = plans.get(group.key)
    if (!p) {
      const shut = owned && group.accessKeys?.length && !opens(group.accessKeys, owned)
      p = {
        group,
        steps: [],
        quests: [],
        done: 0,
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
    active: 0,
    hidden: 0
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
    // Every objective left in raid (for whether a quest can be finished on a map), and the kind asked for.
    const raidAll = open
      .filter((s) => inRaid(s.objective))
      .map((s) => ({ ...s, groups: groupsOf(s.objective) }))
    const raid = raidAll.filter((s) => wanted(s.objective))

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
    const onMapsAll = raidAll.filter((s) => s.groups.length)
    // "Only quests I can do": a lock none of the player's keys open, anywhere in the quest, holds it all up.
    const keyBlocked = hideBlocked && open.some((s) => s.missing.length > 0)
    if (keyBlocked) hidden.add(quest)
    for (const step of raid) {
      if (step.groups.length) continue
      if (step.objective.type !== 'findItem') {
        for (const keyIds of step.missing) needKey(keyIds, quest, [], false)
        if (!keyBlocked) result.anyMap.push(step)
      } else {
        const single = step.objective.items.length === 1 ? step.objective.items[0] : null
        if (!single || (have[single] ?? 0) < step.left) result.finds.push(step)
      }
    }
    const touched = new Map(onMaps.flatMap((s) => s.groups).map((g) => [g.key, g]))
    for (const group of touched.values()) {
      const p = plan(group)
      const inGroup = (st: { groups: MapGroup[] }): boolean => st.groups.some((g) => g.key === group.key)
      const all = onMaps.filter(inGroup)
      // What can be done here with the player's keys: not behind a lock they can't open, on a map they
      // can get onto.
      const canDo = (st: TodoStep): boolean => !p.noAccess && !st.missing.length
      if (p.noAccess) needKey(p.noAccess, quest, group.mapIds.slice(0, 1), true)
      for (const { objective, missing } of all)
        for (const keyIds of missing) needKey(keyIds, quest, objective.maps, false)
      if (keyBlocked) continue
      const here = hideBlocked ? all.filter(canDo) : all
      if (here.length < all.length) hidden.add(quest)
      if (!here.length) continue
      p.steps.push(...here.map(({ groups: _, ...st }) => st))
      p.quests.push(quest)
      p.done += quest.objectives.filter(
        (o) =>
          !o.optional &&
          inRaid(o) &&
          wanted(o) &&
          objectiveMapIds(o).some((id) => group.mapIds.includes(id)) &&
          objectiveValue(o, quest.id, objectives) >= objectiveTarget(o)
      ).length
      if (!here.some(canDo)) p.blocked.push(quest)
      // Finished here: nothing left in raid anywhere else (of any kind), and nothing in the way.
      const allHere = onMapsAll.filter(inGroup)
      if (allHere.length === onMapsAll.length && allHere.every(canDo)) p.finishes.push(quest)
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
  result.hidden = hidden.size
  // The keys holding up the most quests first.
  result.keysToGet = [...toGet.values()].sort(
    (a, b) => b.quests.length - a.quests.length || Number(b.access) - Number(a.access)
  )
  // Maps where everything was left out (behind keys the player doesn't have) aren't listed.
  result.maps = [...plans.values()]
    .filter((p) => p.quests.length || p.available.length)
    .sort(
      (a, b) =>
        score(b) - score(a) ||
        b.steps.length - a.steps.length ||
        b.available.length - a.available.length ||
        a.group.name.localeCompare(b.group.name)
    )
  return result
}

/** A map's plan in a few numbers, for its tile in the overview. */
export interface MapOverview {
  /** Active quests with something to do here. */
  quests: number
  /** Objectives left here. */
  left: number
  /** Objectives here already done. */
  done: number
  /** Enemies left to kill here, over every kill objective. */
  kills: number
  /** Locate objectives left here. */
  locate: number
  finishes: number
  blocked: number
  /** Locks the objectives here need opened. */
  keys: number
  /** Of those, the ones none of the player's keys open (none when their keys aren't known). */
  missingKeys: number
  /** Items and quest items to take in. */
  bring: number
  /** Quests to pick up that have objectives here. */
  pickUp: number
}

export function mapOverview(plan: MapPlan, owned: ReadonlySet<string> | null = null): MapOverview {
  const kills = plan.steps.filter((s) => objectiveCategory(s.objective) === 'kill')
  return {
    quests: plan.quests.length,
    left: plan.steps.length,
    done: plan.done,
    kills: kills.reduce((n, s) => n + s.left, 0),
    locate: plan.steps.length - kills.length,
    finishes: plan.finishes.length,
    blocked: plan.blocked.length,
    keys: plan.keys.length,
    missingKeys: owned ? plan.keys.filter((k) => !opens(k, owned)).length : 0,
    bring: plan.bring.length + plan.questItems.length,
    pickUp: plan.available.length
  }
}

/** A line of a quest's summary: one kill objective, or the objectives of one kind (with how many done). */
export interface SummaryLine {
  kind: ObjectiveKind
  text: string
  done: number
  total: number
}

const KIND_PHRASE: Partial<Record<ObjectiveKind, (n: number) => string>> = {
  visit: (n) => `Visit ${n} places`,
  mark: (n) => `Mark ${n} spots`,
  pickup: (n) => `Find ${n} items`,
  stash: (n) => `Stash ${n} items`,
  extract: (n) => `Extract ${n} times`,
  other: (n) => `${n} objectives`
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** An objective's text without the map it's on (the card already says), e.g. "Eliminate 5 Scavs". */
export function shortObjective(text: string, mapNames: readonly string[]): string {
  if (!mapNames.length) return text
  const names = mapNames.map(escape).join('|')
  return text.replace(new RegExp(`\\s+(on|in|at) (the )?(${names})( territory| location)?\\.?$`, 'i'), '')
}

/**
 * A quest's objectives on one map, in a few lines: each kill objective with its count, and the rest by
 * kind ("Mark 3 spots", 1 of 3 done), in the quest's order. `steps` are the ones left there (and shown);
 * the summary's other objectives of those kinds on the map count towards how many are done.
 */
export function questSummary(
  quest: Quest,
  objectives: ObjectiveProgress | undefined,
  steps: readonly TodoStep[],
  group: MapGroup | null,
  mapNames: readonly string[],
  max = 3
): { lines: SummaryLine[]; more: number } {
  const lines: SummaryLine[] = []
  const kinds = new Set<ObjectiveKind>()
  const onMap = (o: QuestObjective): boolean =>
    !group || objectiveMapIds(o).some((id) => group.mapIds.includes(id))
  const shown = new Set(steps.map((st) => st.objective))
  for (const objective of quest.objectives) {
    if (!shown.has(objective)) continue
    const kind = objectiveKind(objective)
    const value = objectiveValue(objective, quest.id, objectives)
    const target = objectiveTarget(objective)
    if (kind === 'kill') {
      lines.push({ kind, text: shortObjective(objective.description, mapNames), done: value, total: target })
      continue
    }
    if (kinds.has(kind)) continue
    kinds.add(kind)
    // The quest's objectives of this kind here, done ones included.
    const same = quest.objectives.filter(
      (o) => !o.optional && objectiveKind(o) === kind && inRaid(o) && onMap(o)
    )
    if (same.length <= 1)
      lines.push({ kind, text: shortObjective(objective.description, mapNames), done: value, total: target })
    else
      lines.push({
        kind,
        text: KIND_PHRASE[kind]?.(same.length) ?? `${same.length} objectives`,
        done: same.filter((o) => objectiveValue(o, quest.id, objectives) >= objectiveTarget(o)).length,
        total: same.length
      })
  }
  return { lines: lines.slice(0, max), more: Math.max(0, lines.length - max) }
}

/** A kill objective still to do, for the banner over the map. */
export interface KillToDo {
  quest: Quest
  objective: QuestObjective
  done: number
  total: number
  /** It counts on any map (it names none). */
  anyMap: boolean
}

/** Maps an objective must name, counted as map groups, to count as one for any map. */
export const ANY_MAP_GROUPS = 6

/**
 * The kill objectives of active quests left to do on a map (`mapIds`: its group's, Night Factory with
 * Factory): the ones for this map, then the ones for any map, each set by quest name (the ones naming
 * the fewest maps first). An objective counts for any map when it names no map, says "any location", or
 * names `ANY_MAP_GROUPS` map groups or more (tarkov.dev lists most maps for many "any location" kills;
 * `groupOf` gives a map id's group). One that names maps but not this one isn't listed. `blocked` leaves
 * out quests held up by a key the player doesn't have ("Only quests I can do").
 */
export function killObjectives(
  rows: readonly { quest: Quest; status: QuestStatus }[],
  objectives: ObjectiveProgress | undefined,
  mapIds: ReadonlySet<string>,
  {
    blocked,
    groupOf
  }: { blocked?: (quest: Quest) => boolean; groupOf?: (mapId: string) => string | undefined } = {}
): KillToDo[] {
  const here: KillToDo[] = []
  const anywhere: KillToDo[] = []
  for (const { quest, status } of rows) {
    if (status !== 'active' || blocked?.(quest)) continue
    for (const objective of quest.objectives) {
      if (objective.optional || objectiveCategory(objective) !== 'kill' || !inRaid(objective)) continue
      const done = objectiveValue(objective, quest.id, objectives)
      const total = objectiveTarget(objective)
      if (done >= total) continue
      const maps = objectiveMapIds(objective)
      if (maps.length && !maps.some((id) => mapIds.has(id))) continue
      const groups = new Set(maps.map((id) => groupOf?.(id) ?? id)).size
      const anyMap =
        !maps.length || /\bany (location|map)\b/i.test(objective.description) || groups >= ANY_MAP_GROUPS
      ;(anyMap ? anywhere : here).push({ quest, objective, done, total, anyMap })
    }
  }
  const byQuest = (a: KillToDo, b: KillToDo): number => a.quest.name.localeCompare(b.quest.name)
  const maps = (k: KillToDo): number => objectiveMapIds(k.objective).length
  return [...here.sort((a, b) => maps(a) - maps(b) || byQuest(a, b)), ...anywhere.sort(byQuest)]
}
