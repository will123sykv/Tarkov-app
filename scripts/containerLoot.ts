import type { ContainerLootData, ContainerMapLoot } from '../src/shared/containerData'

/** One map's SPT `staticLoot.json`: container template id → what it rolls. */
export type StaticLootFile = Record<
  string,
  {
    itemcountDistribution?: { count: number; relativeProbability: number }[]
    itemDistribution?: { tpl: string; relativeProbability: number }[]
  }
>

export interface MapLootInput {
  map: { id: string; name: string }
  loot: StaticLootFile
}

export type SourceMeta = Pick<ContainerLootData, 'source' | 'sourceUrl' | 'license' | 'generatedAt'>

/** Event-only containers that would clutter the list the rest of the year. */
const SEASONAL = /festive|halloween|christmas|new year/i

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Month an item id was created, from the timestamp in its first 8 hex digits. */
export function idMonth(id: string): string | null {
  if (!/^[0-9a-f]{24}$/.test(id)) return null
  const date = new Date(parseInt(id.slice(0, 8), 16) * 1000)
  return date.toISOString().slice(0, 7)
}

interface Accumulator {
  name: string
  templates: Set<string>
  maps: Map<string, { observations: number; countTotal: number; weights: Map<string, number> }>
}

/**
 * Merge per-map SPT loot tables into one compact structure. Container variants that share a
 * display name (several "Jacket" or "Weapon box" templates) are merged by summing their raw
 * weights, so each variant counts as often as it was observed.
 */
export function aggregateStaticLoot(
  perMap: MapLootInput[],
  locale: Record<string, string>,
  meta: SourceMeta
): ContainerLootData {
  const containers = new Map<string, Accumulator>()

  for (const { map, loot } of perMap) {
    for (const [tpl, table] of Object.entries(loot)) {
      const name = locale[`${tpl} Name`] ?? tpl
      if (SEASONAL.test(name) || !table.itemDistribution?.length) continue
      const id = slugify(name)
      const container = containers.get(id) ?? { name, templates: new Set<string>(), maps: new Map() }
      containers.set(id, container)
      container.templates.add(tpl)
      const entry = container.maps.get(map.id) ?? { observations: 0, countTotal: 0, weights: new Map() }
      container.maps.set(map.id, entry)

      for (const { count, relativeProbability } of table.itemcountDistribution ?? []) {
        entry.observations += relativeProbability
        entry.countTotal += count * relativeProbability
      }
      for (const { tpl: itemId, relativeProbability } of table.itemDistribution) {
        if (relativeProbability > 0) {
          entry.weights.set(itemId, (entry.weights.get(itemId) ?? 0) + relativeProbability)
        }
      }
    }
  }

  const itemIds = [
    ...new Set(
      [...containers.values()].flatMap((c) => [...c.maps.values()].flatMap((m) => [...m.weights.keys()]))
    )
  ].sort()
  const index = new Map(itemIds.map((id, i) => [id, i]))
  const months = itemIds.map(idMonth).filter((m): m is string => m !== null)

  return {
    ...meta,
    dataAsOf: months.length ? months.reduce((a, b) => (a > b ? a : b)) : 'unknown',
    maps: perMap.map(({ map }) => map),
    items: itemIds,
    containers: [...containers.entries()]
      .sort(([, a], [, b]) => a.name.localeCompare(b.name))
      .map(([id, container]) => ({
        id,
        name: container.name,
        templates: [...container.templates].sort(),
        maps: Object.fromEntries(
          [...container.maps.entries()].map(([mapId, entry]): [string, ContainerMapLoot] => [
            mapId,
            {
              observations: entry.observations,
              expectedCount: entry.observations ? round(entry.countTotal / entry.observations, 3) : 1,
              loot: [...entry.weights.entries()]
                .sort((a, b) => b[1] - a[1])
                .flatMap(([itemId, weight]) => [index.get(itemId)!, weight])
            }
          ])
        )
      }))
  }
}

function round(n: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}
