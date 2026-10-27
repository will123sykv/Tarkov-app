import {
  handOverItemOf,
  objectiveTarget,
  objectiveValue,
  type ObjectiveProgress,
  type QuestStatus
} from './questProgress'
import type { Quest, QuestObjective } from './questTypes'
import { missingKeys, opens } from './keys'
import { squadShared } from './squad'
import { reachableSteps } from './storyQuests'

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

/** Maps an objective must name, counted as map groups, to count as one for any map. */
export const ANY_MAP_GROUPS = 6

/**
 * Whether an objective can be done on any map (one rule for every page since 1.63.0): it names no map,
 * or, with no particular place to go to (no zones or item spots), says "any location" or "any map" or
 * names `ANY_MAP_GROUPS` map groups or more (tarkov.dev lists most maps for many "any location" kills;
 * `groupKey` gives a map id's group).
 */
export function isAnyMap(
  objective: Pick<QuestObjective, 'maps' | 'zones' | 'locations' | 'description'>,
  groupKey?: (mapId: string) => string | undefined
): boolean {
  const maps = objectiveMapIds(objective)
  if (!maps.length) return true
  // Places to go to on particular maps (zones, where its items can be) keep it on those maps.
  if (objective.zones.length || objective.locations.length) return false
  if (/\bany (location|map)\b/i.test(objective.description)) return true
  return new Set(maps.map((id) => groupKey?.(id) ?? id)).size >= ANY_MAP_GROUPS
}

/**
 * Where a quest is done, for the Quests tab (since 1.63.0): the maps it names (its own and its objectives',
 * leaving out the lists of objectives for any map), and whether it has an objective for any map in raid
 * (as To do's `anyMap`: items to find aside).
 */
export function questPlaces(
  quest: Quest,
  groupKey?: (mapId: string) => string | undefined
): { mapIds: string[]; anyMap: boolean } {
  const mapIds = new Set(quest.map ? [quest.map] : [])
  let anyMap = false
  for (const o of quest.objectives) {
    if (isAnyMap(o, groupKey)) {
      // Items to find in raid are anywhere too, but listed apart (To do's finds), as here.
      if (!o.optional && inRaid(o) && o.type !== 'findItem') anyMap = true
    } else for (const id of objectiveMapIds(o)) mapIds.add(id)
  }
  return { mapIds: [...mapIds], anyMap }
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
  /** Items the steps here use up (to mark, plant or use), with how many: any one of each list. */
  bring: BringItem[]
  /** Quest items to take in and plant, given when the quest started. */
  questItems: { name: string; questId: string }[]
}

/** An item to take into a raid to use up there: any one of `itemIds` (an Obdolbos or an Obdolbos 2). */
export interface BringItem {
  itemIds: string[]
  count: number
  /** For an objective on any map: it can be used on whichever map is raided. */
  anyMap?: boolean
}

const sameItems = (a: readonly string[], b: readonly string[]): boolean =>
  [...a].sort().join() === [...b].sort().join()

/** Add an item to bring to a list, adding to the count of the same choice of items. */
function addBring(list: BringItem[], itemIds: string[], count: number, anyMap?: boolean): void {
  const entry = list.find((b) => sameItems(b.itemIds, itemIds) && !b.anyMap === !anyMap)
  if (entry) entry.count += count
  else list.push({ itemIds, count, ...(anyMap ? { anyMap } : {}) })
}

/**
 * What objectives on any map (naming none) have you take in: the items to use up, for every map's list,
 * as they can be done on whichever map is raided. (Guns are chosen per map in the Weapons tab.)
 */
export function anyMapTake(plan: Pick<TodoPlan, 'anyMap'>): { bring: BringItem[] } {
  const bring: BringItem[] = []
  for (const { objective, left } of plan.anyMap)
    if (BRING.has(objective.type) && objective.items.length) addBring(bring, objective.items, left, true)
  return { bring }
}

/** A map's items to bring, with the ones for any map. */
export function takeToMap(
  plan: Pick<MapPlan, 'bring'>,
  anyMap: { bring: BringItem[] }
): { bring: BringItem[] } {
  return { bring: [...plan.bring, ...anyMap.bring] }
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
  /** What's put aside (both kinds together), for hand-overs and items to find. */
  have?: Readonly<Record<string, number>>
  /**
   * What the shared Have gives a quest's hand-over of an item (since 1.66.0): a hand-over is ready only
   * when its own copies are there, not ones the hideout or another quest counts on. Without it, `have`.
   */
  handOverShare?: (questId: string, itemId: string, foundInRaid: boolean) => number
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

/** A map with nothing to do yet (for a map listed only for what's on any map). */
export const emptyMapPlan = (group: MapGroup, noAccess: string[] | null = null): MapPlan => ({
  group,
  steps: [],
  quests: [],
  done: 0,
  finishes: [],
  available: [],
  blocked: [],
  noAccess,
  keys: [],
  bring: [],
  questItems: []
})

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
  { have = {}, handOverShare, owned = null, hideBlocked = false, kinds = 'all' }: TodoOptions = {}
): TodoPlan {
  const wanted = (o: QuestObjective): boolean => kinds === 'all' || objectiveCategory(o) === kinds
  const hidden = new Set<Quest>()
  const plans = new Map<string, MapPlan>()
  const plan = (group: MapGroup): MapPlan => {
    let p = plans.get(group.key)
    if (!p) {
      const shut = owned && group.accessKeys?.length && !opens(group.accessKeys, owned)
      p = emptyMapPlan(group, shut ? group.accessKeys! : null)
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
  const groupKey = (id: string): string | undefined => groupOf(id)?.key
  // An objective for any map is on none in particular: it's listed once, for every map.
  const groupsOf = (objective: QuestObjective): MapGroup[] =>
    isAnyMap(objective, groupKey)
      ? []
      : [
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
    // A story chapter's later steps wait for the ones before them.
    const reachable = reachableSteps(quest, objectives)
    const left = quest.objectives.filter(
      (o) => !o.optional && objectiveValue(o, quest.id, objectives) < objectiveTarget(o)
    ).length
    const open = quest.objectives
      .filter((o) => !o.optional && reachable.has(o.id))
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
    if (!left) {
      if (quest.objectives.some((o) => !o.optional)) result.turnIn.push(quest)
      continue
    }
    for (const step of open) {
      const itemId = handOverItemOf(step.objective)
      if (itemId) {
        const count = handOverShare
          ? handOverShare(quest.id, itemId, step.objective.foundInRaid)
          : (have[itemId] ?? 0)
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
    // "Only quests I can do": a lock none of the player's keys open, anywhere in the quest, holds it all up
    // (a story chapter's locked step is left out on its own: the chapter isn't held up as a whole).
    const keyBlocked = hideBlocked && !quest.story && open.some((s) => s.missing.length > 0)
    if (keyBlocked) hidden.add(quest)
    // The keys to get, from every step left whatever kind is shown: the Kill filter still lists the key a
    // locate step needs, when that's what holds the quest up.
    for (const step of raidAll)
      for (const keyIds of step.missing)
        needKey(keyIds, quest, step.groups.length ? objectiveMapIds(step.objective) : [], false)
    for (const step of raid) {
      if (step.groups.length) continue
      if (step.objective.type !== 'findItem') {
        // A story step behind a lock is left out on its own (the chapter isn't held up as a whole).
        if (!keyBlocked && !(hideBlocked && quest.story && step.missing.length)) result.anyMap.push(step)
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
          !isAnyMap(o, groupKey) &&
          objectiveValue(o, quest.id, objectives) >= objectiveTarget(o)
      ).length
      if (!here.some(canDo)) p.blocked.push(quest)
      // Finished here: nothing left in raid anywhere else (of any kind), and nothing in the way.
      const allHere = onMapsAll.filter(inGroup)
      if (allHere.length === onMapsAll.length && allHere.every(canDo)) p.finishes.push(quest)
      for (const { objective, left } of here) {
        for (const keyIds of objective.requiredKeys)
          if (keyIds.length && !p.keys.some((k) => k.join() === keyIds.join())) p.keys.push(keyIds)
        // Any one of the items will do (an Obdolbos or an Obdolbos 2).
        if (BRING.has(objective.type) && objective.items.length) addBring(p.bring, objective.items, left)
        // Once each (two steps planting the same quest item bring it once).
        const name = objective.questItem?.name
        if (
          objective.type === 'plantQuestItem' &&
          name &&
          !p.questItems.some((q) => q.questId === quest.id && q.name === name)
        )
          p.questItems.push({ name, questId: quest.id })
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
  /** Items and quest items to take in, and the guns chosen for the map's kills. */
  bring: number
  /** Enemies left to kill for objectives on any map, which a raid here counts for too (since 1.63.0). */
  anyMapKills: number
  /** Quests to pick up that have objectives here. */
  pickUp: number
}

export function mapOverview(
  plan: MapPlan,
  owned: ReadonlySet<string> | null = null,
  /** The guns chosen for the map's kills (since 1.62.0 up to two). */
  guns = 0,
  /** Objectives on any map (`TodoPlan.anyMap`). */
  anyMap: readonly TodoStep[] = []
): MapOverview {
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
    bring: plan.bring.length + plan.questItems.length + guns,
    anyMapKills: anyMap
      .filter((s) => objectiveCategory(s.objective) === 'kill')
      .reduce((n, s) => n + s.left, 0),
    pickUp: plan.available.length
  }
}

/** A line of a quest's summary: one kill objective, or the objectives of one kind (with how many done). */
export interface SummaryLine {
  kind: ObjectiveKind
  text: string
  done: number
  total: number
  /** A squad's progress counts for it (all of them, for a line of several). */
  squad: boolean
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
      lines.push({
        kind,
        text: shortObjective(objective.description, mapNames),
        done: value,
        total: target,
        squad: squadShared(quest, objective)
      })
      continue
    }
    if (kinds.has(kind)) continue
    kinds.add(kind)
    // The quest's objectives of this kind here, done ones included.
    const same = quest.objectives.filter(
      (o) => !o.optional && objectiveKind(o) === kind && inRaid(o) && onMap(o)
    )
    if (same.length <= 1)
      lines.push({
        kind,
        text: shortObjective(objective.description, mapNames),
        done: value,
        total: target,
        squad: squadShared(quest, objective)
      })
    else
      lines.push({
        kind,
        text: KIND_PHRASE[kind]?.(same.length) ?? `${same.length} objectives`,
        done: same.filter((o) => objectiveValue(o, quest.id, objectives) >= objectiveTarget(o)).length,
        total: same.length,
        squad: same.every((o) => squadShared(quest, o))
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
  /** It counts on any map (`isAnyMap`). */
  anyMap: boolean
}

/**
 * The kill objectives of active quests left to do on a map (`mapIds`: its group's, Night Factory with
 * Factory): the ones for this map, then the ones for any map, each set by quest name (the ones naming
 * the fewest maps first). One for any map (`isAnyMap`; `groupOf` gives a map id's group) is listed on
 * every map, even one its list of maps leaves out; one that names maps but not this one isn't listed.
 * `blocked` leaves out quests held up by a key the player doesn't have ("Only quests I can do").
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
    const reachable = reachableSteps(quest, objectives)
    for (const objective of quest.objectives) {
      if (objective.optional || objectiveCategory(objective) !== 'kill' || !inRaid(objective)) continue
      if (!reachable.has(objective.id)) continue
      const done = objectiveValue(objective, quest.id, objectives)
      const total = objectiveTarget(objective)
      if (done >= total) continue
      const anyMap = isAnyMap(objective, groupOf)
      if (!anyMap && !objectiveMapIds(objective).some((id) => mapIds.has(id))) continue
      ;(anyMap ? anywhere : here).push({ quest, objective, done, total, anyMap })
    }
  }
  const byQuest = (a: KillToDo, b: KillToDo): number => a.quest.name.localeCompare(b.quest.name)
  const maps = (k: KillToDo): number => objectiveMapIds(k.objective).length
  return [...here.sort((a, b) => maps(a) - maps(b) || byQuest(a, b)), ...anywhere.sort(byQuest)]
}

/**
 * What a raid on one map could have got done (since 1.68.0), for the popup after it: the plan's steps on
 * that map (its group's key), then the ones for any map, leaving out quests taken off the map (Quests on
 * this map). Build the plan as the map does (`owned`, and `hideBlocked` with Only quests I can do).
 */
export function afterRaidSteps(
  plan: Pick<TodoPlan, 'maps' | 'anyMap'>,
  groupKey: string | undefined,
  hidden: ReadonlySet<string>
): { here: TodoStep[]; anyMap: TodoStep[] } {
  const shown = (s: TodoStep): boolean => !hidden.has(s.quest.id)
  const here = (groupKey ? plan.maps.find((p) => p.group.key === groupKey)?.steps : undefined) ?? []
  const seen = new Set(here.map((s) => `${s.quest.id}:${s.objective.id}`))
  return {
    here: here.filter(shown),
    anyMap: plan.anyMap.filter((s) => shown(s) && !seen.has(`${s.quest.id}:${s.objective.id}`))
  }
}
