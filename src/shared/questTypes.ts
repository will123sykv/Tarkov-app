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
  /**
   * Story steps only, which have no zones of their own: `rough` for the place the step names
   * (`place` says which), `mine` for a pin the player put there.
   */
  source?: 'rough' | 'mine'
  place?: string
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
  /** For "reach level N" objectives. Since 1.12.0. */
  playerLevel: number | null
  /** For objectives that another quest be started, finished or failed. Since 1.12.0. */
  questStatus: { questId: string; status: RequirementStatus[] } | null
  /** Story chapters: "visit the map N times", counted from the raids in the logs. */
  visits?: boolean
  /** Keys it needs: one list per lock, any key in a list opens it. */
  requiredKeys: string[][]
  /** A kill to make with one of these weapons (item ids), when it says. Since 1.39.0. */
  weapons?: string[]
  /** Story chapters: how deep in the list it sits (0: a step of its own, 1: part of the step above). */
  depth?: number
  /** Story chapters: the path it's on, when the chapter branches (e.g. "If you kept the armored case"). */
  branch?: string | null
  /**
   * From the wiki (since 1.36.0): `added` for a step tarkov.dev leaves out (ticked by hand), or what
   * tarkov.dev had before the wiki corrected it.
   */
  wiki?: { added: true } | { was: string }
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
  /** For a story chapter: its blurb and what starts it. */
  story?: { description: string; howItStarts: string }
  /** For a quest read from the wiki (an event quest tarkov.dev doesn't list). Since 1.22.0. */
  wiki?: {
    title: string
    event: boolean
    past: boolean
    description: string
    /** Listed by itself: a quest only the wiki has, not one the player added. Since 1.37.0. */
    listed?: boolean
    /** Has the game's own id (its name matched the game's), so the logs tick it off. Since 1.37.0. */
    logged?: boolean
  }
  /** What the wiki corrected in tarkov.dev's data, and its notes (conditions, other maps). Since 1.36.0. */
  corrections?: { changes: string[]; notes: string[] }
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
  /** Locked doors and trunks, with the key that opens each. Since 1.17.0. */
  locks: MapLock[]
  /** Loose loot spots where keys can spawn. Since 1.17.0. */
  keySpawns: KeySpawn[]
  /** Who can raid it: player levels, and items needed to get in. Since 1.17.0. */
  access: MapAccess
  /** Loose loot spots and what can spawn at each, to find an item. Since 1.28.0. */
  looseLoot: LooseLoot
  /** Where the loot containers are, by the game's container template id. Since 1.28.0. */
  containers: Record<string, Spot[]>
}

/** A position kept compactly: [x, y, z], to a tenth of a metre. */
export type Spot = [number, number, number]

/** Loose loot spots, and for each item the spots it can spawn at (indexes into `spots`). */
export interface LooseLoot {
  spots: Spot[]
  items: Record<string, number[]>
}

/** A locked door or trunk, and the key that opens it. */
export interface MapLock {
  keyId: string
  /** 'door' or 'trunk' (a car boot, a safe…). */
  kind: string
  position: Vec3
}

/** A loose loot spot where a key can spawn. */
export interface KeySpawn {
  position: Vec3
  /** The keys that can spawn there. */
  keyIds: string[]
  /** How many different items can spawn there in all (1: only that key). */
  items: number
}

export interface MapAccess {
  /** The player levels that can enter (null: any). */
  minPlayerLevel: number | null
  maxPlayerLevel: number | null
  /** Items needed to get in (any one of them, used up or not), e.g. the Labs access keycard. */
  keyIds: string[]
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

/** Something a hideout station makes. What it makes counts as found in raid. */
export interface HideoutCraft {
  id: string
  stationId: string
  /** The station level it takes. */
  level: number
  /** Seconds. */
  duration: number
  /** Used up (bought ones do). */
  inputs: { itemId: string; count: number }[]
  /** Needed, but not used up. */
  tools: string[]
  outputs: { itemId: string; count: number }[]
  /** A quest to finish before it can be made. */
  questId: string | null
}

/** A trade a trader offers: items for an item. Bartered items aren't found in raid. Since 1.27.0. */
export interface TraderBarter {
  id: string
  traderId: string
  /** The loyalty level it takes. */
  level: number
  /** A quest to finish before the trader offers it. */
  questId: string | null
  /** What it takes (money counts too). */
  inputs: { itemId: string; count: number }[]
  /** What the trader gives. */
  outputs: { itemId: string; count: number }[]
}

/** One step of a story chapter, as the wiki lists it. */
export interface StoryObjective {
  /** The step's text, slugged (`#2`… on repeats), so progress survives the list being refreshed. */
  id: string
  text: string
  optional: boolean
  /** 0 for a step of its own, 1+ for part of the step above. */
  depth: number
  /** How many it takes (items to hand over, targets…), when more than one. */
  count: number | null
  /** For a hand-over (or a step to stash items): the items linked in the step, by name (matched to items in the app). */
  itemNames: string[]
  /** The keys it needs, by name: the ones its text links to (not when the step is to get one). Since 1.38.0. */
  keyNames?: string[]
  handOver: boolean
  foundInRaid: boolean
  /** The path it's on, when the chapter branches. */
  branch: string | null
  /** The maps it's done on (ids), from the step or its part of the page's guide. Since 1.12.0. */
  maps: string[]
  /** That part of the guide, as plain text (shortened), for the places it names. */
  guide: string | null
  /** "Survive and extract from X or visit X N times": `count` is N. */
  visits: boolean
  /** "Reach Loyalty Level N with a trader", by the trader's name. */
  loyalty: { trader: string; level: number } | null
}

/** A chapter of the main story (Tour, Falling Skies…), from its page on the wiki. */
export interface StoryChapter {
  /** The game's quest id (as the logs write it) when tarkov.dev names it, else `story-<name>`. */
  id: string
  name: string
  wikiLink: string
  description: string
  /** What starts the chapter, as plain text (one line per point). */
  howItStarts: string
  imageLink: string | null
  objectives: StoryObjective[]
}

/**
 * A quest read from its page on the Escape from Tarkov wiki: event quests (Fog of War…) that
 * tarkov.dev doesn't list, added by the player. Since 1.22.0.
 */
export interface WikiQuest {
  /** The page's title: how it's added and kept. */
  title: string
  name: string
  wikiLink: string
  /** Only given during an event. */
  event: boolean
  /** From an event that's over (the wiki's historical content). */
  past: boolean
  /** Who gives it, by name. */
  trader: string | null
  /** Map ids from the infobox's location. */
  maps: string[]
  /** The trader's loyalty level it needs. */
  loyaltyLevel: number | null
  /** Pages of the quests before and after it. */
  previous: string[]
  /**
   * How the quests before it unlock it: all completed, any one ("A or B"), or just accepted ("Accept
   * [[A]]"). Since 1.37.0 (missing: all).
   */
  previousMode?: 'all' | 'any' | 'accept'
  leadsTo: string[]
  /** "Must be level N to start this quest". Since 1.37.0. */
  level?: number | null
  /** Only in the seasonal mode (PvP Season), or after a quest that is. Since 1.37.0. */
  season?: boolean
  kappa: boolean
  /** What the trader says when giving it. */
  description: string
  objectives: StoryObjective[]
  rewards: {
    experience: number
    money: { currency: '₽' | '$' | '€'; amount: number }[]
    /** By name, matched to items in the app. */
    items: { name: string; count: number }[]
    standing: { trader: string; value: number }[]
    /** Anything else (skill levels, unlocks), as text. */
    other: string[]
  }
}

/** An event quest the wiki lists, for picking. */
export interface WikiQuestEntry {
  title: string
  /** From an event that's over. */
  past: boolean
}

export interface QuestDataset {
  dataMode: DataMode
  fetchedAt: number
  quests: Quest[]
  maps: GameMap[]
  traders: QuestTrader[]
  /** Hideout stations (empty when tarkov.dev's hideout data couldn't be fetched). */
  stations: HideoutStation[]
  /** What the stations can make (empty when it couldn't be fetched). Since 1.21.0. */
  crafts: HideoutCraft[]
  /** Traders' barter trades (empty when they couldn't be fetched). Since 1.27.0. */
  barters: TraderBarter[]
  /**
   * Names of quests tarkov.dev leaves out of its quest list (story chapters, new or event quests),
   * by id, so ones the logs mention can still be named.
   */
  otherQuestNames: Record<string, string>
  /** The main story's chapters, from the wiki (empty when it couldn't be reached). Since 1.11.0. */
  storyChapters: StoryChapter[]
  /** What each quest's wiki page says, by quest id, to correct tarkov.dev's data with. Since 1.36.0. */
  wikiFacts: Record<string, WikiQuestFacts>
  /** Quests only the wiki has (not events, not the Arena's), read from their pages. Since 1.37.0. */
  wikiOnlyQuests: WikiQuest[]
}

/** A tarkov.dev quest's page on the wiki, read for what can correct tarkov.dev's data. Since 1.36.0. */
export interface WikiQuestFacts {
  title: string
  /** "Must be level N to start this quest". */
  level: number | null
  /** Needed for Kappa, when the page says. */
  kappa: boolean | null
  /** Pages of the quests before it. */
  previous: string[]
  /** The quests before it are alternatives ("A or B") or need only accepting: not all to complete. */
  previousLoose: boolean
  /** Map ids from the infobox's location. */
  maps: string[]
  /** The location differs by faction ("BEAR: Reserve, USEC: Lighthouse"). */
  byFaction: boolean
  /** A note says the objectives differ in PvE. */
  pveNote: boolean
  objectives: StoryObjective[]
}

/** A picture in a quest's guide on the Escape from Tarkov wiki. */
export interface GuideImage {
  /** The wiki's file name. */
  file: string
  caption: string
  /** The guide's heading it's under ("Customs"…), or empty. Since 1.38.0. */
  heading: string
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
