import type { DataMode } from './types'

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** An area on a map an objective refers to (visit, mark, plant…). */
export interface QuestZone {
  /** Map id. */
  map: string
  position: Vec3
  /** Ground outline, when the zone has one. */
  outline: Vec3[]
}

export interface QuestObjective {
  id: string
  type: string
  description: string
  optional: boolean
  count: number | null
  /** Map ids the objective can be done on (empty: any map). */
  maps: string[]
  /** Accepted items (any one of them counts), for give/find/plant objectives. */
  items: string[]
  foundInRaid: boolean
  /** A quest-only item to find, hand over or plant. */
  questItem: { id: string; name: string } | null
  zones: QuestZone[]
  /** Where a quest item can spawn. */
  locations: { map: string; positions: Vec3[] }[]
  /** For "reach loyalty level N with a trader" objectives. */
  traderLevel: { traderId: string; level: number } | null
}

export type RequirementStatus = 'complete' | 'active' | 'failed'

/** A trader loyalty level or reputation the quest needs before it's offered. */
export interface TraderRequirement {
  traderId: string
  type: 'level' | 'reputation'
  /** '>=', '<=', '<' or '>'. */
  compareMethod: string
  value: number
}

export interface Quest {
  id: string
  name: string
  normalizedName: string
  traderId: string
  wikiLink: string | null
  /**
   * tarkov.dev's level: the earliest the quest can be available, counting the loyalty levels and
   * earlier quests it needs (see `levelRequirement` for the level the game itself shows).
   */
  minPlayerLevel: number
  /** Other quests and the status each must be in before this one unlocks. */
  requires: { questId: string; status: RequirementStatus[] }[]
  traderRequirements: TraderRequirement[]
  objectives: QuestObjective[]
  /** The quest's main map, if it has one. */
  map: string | null
  kappaRequired: boolean
  lightkeeperRequired: boolean
  /** 'Any', 'USEC' or 'BEAR'. */
  faction: string
  experience: number
}

export interface MapExtract {
  name: string
  /** 'pmc', 'scav' or 'shared'. */
  faction: string
  position: Vec3
  outline: Vec3[]
}

export interface GameMap {
  id: string
  name: string
  normalizedName: string
  /** The game's location id, as the logs write it (e.g. `bigmap`). */
  nameId: string
  extracts: MapExtract[]
  /** Player spawn points. */
  spawns: { position: Vec3; sides: string[] }[]
  transits: { name: string; position: Vec3 }[]
}

export interface QuestTrader {
  id: string
  name: string
  /** The player level each loyalty level needs. */
  levels: { level: number; playerLevel: number }[]
}

export interface QuestDataset {
  dataMode: DataMode
  fetchedAt: number
  quests: Quest[]
  maps: GameMap[]
  traders: QuestTrader[]
  /**
   * Names of quests tarkov.dev leaves out of its quest list (story chapters, new or event quests),
   * by id, so ones the logs mention can still be named.
   */
  otherQuestNames: Record<string, string>
}

export interface QuestDataState {
  dataset: QuestDataset | null
  fromCache: boolean
  error: string | null
  loading: boolean
}

/** One of tarkov.dev's interactive map projections (src/data/maps.json, MIT). */
export interface MapConfig {
  key: string
  altMaps: string[]
  minZoom: number
  maxZoom: number
  tileSize: number
  /** [scaleX, marginX, scaleY, marginY]. */
  transform: [number, number, number, number]
  coordinateRotation: number
  bounds: [[number, number], [number, number]]
  svgBounds: [[number, number], [number, number]] | null
  tilePath: string | null
  svgPath: string | null
  svgLayer: string | null
  /** SVG groups of other floors, hidden so only the ground level shows. */
  otherLayers: string[]
  author: string
  authorLink: string
}
