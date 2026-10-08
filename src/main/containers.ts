import type { ContainerLootData } from '../shared/containerData'
import type { ContainerCatalog, ContainerLoot } from '../shared/types'

/**
 * Serves the bundled container loot tables: which containers exist on which maps, and for a
 * map (or all maps combined) the chance of each item among what a container rolls.
 */
export function createContainerService(data: ContainerLootData) {
  const cache = new Map<string, ContainerLoot[]>()

  const catalog: ContainerCatalog = {
    source: data.source,
    sourceUrl: data.sourceUrl,
    license: data.license,
    dataAsOf: data.dataAsOf,
    maps: data.maps,
    containers: data.containers.map((c) => ({
      id: c.id,
      name: c.name,
      mapIds: Object.keys(c.maps),
      templates: c.templates ?? []
    }))
  }

  function buildLoot(mapId: string | null): ContainerLoot[] {
    const result: ContainerLoot[] = []
    for (const container of data.containers) {
      const tables = mapId === null ? Object.values(container.maps) : [container.maps[mapId]].filter(Boolean)
      if (tables.length === 0) continue

      // Summing raw weights across maps weights each map by how often the container was observed.
      const weights = new Map<number, number>()
      let observations = 0
      let countTotal = 0
      for (const table of tables) {
        observations += table.observations
        countTotal += table.expectedCount * table.observations
        for (let i = 0; i < table.loot.length; i += 2) {
          weights.set(table.loot[i], (weights.get(table.loot[i]) ?? 0) + table.loot[i + 1])
        }
      }
      let total = 0
      for (const weight of weights.values()) total += weight
      if (total <= 0) continue

      result.push({
        id: container.id,
        name: container.name,
        expectedCount: observations > 0 ? countTotal / observations : tables[0].expectedCount,
        items: [...weights.entries()]
          .map(([index, weight]) => ({ id: data.items[index], chance: weight / total }))
          .sort((a, b) => b.chance - a.chance)
      })
    }
    return result
  }

  return {
    catalog: (): ContainerCatalog => catalog,
    /** Loot per container for one map, or combined across maps for null. */
    loot(mapId: string | null): ContainerLoot[] {
      const key = mapId ?? '*'
      let loot = cache.get(key)
      if (!loot) {
        loot = buildLoot(mapId)
        cache.set(key, loot)
      }
      return loot
    }
  }
}

export type ContainerService = ReturnType<typeof createContainerService>
