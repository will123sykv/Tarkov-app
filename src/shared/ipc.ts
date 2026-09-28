import type {
  DataMode,
  MapPoolsResult,
  PriceState,
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
  poolsMaps: 'pools:maps',
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
  getMapPools(dataMode: DataMode, force?: boolean): Promise<MapPoolsResult>
  getUpdaterStatus(): Promise<UpdaterStatus>
  checkForUpdates(): Promise<UpdaterStatus>
  installUpdate(): Promise<void>
  getAppVersion(): Promise<string>
  onPriceState(listener: (state: PriceState) => void): () => void
  onUpdaterStatus(listener: (status: UpdaterStatus) => void): () => void
}
