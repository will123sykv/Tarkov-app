import type { GameMap } from '../../../shared/questTypes'
import type { MapPlace } from '../../../shared/storyPlaces'
import { labelAnchor } from './mapMarkers'
import { configFor } from './questUi'

// What story steps and the logs' raids are matched against on each map.

/** The named spots on each map (place names, extracts, transits), for the places story steps name. */
export function mapPlaces(maps: readonly GameMap[]): Map<string, MapPlace[]> {
  const result = new Map<string, MapPlace[]>()
  // "On Shoreline or Lighthouse" names the map, not Shoreline's Lighthouse extract.
  const mapNames = new Set(maps.map((m) => m.name.toLowerCase()))
  for (const map of maps) {
    const places: MapPlace[] = []
    for (const label of configFor(map)?.labels ?? []) {
      const at = labelAnchor(label)
      places.push({ name: label.text, position: { x: at.x, y: at.y ?? 0, z: at.z } })
    }
    for (const e of map.extracts) places.push({ name: e.name, position: e.position })
    for (const t of map.transits) {
      const to = /^transit to (.+)$/i.exec(t.name)?.[1]
      places.push({ name: t.name, position: t.position, aliases: to ? [`${to} transit`] : [] })
    }
    result.set(
      map.id,
      places.filter((p) => !mapNames.has(p.name.toLowerCase()))
    )
  }
  return result
}

/** The maps a raid on a location counts for: the map, and its other versions (Night Factory and Factory). */
export function raidMapLookup(maps: readonly GameMap[]): (location: string) => readonly string[] {
  const byLocation = new Map<string, string[]>()
  for (const map of maps) {
    const config = configFor(map)
    const same = config ? maps.filter((m) => configFor(m) === config).map((m) => m.id) : [map.id]
    byLocation.set(map.nameId.toLowerCase(), same)
  }
  return (location) => byLocation.get(location.toLowerCase()) ?? []
}
