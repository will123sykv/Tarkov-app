import type { GameMap } from '../../../shared/questTypes'
import type { MapGroup } from '../../../shared/todo'
import { configFor } from './questUi'

/** Maps shown as one (Night Factory with Factory), and whether the Maps tab can show them. */
export interface Group extends MapGroup {
  /** The Maps tab's key for it, or null when there's no map to show. */
  mapKey: string | null
}

/**
 * Maps by id, with alternate versions (Night Factory) under their main map, which comes first. What it
 * takes to get onto the main map is what the group takes.
 */
export function mapGroups(maps: readonly GameMap[]): Map<string, Group> {
  const byKey = new Map<string, Group>()
  const byId = new Map<string, Group>()
  for (const map of maps) {
    const config = configFor(map)
    const key = config?.key ?? map.normalizedName
    let group = byKey.get(key)
    if (!group) {
      group = { key, name: map.name, mapIds: [], mapKey: config?.key ?? null, accessKeys: [] }
      byKey.set(key, group)
    }
    if (map.normalizedName === key) {
      group.name = map.name
      group.mapIds.unshift(map.id)
      group.accessKeys = map.access?.keyIds ?? []
    } else group.mapIds.push(map.id)
    byId.set(map.id, group)
  }
  return byId
}
