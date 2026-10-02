import { create } from 'zustand'
import { dataModeFor } from '../../shared/gameModes'
import { mergeSettings } from '../../shared/settings'
import type { HideoutProgress } from '../../shared/hideout'
import type { LogHistory, LogWatcherStatus } from '../../shared/logTypes'
import type { ObjectiveProgress, ProgressEntry, QuestProgress } from '../../shared/questProgress'
import type { QuestDataState } from '../../shared/questTypes'
import type { StoryPin, StoryPins } from '../../shared/storyPlaces'
import type {
  ContainerCatalog,
  ContainerLoot,
  DataMode,
  GameMode,
  PriceDataset,
  PriceState,
  PublicSettings,
  SettingsPatch,
  TrendAnalysis,
  TrendSeries,
  UpdaterStatus
} from '../../shared/types'

interface AppStore {
  settings: PublicSettings | null
  initError: string | null
  prices: Partial<Record<DataMode, PriceState>>
  containerCatalog: ContainerCatalog | null
  /** Container loot keyed by map id ('' = all maps combined). */
  containerLoot: Record<string, ContainerLoot[]>
  search: string
  trendAnalysis: Partial<Record<DataMode, TrendAnalysis>>
  trendsLoading: boolean
  trendsError: string | null
  /** Keyed by `${dataMode}:${itemId}`. */
  trendSeries: Record<string, TrendSeries>
  selectedTrendItem: string | null
  questData: Partial<Record<DataMode, QuestDataState>>
  questProgress: Partial<Record<GameMode, QuestProgress>>
  objectiveProgress: Partial<Record<GameMode, ObjectiveProgress>>
  hideoutProgress: Partial<Record<GameMode, HideoutProgress>>
  logHistory: Partial<Record<GameMode, LogHistory>>
  logStatus: LogWatcherStatus | null
  selectedQuest: string | null
  /** A quest objective to centre the map on. */
  mapFocus: { questId: string; objectiveId: string | null } | null
  /** The player's own pins on story steps (the same in every game mode). */
  storyPins: StoryPins
  /** A story step waiting for the player to click where it is on the map. */
  placing: { questId: string; objectiveId: string } | null
  updater: UpdaterStatus
  appVersion: string
  settingsOpen: boolean

  init(): Promise<void>
  updateSettings(patch: SettingsPatch): Promise<void>
  setGameMode(mode: GameMode): Promise<void>
  setPlayerLevel(level: number): Promise<void>
  refreshPrices(): Promise<void>
  setContainerMap(mapId: string | null): Promise<void>
  applyPriceState(state: PriceState): void
  loadTrends(): Promise<void>
  loadTrendSeries(itemId: string): Promise<void>
  selectTrendItem(itemId: string | null): void
  loadQuestData(force?: boolean): Promise<void>
  loadPlayerData(): Promise<void>
  setObjectiveProgress(questId: string, objectiveId: string, value: number): Promise<void>
  setQuestStatus(questId: string, status: ProgressEntry['status'] | null): Promise<void>
  markQuestsUpTo(questId: string): Promise<void>
  setStationLevel(stationId: string, level: number): Promise<void>
  setHideoutHave(itemId: string, count: number): Promise<void>
  setHideoutHaveMany(counts: Record<string, number>): Promise<void>
  buildStationLevel(stationId: string, level: number): Promise<void>
  setTraderLevel(traderId: string, level: number): Promise<void>
  rescanLogs(): Promise<void>
  chooseLogsFolder(): Promise<void>
  selectQuest(questId: string | null): void
  showOnMap(questId: string, objectiveId: string | null, mapKey: string): Promise<void>
  /** Open the map to put a pin on a story step (`mapKey` null: the map shown now). */
  pinOnMap(questId: string, objectiveId: string, mapKey: string | null): Promise<void>
  setPlacing(placing: AppStore['placing']): void
  setStoryPin(questId: string, objectiveId: string, pin: StoryPin | null): Promise<void>
  setSearch(search: string): void
  setSettingsOpen(open: boolean): void
}

let unsubscribers: (() => void)[] = []
let settingsRequest = 0
/** When each trend series was fetched, so a long-running app picks up new daily prices. */
const seriesFetchedAt = new Map<string, number>()
const SERIES_MAX_AGE_MS = 60 * 60_000

export function trendSeriesKey(dataMode: DataMode, itemId: string): string {
  return `${dataMode}:${itemId}`
}

function sameFetch(a: PriceDataset, b: PriceDataset): boolean {
  return a.fetchedAt === b.fetchedAt && a.source === b.source && a.items.length === b.items.length
}

export function containerLootKey(mapId: string | null): string {
  return mapId ?? ''
}

async function loadContainerLoot(mapId: string | null): Promise<void> {
  const key = containerLootKey(mapId)
  if (useStore.getState().containerLoot[key]) return
  const loot = await window.api.getContainerLoot(mapId)
  useStore.setState((s) => ({ containerLoot: { ...s.containerLoot, [key]: loot } }))
}

export const useStore = create<AppStore>((set, get) => ({
  settings: null,
  initError: null,
  prices: {},
  containerCatalog: null,
  containerLoot: {},
  search: '',
  trendAnalysis: {},
  trendsLoading: false,
  trendsError: null,
  trendSeries: {},
  selectedTrendItem: null,
  questData: {},
  questProgress: {},
  objectiveProgress: {},
  hideoutProgress: {},
  logHistory: {},
  logStatus: null,
  selectedQuest: null,
  mapFocus: null,
  storyPins: {},
  placing: null,
  updater: { state: 'idle' },
  appVersion: '',
  settingsOpen: false,

  async init() {
    const { api } = window
    unsubscribers.forEach((off) => off())
    unsubscribers = [
      api.onPriceState((state) => get().applyPriceState(state)),
      api.onUpdaterStatus((updater) => set({ updater })),
      api.onQuestProgress(({ gameMode, progress }) =>
        set((s) => ({ questProgress: { ...s.questProgress, [gameMode]: progress } }))
      ),
      api.onLogHistory(({ gameMode, history }) =>
        set((s) => ({ logHistory: { ...s.logHistory, [gameMode]: history } }))
      ),
      api.onLogStatus((logStatus) => set({ logStatus }))
    ]
    void api.getLogStatus().then((logStatus) => set((s) => (s.logStatus ? s : { logStatus })))
    try {
      const [settings, updater, appVersion, containerCatalog] = await Promise.all([
        api.getSettings(),
        api.getUpdaterStatus(),
        api.getAppVersion(),
        api.getContainerCatalog()
      ])
      set({ settings, updater, appVersion, containerCatalog })
      await loadContainerLoot(settings.pool.mapId)
      get().applyPriceState(await api.getPrices(dataModeFor(settings.gameMode)))
    } catch (err) {
      set({ initError: err instanceof Error ? err.message : String(err) })
    }
  },

  async updateSettings(patch) {
    const current = get().settings
    if (!current) return
    const { tarkovMarketApiKey, ...rest } = patch
    // Leaving the maps drops a pin waiting to be placed.
    if (patch.view && patch.view !== 'maps') set({ placing: null })
    // Optimistic so inputs stay responsive; the main process returns the sanitized result.
    set({
      settings: {
        ...mergeSettings(current, rest),
        hasTarkovMarketKey:
          tarkovMarketApiKey === undefined ? current.hasTarkovMarketKey : Boolean(tarkovMarketApiKey)
      }
    })
    const request = ++settingsRequest
    const saved = await window.api.updateSettings(patch)
    if (request === settingsRequest) set({ settings: saved })
  },

  async setGameMode(gameMode) {
    await get().updateSettings({ gameMode })
    const dataMode = dataModeFor(gameMode)
    get().applyPriceState(await window.api.getPrices(dataMode))
  },

  async setPlayerLevel(level) {
    const settings = get().settings
    if (!settings) return
    await get().updateSettings({
      playerLevels: { ...settings.playerLevels, [settings.gameMode]: level }
    })
  },

  async refreshPrices() {
    const settings = get().settings
    if (!settings) return
    get().applyPriceState(await window.api.refreshPrices(dataModeFor(settings.gameMode)))
  },

  async setContainerMap(mapId) {
    const settings = get().settings
    if (!settings) return
    await Promise.all([get().updateSettings({ pool: { ...settings.pool, mapId } }), loadContainerLoot(mapId)])
  },

  applyPriceState(state) {
    set((s) => {
      const current = s.prices[state.dataMode]
      // IPC replies and broadcasts can arrive out of order; keep the newest.
      if (current && current.revision > state.revision) return s
      // Every broadcast (e.g. "refreshing…") carries a fresh copy of the whole dataset. Keep the
      // copy already held when it's the same fetch, so rankings built on it aren't recomputed.
      const dataset =
        current?.dataset && state.dataset && sameFetch(current.dataset, state.dataset)
          ? current.dataset
          : state.dataset
      return { prices: { ...s.prices, [state.dataMode]: { ...state, dataset } } }
    })
  },

  async loadTrends() {
    const settings = get().settings
    if (!settings) return
    const dataMode = dataModeFor(settings.gameMode)
    set({ trendsLoading: true })
    try {
      const analysis = await window.api.analyzeTrends(dataMode, settings.trends.days)
      set((s) => ({ trendAnalysis: { ...s.trendAnalysis, [dataMode]: analysis }, trendsError: null }))
    } catch (err) {
      set({ trendsError: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ trendsLoading: false })
    }
  },

  async loadTrendSeries(itemId) {
    const settings = get().settings
    if (!settings) return
    const dataMode = dataModeFor(settings.gameMode)
    const key = trendSeriesKey(dataMode, itemId)
    const cached = get().trendSeries[key]
    if (cached && !cached.dailyError && Date.now() - (seriesFetchedAt.get(key) ?? 0) < SERIES_MAX_AGE_MS)
      return
    let series: TrendSeries
    try {
      series = await window.api.getTrendSeries(dataMode, itemId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      series = { itemId, daily: [], dailyError: message }
    }
    seriesFetchedAt.set(key, Date.now())
    set((s) => ({ trendSeries: { ...s.trendSeries, [key]: series } }))
  },

  selectTrendItem: (selectedTrendItem) => set({ selectedTrendItem }),

  async loadQuestData(force = false) {
    const settings = get().settings
    if (!settings) return
    const dataMode = dataModeFor(settings.gameMode)
    const current = get().questData[dataMode]
    if (current?.loading) return
    set((s) => ({
      questData: {
        ...s.questData,
        [dataMode]: { dataset: current?.dataset ?? null, fromCache: false, error: null, loading: true }
      }
    }))
    try {
      const state = await window.api.getQuestData(dataMode, force)
      set((s) => ({ questData: { ...s.questData, [dataMode]: state } }))
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      set((s) => ({
        questData: {
          ...s.questData,
          [dataMode]: { dataset: current?.dataset ?? null, fromCache: true, error, loading: false }
        }
      }))
    }
  },

  async loadPlayerData() {
    const settings = get().settings
    if (!settings) return
    const gameMode = settings.gameMode
    const [progress, history, hideout, objectives, storyPins] = await Promise.all([
      window.api.getQuestProgress(gameMode),
      window.api.getLogHistory(gameMode),
      window.api.getHideoutProgress(gameMode),
      window.api.getObjectiveProgress(gameMode),
      window.api.getStoryPins()
    ])
    set((s) => ({
      storyPins,
      questProgress: { ...s.questProgress, [gameMode]: progress },
      objectiveProgress: { ...s.objectiveProgress, [gameMode]: objectives },
      logHistory: { ...s.logHistory, [gameMode]: history },
      hideoutProgress: { ...s.hideoutProgress, [gameMode]: hideout }
    }))
  },

  async setObjectiveProgress(questId, objectiveId, value) {
    const gameMode = get().settings?.gameMode
    if (!gameMode) return
    const objectives = await window.api.setObjectiveProgress(gameMode, questId, objectiveId, value)
    set((s) => ({ objectiveProgress: { ...s.objectiveProgress, [gameMode]: objectives } }))
  },

  async setQuestStatus(questId, status) {
    const gameMode = get().settings?.gameMode
    if (!gameMode) return
    const progress = await window.api.setQuestStatus(gameMode, questId, status)
    set((s) => ({ questProgress: { ...s.questProgress, [gameMode]: progress } }))
  },

  async markQuestsUpTo(questId) {
    const gameMode = get().settings?.gameMode
    if (!gameMode) return
    const progress = await window.api.markQuestsUpTo(gameMode, questId)
    set((s) => ({ questProgress: { ...s.questProgress, [gameMode]: progress } }))
  },

  async setStationLevel(stationId, level) {
    const gameMode = get().settings?.gameMode
    if (!gameMode) return
    const hideout = await window.api.setStationLevel(gameMode, stationId, level)
    set((s) => ({ hideoutProgress: { ...s.hideoutProgress, [gameMode]: hideout } }))
  },

  async setHideoutHave(itemId, count) {
    const gameMode = get().settings?.gameMode
    if (!gameMode) return
    const hideout = await window.api.setHideoutHave(gameMode, itemId, count)
    set((s) => ({ hideoutProgress: { ...s.hideoutProgress, [gameMode]: hideout } }))
  },

  async setHideoutHaveMany(counts) {
    const gameMode = get().settings?.gameMode
    if (!gameMode) return
    const hideout = await window.api.setHideoutHaveMany(gameMode, counts)
    set((s) => ({ hideoutProgress: { ...s.hideoutProgress, [gameMode]: hideout } }))
  },

  async setTraderLevel(traderId, level) {
    const gameMode = get().settings?.gameMode
    if (!gameMode) return
    const hideout = await window.api.setTraderLevel(gameMode, traderId, level)
    set((s) => ({ hideoutProgress: { ...s.hideoutProgress, [gameMode]: hideout } }))
  },

  async buildStationLevel(stationId, level) {
    const gameMode = get().settings?.gameMode
    if (!gameMode) return
    const hideout = await window.api.buildStationLevel(gameMode, stationId, level)
    set((s) => ({ hideoutProgress: { ...s.hideoutProgress, [gameMode]: hideout } }))
  },

  async rescanLogs() {
    set({ logStatus: await window.api.rescanLogs() })
  },

  async chooseLogsFolder() {
    const settings = await window.api.chooseLogsFolder()
    if (settings) set({ settings })
  },

  selectQuest: (selectedQuest) => set({ selectedQuest }),

  async showOnMap(questId, objectiveId, mapKey) {
    const settings = get().settings
    if (!settings) return
    set({ mapFocus: { questId, objectiveId }, selectedQuest: questId })
    await get().updateSettings({ view: 'maps', maps: { ...settings.maps, mapKey } })
  },

  async pinOnMap(questId, objectiveId, mapKey) {
    const settings = get().settings
    if (!settings) return
    set({ placing: { questId, objectiveId }, selectedQuest: questId })
    await get().updateSettings({
      view: 'maps',
      maps: { ...settings.maps, mapKey: mapKey ?? settings.maps.mapKey }
    })
  },

  setPlacing: (placing) => set({ placing }),

  async setStoryPin(questId, objectiveId, pin) {
    set({ storyPins: await window.api.setStoryPin(questId, objectiveId, pin) })
  },
  setSearch: (search) => set({ search }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen })
}))
