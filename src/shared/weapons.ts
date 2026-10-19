import type { Quest, QuestObjective } from './questTypes'
import { sameItems, type MapGroup, type TodoStep, type WeaponsToBring } from './todo'

// The gun to bring to each map for kill quests that need particular weapons (the Weapons tab, since
// 1.54.0): one per map, chosen from every gun that counts for one of its kills, or suggested as the one
// that covers the most.

/** A kill objective on a map (or on any map) that has to be made with one of particular weapons. */
export interface MapKill {
  quest: Quest
  objective: QuestObjective
  /** Kills still to make. */
  left: number
  /** The guns that count: any one of them. */
  itemIds: string[]
  /** A kill on any map, so on this one too. */
  anyMap: boolean
}

/** A map's kill objectives that need particular weapons, then the ones on any map. */
export function mapKills(steps: readonly TodoStep[], anyMap: readonly TodoStep[]): MapKill[] {
  const kills: MapKill[] = []
  const add = (step: TodoStep, onAnyMap: boolean): void => {
    const itemIds = step.objective.weapons ?? []
    if (!itemIds.length || kills.some((k) => k.objective === step.objective && k.quest === step.quest)) return
    kills.push({ quest: step.quest, objective: step.objective, left: step.left, itemIds, anyMap: onAnyMap })
  }
  for (const step of steps) add(step, false)
  for (const step of anyMap) add(step, true)
  return kills
}

/** A gun that counts for some of a map's kills, and which. */
export interface GunOption {
  itemId: string
  covers: MapKill[]
}

/**
 * Every gun that counts for one of `kills`: the ones that cover the most first, then the ones for more
 * of the map's own kills (not any map's), then in the order the kills list them.
 */
export function gunOptions(kills: readonly MapKill[]): GunOption[] {
  const options: GunOption[] = []
  for (const kill of kills)
    for (const itemId of kill.itemIds) {
      const option = options.find((o) => o.itemId === itemId)
      if (!option) options.push({ itemId, covers: [kill] })
      else if (!option.covers.includes(kill)) option.covers.push(kill)
    }
  const own = (o: GunOption): number => o.covers.filter((k) => !k.anyMap).length
  // A stable sort keeps the kills' order for ties.
  return options.sort((a, b) => b.covers.length - a.covers.length || own(b) - own(a))
}

/** The gun to bring to a map: chosen in the Weapons tab, or suggested; and the kills it does and doesn't cover. */
export interface MapGun {
  itemId: string
  chosen: boolean
  covers: MapKill[]
  misses: MapKill[]
}

/**
 * The gun for a map's kills: the one chosen when it still counts for one of them, otherwise the option
 * that covers the most, as a suggestion. Null when no kill there needs particular weapons.
 */
export function mapGun(kills: readonly MapKill[], chosen: string | undefined): MapGun | null {
  const options = gunOptions(kills)
  const picked = chosen ? options.find((o) => o.itemId === chosen) : undefined
  const option = picked ?? options[0]
  if (!option) return null
  return {
    itemId: option.itemId,
    chosen: picked !== undefined,
    covers: option.covers,
    misses: kills.filter((k) => !option.covers.includes(k))
  }
}

/** For the kills a map's gun misses: the weapons that would do, once per set (as To do's Bring lists them). */
export function missedWeapons(gun: MapGun | null): WeaponsToBring[] {
  const lists: WeaponsToBring[] = []
  for (const k of gun?.misses ?? []) {
    const entry = lists.find((w) => sameItems(w.itemIds, k.itemIds))
    if (!entry) lists.push({ itemIds: k.itemIds, quests: [k.quest], ...(k.anyMap ? { anyMap: true } : {}) })
    else {
      if (!entry.quests.includes(k.quest)) entry.quests.push(k.quest)
      // Also for a kill on this map: not only any map.
      if (!k.anyMap) delete entry.anyMap
    }
  }
  return lists
}

/**
 * The gun chosen in the Weapons tab that a kill objective will be made with: one chosen for a map it's
 * on (any map, for a kill on any map) that counts for it. Null when none is.
 */
export function gunForObjective(
  objective: QuestObjective,
  byMap: Readonly<Record<string, string>>,
  groupOf: (mapId: string) => MapGroup | undefined
): string | null {
  const counts = new Set(objective.weapons ?? [])
  if (!counts.size) return null
  const keys = objective.maps.length
    ? [...new Set(objective.maps.map((id) => groupOf(id)?.key).filter((k) => k !== undefined))]
    : Object.keys(byMap)
  for (const key of keys) if (counts.has(byMap[key])) return byMap[key]
  return null
}
