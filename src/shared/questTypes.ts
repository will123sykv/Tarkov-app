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
  /** Keys it needs: one list per lock, any key in a list opens it. */
  requiredKeys: string[][]
}

/** An item and how many of it. */
export interface ItemCount {
  itemId: string
  count: number
}

/** What a quest gives when it's done (or when it's accepted). */
export interface QuestRewards {
  /** Money included. */
  items: ItemCount[]
  traderStanding: { traderId: string; standing: number }[]
  /** Items a trader starts selling, at a loyalty level. */
  offerUnlocks: { traderId: string; level: number; itemId: string }[]
  /** Hideout crafts it unlocks: the station's name and level, and what the craft makes. */
  craftUnlocks: { station: string; level: number; itemId: string; count: number }[]
  skills: { name: string; level: number }[]
  /** Trader ids. */
  traderUnlocks: string[]
  /** Anything else, by name (achievements, clothing…). */
  other: string[]
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
  /** Keys the quest needs, per map (tarkov.dev's summary of its objectives' keys). */
  neededKeys: { map: string; keyIds: string[] }[]
  rewards: QuestRewards
  /** What the trader hands over when the quest is accepted. */
  startRewards: QuestRewards
  /** The quest's picture in the game. */
  imageLink: string | null
}

export interface MapExtract {
  name: string
  /** 'pmc', 'scav' or 'shared'. */
  faction: string
  position: Vec3
  outline: Vec3[]
  /** What using it costs: roubles for a vehicle, or an item (secret extracts). */
  transferItem: { itemId: string; count: number } | null
}

/** A spawn point bosses can use, with the bosses that can appear in its zone. */
export interface BossSpawn {
  position: Vec3
  zone: string
  /** `chance`: of the boss spawning in a raid; `here`: of it using this zone when it does. */
  bosses: { name: string; chance: number; here: number }[]
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
  bossSpawns: BossSpawn[]
  /** Where sniper scavs sit, one point per sniper zone. */
  snipers: Vec3[]
}

export interface QuestTrader {
  id: string
  name: string
  /** The player level each loyalty level needs. */
  levels: { level: number; playerLevel: number }[]
  /** The trader's portrait. */
  imageLink: string | null
}

/** What one level of a hideout station takes to build. */
export interface HideoutLevel {
  level: number
  /** Seconds. */
  constructionTime: number
  items: { itemId: string; count: number; foundInRaid: boolean }[]
  /** Other stations it needs, at a level. */
  stations: { stationId: string; level: number }[]
  /** Trader loyalty levels it needs. */
  traders: { traderId: string; level: number }[]
  skills: { name: string; level: number }[]
}

export interface HideoutStation {
  id: string
  name: string
  normalizedName: string
  imageLink: string | null
  levels: HideoutLevel[]
}

export interface QuestDataset {
  dataMode: DataMode
  fetchedAt: number
  quests: Quest[]
  maps: GameMap[]
  traders: QuestTrader[]
  /** Hideout stations (empty when tarkov.dev's hideout data couldn't be fetched). */
  stations: HideoutStation[]
  /**
   * Names of quests tarkov.dev leaves out of its quest list (story chapters, new or event quests),
   * by id, so ones the logs mention can still be named.
   */
  otherQuestNames: Record<string, string>
}

/** A picture in a quest's guide on the Escape from Tarkov wiki. */
export interface GuideImage {
  /** The wiki's file name. */
  file: string
  caption: string
  /** At most 800 px wide. */
  thumb: string
  full: string
  width: number
  height: number
  /** The file's page on the wiki (its author and licence). */
  page: string
}

/** A paragraph, sub-heading or list item of a guide, as plain text. */
export interface GuideBlock {
  kind: 'p' | 'h' | 'li'
  text: string
}

/** The "Guide" section of a quest's page on the Escape from Tarkov wiki (CC BY-SA 3.0). */
export interface QuestGuide {
  /** The wiki page's title. */
  title: string
  url: string
  blocks: GuideBlock[]
  images: GuideImage[]
  fetchedAt: number
}

export interface QuestGuideState {
  guide: QuestGuide | null
  error: string | null
}

export interface QuestDataState {
  dataset: QuestDataset | null
  fromCache: boolean
  error: string | null
  loading: boolean
}

/** A place name on a map, as tarkov.dev places it. */
export interface MapLabel {
  text: string
  /** Game [x, z]. */
  position: [number, number]
  /** Text size in percent of normal. */
  size: number
  /** Degrees clockwise. */
  rotation: number
  /** The heights (game y) the label belongs to, when it's on one floor; null when open-ended. */
  bottom: number | null
  top: number | null
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
  labels: MapLabel[]
  author: string
  authorLink: string
}
