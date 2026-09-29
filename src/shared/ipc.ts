import type { LogHistory, LogWatcherStatus } from './logTypes'
import type { ProgressEntry, QuestProgress } from './questProgress'
import type { QuestDataState } from './questTypes'
import type {
  ContainerCatalog,
  ContainerLoot,
  DataMode,
  GameMode,
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
  questsData: 'quests:data',
  questsProgress: 'quests:progress',
  questsSetStatus: 'quests:set-status',
  questsMarkUpTo: 'quests:mark-up-to',
  questsProgressChanged: 'quests:progress-changed',
  logsHistory: 'logs:history',
  logsHistoryChanged: 'logs:history-changed',
  logsStatus: 'logs:status',
  logsStatusChanged: 'logs:status-changed',
  logsRescan: 'logs:rescan',
  logsChooseFolder: 'logs:choose-folder',
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
  /** Quests and maps for a game mode's data (cached; `force` refetches). */
  getQuestData(dataMode: DataMode, force?: boolean): Promise<QuestDataState>
  getQuestProgress(gameMode: GameMode): Promise<QuestProgress>
  /** Set a quest's status by hand, or clear it with null. */
  setQuestStatus(
    gameMode: GameMode,
    questId: string,
    status: ProgressEntry['status'] | null
  ): Promise<QuestProgress>
  /** Mark a quest and everything that had to come before it as done. */
  markQuestsUpTo(gameMode: GameMode, questId: string): Promise<QuestProgress>
  /** Raids and flea sales read from the game's logs. */
  getLogHistory(gameMode: GameMode): Promise<LogHistory>
  getLogStatus(): Promise<LogWatcherStatus>
  /** Forget what was read from the logs and read them all again. */
  rescanLogs(): Promise<LogWatcherStatus>
  /** Pick the Logs folder by hand; resolves to the saved settings, or null if cancelled. */
  chooseLogsFolder(): Promise<PublicSettings | null>
  onQuestProgress(listener: (update: { gameMode: GameMode; progress: QuestProgress }) => void): () => void
  onLogHistory(listener: (update: { gameMode: GameMode; history: LogHistory }) => void): () => void
  onLogStatus(listener: (status: LogWatcherStatus) => void): () => void
  getUpdaterStatus(): Promise<UpdaterStatus>
  checkForUpdates(): Promise<UpdaterStatus>
  installUpdate(): Promise<void>
  getAppVersion(): Promise<string>
  onPriceState(listener: (state: PriceState) => void): () => void
  onUpdaterStatus(listener: (status: UpdaterStatus) => void): () => void
}
