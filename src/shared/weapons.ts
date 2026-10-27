import type { Quest, QuestObjective } from './questTypes'
import { isAnyMap, objectiveMapIds, type MapGroup, type TodoStep } from './todo'

// The guns to bring to each map for kill quests that need particular weapons (the Weapons tab, since
// 1.54.0): up to two per map (since 1.62.0; one before), chosen from every gun that counts for one of its
// kills, or suggested as the pair that covers the most.

/** At most this many guns chosen for a map (since 1.62.0). */
export const MAX_MAP_GUNS = 2

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

/**
 * A kill as the Weapons tab and gun panels name it: by its quest ("Supply Plans · 5 left · any map") or
 * its objective ("Eliminate 5 Scavs with an AKM · 5 left").
 */
export function killText(k: MapKill, by: 'quest' | 'objective' = 'quest'): string {
  const name = by === 'quest' ? k.quest.name : k.objective.description || 'Kills'
  return `${name}${(k.objective.count ?? 1) > 1 ? ` · ${k.left} left` : ''}${k.anyMap ? ' · any map' : ''}`
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

/**
 * The maps the Weapons tab lists, with their kills that need particular weapons: the maps with kills of
 * their own first, then the ones where only kills on any map count, in To do's order; then, when a kill
 * on any map needs particular weapons, every other map (`groups`, by name) for those kills alone (since
 * 1.65.0: a kill on any map is listed somewhere even when no map has anything else to do).
 */
export function weaponMaps<P extends { group: MapGroup; steps: readonly TodoStep[] }>(
  maps: readonly P[],
  anyMap: readonly TodoStep[],
  groups: readonly MapGroup[],
  empty: (group: MapGroup) => P
): { plan: P; kills: MapKill[] }[] {
  const withKills = maps
    .map((p) => ({ plan: p, kills: mapKills(p.steps, anyMap) }))
    .filter((m) => m.kills.length)
  const own = (m: { kills: MapKill[] }): boolean => m.kills.some((k) => !k.anyMap)
  const anywhere = mapKills([], anyMap)
  const listed = new Set(maps.map((p) => p.group.key))
  const rest = anywhere.length
    ? [...new Map(groups.map((g) => [g.key, g])).values()]
        .filter((g) => !listed.has(g.key))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((g) => ({ plan: empty(g), kills: anywhere }))
    : []
  return [...withKills.filter(own), ...withKills.filter((m) => !own(m)), ...rest]
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

/** One gun brought to a map, and the kills it counts for. */
export interface BroughtGun {
  itemId: string
  covers: MapKill[]
}

/**
 * The guns to bring to a map: chosen in the Weapons tab, or suggested; and the kills they do and don't
 * cover between them.
 */
export interface MapGun {
  /** One or two guns, in the order they were chosen. */
  guns: BroughtGun[]
  itemIds: string[]
  chosen: boolean
  covers: MapKill[]
  misses: MapKill[]
}

/**
 * The best guns to bring for `kills` (since 1.62.0): the option that covers the most, then the one that
 * covers the most of what that one doesn't, if any.
 */
export function bestGuns(kills: readonly MapKill[]): GunOption[] {
  const options = gunOptions(kills)
  const picked: GunOption[] = []
  while (picked.length < MAX_MAP_GUNS) {
    const covered = new Set(picked.flatMap((o) => o.covers))
    const adds = (o: GunOption): number => o.covers.filter((k) => !covered.has(k)).length
    let best: GunOption | undefined
    for (const o of options)
      if (!picked.includes(o) && adds(o) > 0 && (!best || adds(o) > adds(best))) best = o
    if (!best) break
    picked.push(best)
  }
  return picked
}

/**
 * The guns for a map's kills: the ones chosen that still count for one of them, otherwise the best pair
 * (or one gun, when it covers them all) as a suggestion. Null when no kill there needs particular weapons.
 */
export function mapGun(kills: readonly MapKill[], chosen: readonly string[] | undefined): MapGun | null {
  const options = gunOptions(kills)
  const picked = (chosen ?? [])
    .map((id) => options.find((o) => o.itemId === id))
    .filter((o) => o !== undefined)
  const guns = picked.length ? picked : bestGuns(kills)
  if (!guns.length) return null
  const covers = kills.filter((k) => guns.some((g) => g.covers.includes(k)))
  return {
    guns: guns.map((g) => ({ itemId: g.itemId, covers: g.covers })),
    itemIds: guns.map((g) => g.itemId),
    chosen: picked.length > 0,
    covers,
    misses: kills.filter((k) => !covers.includes(k))
  }
}

/**
 * The guns chosen for a map after clicking one (since 1.62.0): a chosen one is taken off; another is
 * added, replacing the one chosen first when there are already two.
 */
export function toggleGun(current: readonly string[], itemId: string): string[] {
  if (current.includes(itemId)) return current.filter((id) => id !== itemId)
  return [...current, itemId].slice(-MAX_MAP_GUNS)
}

/**
 * The gun chosen in the Weapons tab that a kill objective will be made with: one chosen for `mapKey`
 * (the map it's shown under) when it counts, otherwise one chosen for another map it's on (by its maps,
 * zones or places; every map for a kill on any map) that counts for it. Null when none is.
 */
export function gunForObjective(
  objective: QuestObjective,
  byMap: Readonly<Record<string, readonly string[]>>,
  groupOf: (mapId: string) => MapGroup | undefined,
  mapKey?: string | null
): string | null {
  const counts = new Set(objective.weapons ?? [])
  if (!counts.size) return null
  // A kill for any map (`isAnyMap`, since 1.63.0 the same rule as every page) is on every map.
  const keys = isAnyMap(objective, (id) => groupOf(id)?.key)
    ? Object.keys(byMap)
    : [
        ...new Set(
          objectiveMapIds(objective)
            .map((id) => groupOf(id)?.key)
            .filter((k) => k !== undefined)
        )
      ]
  const order = mapKey && keys.includes(mapKey) ? [mapKey, ...keys.filter((k) => k !== mapKey)] : keys
  for (const key of order) for (const id of byMap[key] ?? []) if (counts.has(id)) return id
  return null
}

/**
 * The maps where a quest has a kill a gun counts for (since 1.56.0), by key, in the order given: where
 * bringing the gun picked for the quest on one map would do for it on the others too. A kill on any map
 * is on every map listed.
 */
export function questGunMaps(
  maps: readonly { key: string; kills: readonly MapKill[] }[],
  questId: string,
  itemId: string
): string[] {
  return maps
    .filter((m) => m.kills.some((k) => k.quest.id === questId && k.itemIds.includes(itemId)))
    .map((m) => m.key)
}

/** Which of the guns brought (if any) a kill objective can be made with. */
export function gunFor(
  objective: QuestObjective,
  itemIds: readonly string[] | null | undefined
): string | null {
  return itemIds?.find((id) => objective.weapons?.includes(id)) ?? null
}

/**
 * For the kill banner over a map (since 1.57.0): how the guns brought do for each kill objective. 'gun'
 * when one of them is one of the weapons the kill has to be made with, 'other' when the kill needs other
 * particular weapons, null when any weapon will do (or there's no gun).
 */
export function killForGun(
  objective: QuestObjective,
  itemIds: readonly string[] | null | undefined
): 'gun' | 'other' | null {
  if (!itemIds?.length || !objective.weapons?.length) return null
  return gunFor(objective, itemIds) ? 'gun' : 'other'
}
