import type { GameMap, Spot, Vec3 } from './questTypes'
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

/** The area where an item's spawns are densest on a map, drawn as a circle. */
export interface FindArea {
  centre: Vec3
  /** Metres. */
  radius: number
  /** Loose spots and containers that can hold it inside the circle. */
  loose: number
  containers: number
}

/**
 * How far around a spot counts as its area on a map: 7% of the map's larger side, from 12 m (Factory)
 * to 90 m. `bounds` is the map's [[x, z], [x, z]].
 */
export function findRadius(bounds: [[number, number], [number, number]] | null): number {
  if (!bounds) return 40
  const [[x0, z0], [x1, z1]] = bounds
  return Math.min(90, Math.max(12, 0.07 * Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0))))
}

/**
 * The area where an item turns up most: every loose spot counts 1 and every container that can hold
 * it counts its chance; the circle goes where the most of that lies within `radius` metres, centred
 * on the middle of what it holds and only as big as it needs to be. Null when it's nowhere here.
 */
export function densestArea(where: WhereToFind, radius: number): FindArea | null {
  const points = [
    ...where.loose.map((spot) => ({ spot, weight: 1, loose: true })),
    ...where.containers.flatMap((c) => c.spots.map((spot) => ({ spot, weight: c.chance, loose: false })))
  ]
  if (!points.length) return null
  const flat = (a: Spot, b: Spot): number => Math.hypot(a[0] - b[0], a[2] - b[2])
  let best: { inside: typeof points; weight: number; spread: number } | null = null
  for (const candidate of points) {
    const inside = points.filter((p) => flat(p.spot, candidate.spot) <= radius)
    const weight = inside.reduce((sum, p) => sum + p.weight, 0)
    const spread = inside.reduce((sum, p) => sum + flat(p.spot, candidate.spot), 0) / inside.length
    if (
      !best ||
      weight > best.weight + 1e-9 ||
      (Math.abs(weight - best.weight) <= 1e-9 && spread < best.spread)
    )
      best = { inside, weight, spread }
  }
  const { inside, weight } = best!
  const x = inside.reduce((sum, p) => sum + p.spot[0] * p.weight, 0) / weight
  const z = inside.reduce((sum, p) => sum + p.spot[2] * p.weight, 0) / weight
  // The floor most of it is on: the weighted median height.
  const byHeight = [...inside].sort((a, b) => a.spot[1] - b.spot[1])
  let acc = 0
  const y = byHeight.find((p) => (acc += p.weight) >= weight / 2)!.spot[1]
  const centre: Spot = [x, y, z]
  const reach = Math.max(...inside.map((p) => flat(p.spot, centre)))
  return {
    centre: { x, y, z },
    radius: Math.min(radius, Math.max(radius / 2, reach + radius * 0.15)),
    loose: inside.filter((p) => p.loose).length,
    containers: inside.filter((p) => !p.loose).length
  }
}
