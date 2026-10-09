import type { FleaFeeRates } from './fleaFee'
import type { HistoryPoint, TrendSortKey, TrendStats } from './fleaTrends'

export type GameMode = 'pvp' | 'pve' | 'season'

/** The price economy actually fetched. PvP Season has no tarkov.dev data, so it reads PvP. */
export type DataMode = 'pvp' | 'pve'

export type PriceSource = 'tarkov.dev' | 'tarkov-market'

export interface TraderPrice {
  name: string
  price: number
}

export interface LootItem {
  id: string
  name: string
  shortName: string
  iconLink: string | null
  wikiLink: string | null
  /** Grid size; null when the source only reports a slot count (tarkov-market). */
  width: number | null
  height: number | null
  slots: number
  /** tarkov.dev item types, e.g. "barter", "keys", "noFlea". */
  types: string[]
  category: string | null
  bannedOnFlea: boolean
  /** Per-item flea unlock level on top of the global unlock, if any. */
  minLevelForFlea: number | null
  /** Current flea price in roubles (lowest listing, else 24h average). */
  fleaPrice: number | null
  /** Flea listing fee for selling one unit at fleaPrice. */
  fleaFee: number | null
  bestTrader: TraderPrice | null
  // Optional: absent from tarkov-market data and from caches written by older versions.
  /** Handbook base price; the flea fee is computed from it. */
  basePrice?: number | null
  /** Offers currently up on the flea (a stand-in for how quickly the item sells). */
  offerCount?: number | null
  low24hPrice?: number | null
  high24hPrice?: number | null
  /** What traders sell it for (cash), at a loyalty level and maybe after a quest; tarkov.dev only. */
  buyFrom?: TraderOffer[]
}

export interface TraderOffer {
  traderId: string
  trader: string
  /** Loyalty level needed. */
  level: number
  /** Roubles (dollar and euro prices converted). */
  price: number
  /** The quest that unlocks the offer, if any. */
  questId: string | null
}

export interface PriceDataset {
  dataMode: DataMode
  source: PriceSource
  /** Epoch ms. */
  fetchedAt: number
  fleaMinLevel: number
  items: LootItem[]
  /** Flea listing fee rates, when the source reports them. */
  fleaFeeRates?: FleaFeeRates
  /** Whether only found-in-raid items can be listed on the flea. */
  foundInRaidRequired?: boolean | null
}

export interface PriceFetchResult {
  dataset: PriceDataset | null
  /** True when fresh fetches failed and the dataset came from the local cache. */
  fromCache: boolean
  /** Why the primary source (or every source) failed, if it did. */
  error: string | null
}

export interface PriceState extends PriceFetchResult {
  dataMode: DataMode
  /** Increases on every change, so the renderer can drop out-of-order updates. */
  revision: number
  refreshing: boolean
  lastAttemptAt: number | null
  nextRefreshAt: number | null
}

export interface ContainerCatalog {
  source: string
  sourceUrl: string
  license: string
  /** Month of the newest item in the loot tables (YYYY-MM). */
  dataAsOf: string
  maps: { id: string; name: string }[]
  /** `templates`: the game's template ids for it, as tarkov.dev's maps name containers. */
  containers: { id: string; name: string; mapIds: string[]; templates: string[] }[]
}

export interface ContainerLoot {
  id: string
  name: string
  /** Average number of items one search rolls. */
  expectedCount: number
  /** Share of the container's rolls that are each item; sums to 1. */
  items: { id: string; chance: number }[]
}

export type SortKey = 'valuePerSlot' | 'worth' | 'flea' | 'trader' | 'slots' | 'name' | 'chance'

export interface SortState {
  key: SortKey
  dir: 'asc' | 'desc'
}

export interface PoolSelection {
  /** Container to show the loot of, or null for every item. */
  containerId: string | null
  /** Map whose loot tables to use, or null for all maps combined. */
  mapId: string | null
}

export interface Settings {
  /** Bumped when a default changes, so settings saved with the old default can move to the new one. */
  settingsVersion: number
  gameMode: GameMode
  /** Each mode is a separate in-game character, so each keeps its own level. */
  playerLevels: Record<GameMode, number>
  hideLocked: boolean
  /** Loot tab: only items the hideout or active quests need that can't be bought now or are rare. */
  keepOnly: boolean
  refreshIntervalMin: number
  subtractFleaFee: boolean
  minValuePerSlot: number
  sort: SortState
  pool: PoolSelection
  /** Order of the container list: by average value per search, or A–Z. */
  containerSort: 'value' | 'name'
  view: AppView
  trends: TrendSettings
  /** Keep refreshing and recording prices in the system tray when the window is closed. */
  backgroundRecording: boolean
  /** Start hidden in the tray when Windows starts (only takes effect with background recording). */
  startWithWindows: boolean
  /** The game's Logs folder, when chosen by hand; null finds it automatically. */
  gameLogsDir: string | null
  quests: QuestSettings
  maps: MapSettings
  hideout: HideoutSettings
  /** Since 1.17.0. */
  todo: TodoSettings
  /** Since 1.17.0. */
  keys: KeysSettings
  /** Each tab's sidebar: sections hidden (by heading) and whether it's collapsed (since 1.26.0). */
  sidebars: Partial<Record<AppView, SidebarSettings>>
}

export interface SidebarSettings {
  /** Headings of the sections taken out. */
  hidden: string[]
  /** Folded to a thin strip, the content taking the width. */
  collapsed: boolean
}

export interface TodoSettings {
  /** Everything, or only what the player can do: not behind a key they don't have (since 1.19.0). */
  show: 'all' | 'doable'
  /** Kill and locate objectives, or only one kind (since 1.19.0). */
  kinds: 'all' | 'kill' | 'locate'
  /** Each quest in a few lines, or every objective to tick off (since 1.19.0). */
  view: 'summary' | 'full'
  /** A tile per map to click into, or every map with its quests (since 1.20.0). */
  layout: 'maps' | 'list'
  /** Friends' keys (from their codes) count as yours for what you can do: a squad's keys (since 1.35.0). */
  squadKeys: boolean
}

export interface KeysSettings {
  /** Keys for active quests, also ones you could start, or every quest left. */
  scope: 'active' | 'available' | 'all'
  /** "Keys to buy · Other" (every key no quest needs that you don't have) unfolded (since 1.32.0). */
  otherOpen: boolean
  /** The key list, or reading keys from screenshots (since 1.18.0). */
  tab: 'list' | 'scan'
  /** Only keys used on this map (its group's key, e.g. `customs`), or null for every map (since 1.31.0). */
  map: string | null
  /** The name put in the code you share your keys with (since 1.34.0). */
  shareName: string
  /** Friends' keys, read from the codes they shared (since 1.34.0). */
  friends: KeyFriend[]
}

/** A friend's keys, from the code they shared: shown beside yours, never changing them. */
export interface KeyFriend {
  name: string
  gameMode: GameMode
  keyIds: string[]
  /** When the code was added (ms since the epoch). */
  importedAt: number
}

/** `hideout` is the Items to collect tab (named Hideout before 1.16.0). */
export type AppView = 'loot' | 'trends' | 'todo' | 'quests' | 'hideout' | 'keys' | 'maps' | 'raids'

export interface HideoutSettings {
  /** Count what each station's next level needs, or every level still to build. */
  scope: 'next' | 'all'
  /** Count hand-overs for active quests, or for every quest not yet done (since 1.14.0). */
  questScope: 'active' | 'all'
  /** Items list: what the hideout and quests need, or only one of them (since 1.16.0). */
  source: 'all' | 'hideout' | 'quests'
  /** Hide items the player already has enough of. */
  hideDone: boolean
  /** Only items that must be found in raid. */
  firOnly: boolean
  /** Only items the player can't buy now, or that are rare. */
  keepOnly: boolean
  /** Only items the player could sell: extras, or ones they can buy back now (since 1.14.0). */
  sellOnly: boolean
  /**
   * Screenshots of new loot: sell what's needed but can be bought or crafted now, keeping only what
   * can't and the copies that must be found in raid (since 1.15.0; on by default since 1.25.0).
   */
  scanSellBuyable: boolean
  /** Items needed, the next upgrades, or the screenshot scanner. */
  tab: 'items' | 'upgrades' | 'scav'
}

export type QuestStatusFilter = 'available' | 'active' | 'locked' | 'completed' | 'failed'

export interface QuestSettings {
  statuses: QuestStatusFilter[]
  traderId: string | null
  /** Only quests involving this map (a map id). */
  mapId: string | null
  kappaOnly: boolean
  lightkeeperOnly: boolean
  /** Hide the other faction's quests; null shows both. */
  faction: 'USEC' | 'BEAR' | null
  /** Event quests added from the wiki, by page title (since 1.22.0). */
  wikiQuests: string[]
}

export interface MapSettings {
  /** The map shown, by its normalized name (e.g. `customs`). */
  mapKey: string
  /** Which quests' objectives to mark: active ones, or active and available. */
  questScope: 'active' | 'available' | 'none'
  showExtracts: boolean
  showSpawns: boolean
  showTransits: boolean
  showLabels: boolean
  showBosses: boolean
  showSnipers: boolean
  /** Locks of the keys quests need, and where the ones the player doesn't have spawn (since 1.17.0). */
  showKeys: boolean
  /** Whose extracts to show; co-op extracts show for both. */
  faction: 'pmc' | 'scav'
  /** The favourites panel over the map is open (since 1.27.0, when the 2D maps became the only ones). */
  favouritesOpen: boolean
  /** Favourite items shown on the map as a circle where they turn up most, in the order picked. */
  highlighted: string[]
  /** The banner of kill objectives over the map is open (since 1.33.0). */
  killsOpen: boolean
}

export interface TrendSettings {
  /** Lookback window for patterns, in days. */
  days: 7 | 14 | 30
  /** Liquidity: minimum average number of offers up. */
  minOffers: number
  minPrice: number
  /** Minimum profit per unit after the listing fee. */
  minProfit: number
  /** Minimum share of days the trade would have paid off, 0–1. */
  minConsistency: number
  /** Minimum price swing, 0–2: today's 24h swing while collecting, then the buy→sell gap. */
  minSwing: number
  sort: TrendSortKey
  /** Only items the player can buy and sell on the flea at their level. */
  tradableOnly: boolean
  /** Length of the parts the day is split into, in hours. Since 1.13.0. */
  intervalHours: TrendInterval
  /** Only items to buy or sell now. Since 1.13.0. */
  nowOnly: boolean
}

export type TrendInterval = 2 | 3 | 4 | 6

/** Where flea price history comes from: tarkov.dev's 30 days of scans, or this PC's own recordings. */
export type HistorySourceId = 'tarkov.dev' | 'local'

export interface HistorySourceStatus {
  id: HistorySourceId
  /** Items it has prices for. */
  items: number
  /** Calendar days it covers. */
  days: number
  /** Price points per hour of the day (local time), to show which hours it covers. */
  byHour: number[]
  lastAt: number | null
  /** Why it couldn't be used this time (it may still have older prices). */
  error: string | null
}

/** Settings as exposed to the renderer: the API key itself never leaves the main process. */
export interface PublicSettings extends Settings {
  hasTarkovMarketKey: boolean
}

export type SettingsPatch = Partial<Settings> & {
  /** A string sets the key, null clears it, undefined leaves it alone. */
  tarkovMarketApiKey?: string | null
}

export type UpdaterState =
  'disabled' | 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

export interface UpdaterStatus {
  state: UpdaterState
  version?: string
  percent?: number
  message?: string
}

export interface TrendAnalysis {
  dataMode: DataMode
  days: number
  bucketHours: number
  coverage: {
    /** Recordings taken (each covers all recorded items). */
    snapshots: number
    /** Calendar days with at least one recording. */
    days: number
    firstAt: number | null
    lastAt: number | null
    /** Recordings per hour of the day (local time), to show gaps in coverage. */
    snapshotsByHour: number[]
    items: number
    /** Each source of price history and what it covers. Since 1.13.0. */
    sources: HistorySourceStatus[]
  }
  stats: Record<string, TrendStats>
}

export interface TrendSeries {
  itemId: string
  /** tarkov.dev's history: one point per day. */
  daily: HistoryPoint[]
  dailyError: string | null
}
