import type { GameMap, Spot } from './questTypes'
import type { ContainerCatalog, ContainerLoot } from './types'

// Where an item can be found on a map: the loose loot spots it can spawn at (tarkov.dev's map data),
// and the containers likely to hold it (the bundled container loot tables), with where they stand.

export interface ContainerOdds {
  /** The container tables' id and name ("toolbox", "Toolbox"). */
  id: string
  name: string
  /** Chance one search of it turns up at least one. */
  chance: number
  /** Where containers of this kind are on the map (none when tarkov.dev doesn't place them). */
  spots: Spot[]
}

export interface WhereToFind {
  /** Loose loot spots it can spawn at. */
  loose: Spot[]
  /** Containers that can hold it, likeliest first. */
  containers: ContainerOdds[]
}

/** Chances below this aren't worth naming. */
const MIN_CHANCE = 0.001

/** The container tables' id for a map: the game's location id, lower case (`bigmap`, `rezervbase`). */
export const containerMapId = (map: Pick<GameMap, 'nameId'>): string => map.nameId.toLowerCase()

/**
 * Where to look for an item on one map. `loot` is the container tables for that map
 * (`containerMapId`); `catalog` says which game templates make up each kind of container.
 */
export function whereToFind(
  itemId: string,
  map: Pick<GameMap, 'looseLoot' | 'containers'>,
  loot: readonly ContainerLoot[],
  catalog: ContainerCatalog['containers']
): WhereToFind {
  const loose = (map.looseLoot?.items[itemId] ?? []).map((i) => map.looseLoot.spots[i]).filter(Boolean)
  const templates = new Map(catalog.map((c) => [c.id, c.templates]))
  const containers: ContainerOdds[] = []
  for (const c of loot) {
    const p = c.items.find((i) => i.id === itemId)?.chance ?? 0
    if (p <= 0) continue
    const chance = 1 - (1 - p) ** Math.max(1, c.expectedCount)
    if (chance < MIN_CHANCE) continue
    const spots = (templates.get(c.id) ?? []).flatMap((t) => map.containers?.[t] ?? [])
    containers.push({ id: c.id, name: c.name, chance, spots })
  }
  containers.sort((a, b) => b.chance - a.chance || a.name.localeCompare(b.name))
  return { loose, containers }
}

/**
 * How many chances a map gives to find it, to compare maps: its loose spots, plus each container
 * of a kind that can hold it weighted by the chance it does.
 */
export function findScore(where: WhereToFind): number {
  return where.loose.length + where.containers.reduce((sum, c) => sum + c.chance * c.spots.length, 0)
}

/** "6%", "0.4%": a chance as the panel shows it. */
export function formatChance(chance: number): string {
  const percent = chance * 100
  return `${percent >= 1 ? Math.round(percent) : percent.toFixed(1)}%`
}
