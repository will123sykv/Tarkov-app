import type {
  ContainerCatalog,
  ContainerLoot,
  DataMode,
  PriceState,
  TrendAnalysis,
  TrendSeries,
  PublicSettings,
  SettingsPatch,
  UpdaterStatus
} from './types'

export const IPC = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  pricesGet: 'prices:get',
  pricesRefresh: 'prices:refresh',
  pricesState: 'prices:state',
  containersCatalog: 'containers:catalog',
  containersLoot: 'containers:loot',
  trendsAnalyze: 'trends:analyze',
  trendsSeries: 'trends:series',
  updaterStatus: 'updater:status',
  updaterGetStatus: 'updater:get-status',
  updaterCheck: 'updater:check',
  updaterInstall: 'updater:install',
  appVersion: 'app:version'
} as const

/** The bridge the preload script exposes to the renderer as `window.api`. */
export interface TarkovApi {
  getSettings(): Promise<PublicSettings>
  updateSettings(patch: SettingsPatch): Promise<PublicSettings>
  /** Current price state; loads the cache and starts a refresh if the data is due. */
  getPrices(dataMode: DataMode): Promise<PriceState>
  refreshPrices(dataMode: DataMode): Promise<PriceState>
  getContainerCatalog(): Promise<ContainerCatalog>
  /** Loot per container for one map, or all maps combined when mapId is null. */
  getContainerLoot(mapId: string | null): Promise<ContainerLoot[]>
  /** Time-of-day price patterns from the app's own recordings over the last `days` days. */
  analyzeTrends(dataMode: DataMode, days: number): Promise<TrendAnalysis>
  /** tarkov.dev's daily price history for one item (the last 60 days). */
  getTrendSeries(dataMode: DataMode, itemId: string): Promise<TrendSeries>
  getUpdaterStatus(): Promise<UpdaterStatus>
  checkForUpdates(): Promise<UpdaterStatus>
  installUpdate(): Promise<void>
  getAppVersion(): Promise<string>
  onPriceState(listener: (state: PriceState) => void): () => void
  onUpdaterStatus(listener: (status: UpdaterStatus) => void): () => void
}
