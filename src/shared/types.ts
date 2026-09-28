import type { CategoryId } from './categories'

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
}

export interface PriceDataset {
  dataMode: DataMode
  source: PriceSource
  /** Epoch ms. */
  fetchedAt: number
  fleaMinLevel: number
  items: LootItem[]
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

export interface MapPool {
  id: string
  name: string
  itemIds: string[]
}

export interface MapPoolsResult {
  pools: MapPool[]
  fetchedAt: number | null
  error: string | null
}

export type SortKey = 'valuePerSlot' | 'worth' | 'flea' | 'trader' | 'slots' | 'name'

export interface SortState {
  key: SortKey
  dir: 'asc' | 'desc'
}

export interface PoolSelection {
  category: CategoryId
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
