import type { QuestStatus } from '../../../shared/questProgress'
import type { GameMap, MapConfig, QuestObjective } from '../../../shared/questTypes'
import mapConfigData from '../data/mapConfigs.json'

export const MAP_CONFIGS = (mapConfigData as unknown as { maps: MapConfig[] }).maps

export const STATUS_LABEL: Record<QuestStatus, string> = {
  available: 'Available',
  active: 'Active',
  locked: 'Locked',
  completed: 'Completed',
  failed: 'Failed'
}

export const STATUS_BADGE: Record<QuestStatus, string> = {
  available: 'warn',
  active: 'info',
  locked: 'muted',
  completed: 'ok',
  failed: 'bad'
}

/** tarkov.dev's interactive projection for a map (alternate versions like Night Factory share one). */
export function configFor(map: Pick<GameMap, 'normalizedName'>): MapConfig | null {
  return (
    MAP_CONFIGS.find((c) => c.key === map.normalizedName || c.altMaps.includes(map.normalizedName)) ?? null
  )
}

/** The map an objective can be shown on: the first with a zone or quest-item location and a projection. */
export function objectiveMap(
  objective: QuestObjective,
  mapsById: ReadonlyMap<string, GameMap>
): GameMap | null {
  const candidates = [...objective.zones.map((z) => z.map), ...objective.locations.map((l) => l.map)]
  for (const id of candidates) {
    const map = mapsById.get(id)
    if (map && configFor(map)) return map
  }
  return null
}

/** `https://assets.tarkov.dev/…` → the app's cached copy. */
export function mapAsset(url: string): string {
  return url.replace(/^https:\/\/assets\.tarkov\.dev\//, 'tarkov-map://assets/')
}
