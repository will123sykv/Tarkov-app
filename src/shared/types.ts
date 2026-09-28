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
  containers: { id: string; name: string; mapIds: string[] }[]
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
  gameMode: GameMode
  /** Each mode is a separate in-game character, so each keeps its own level. */
  playerLevels: Record<GameMode, number>
  hideLocked: boolean
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
}

export type AppView = 'loot' | 'trends'

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
  }
  stats: Record<string, TrendStats>
}

export interface TrendSeries {
  itemId: string
  /** tarkov.dev's history: one point per day. */
  daily: HistoryPoint[]
  dailyError: string | null
}
