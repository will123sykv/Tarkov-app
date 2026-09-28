import { create } from 'zustand'
import { dataModeFor } from '../../shared/gameModes'
import { mergeSettings } from '../../shared/settings'
import type {
  DataMode,
  GameMode,
  MapPoolsResult,
  PriceState,
  PublicSettings,
  SettingsPatch,
  UpdaterStatus
} from '../../shared/types'

interface AppStore {
  settings: PublicSettings | null
  initError: string | null
  prices: Partial<Record<DataMode, PriceState>>
  mapPools: Partial<Record<DataMode, MapPoolsResult>>
  mapPoolsLoading: boolean
  search: string
  updater: UpdaterStatus
  appVersion: string
  settingsOpen: boolean

  init(): Promise<void>
  updateSettings(patch: SettingsPatch): Promise<void>
  setGameMode(mode: GameMode): Promise<void>
  setPlayerLevel(level: number): Promise<void>
  refreshPrices(): Promise<void>
  loadMapPools(force?: boolean): Promise<void>
  applyPriceState(state: PriceState): void
  setSearch(search: string): void
  setSettingsOpen(open: boolean): void
}

let unsubscribers: (() => void)[] = []
let settingsRequest = 0

export const useStore = create<AppStore>((set, get) => ({
  settings: null,
  initError: null,
  prices: {},
  mapPools: {},
  mapPoolsLoading: false,
  search: '',
  updater: { state: 'idle' },
  appVersion: '',
  settingsOpen: false,

  async init() {
    const { api } = window
    unsubscribers.forEach((off) => off())
    unsubscribers = [
      api.onPriceState((state) => get().applyPriceState(state)),
      api.onUpdaterStatus((updater) => set({ updater }))
    ]
    try {
      const [settings, updater, appVersion] = await Promise.all([
        api.getSettings(),
        api.getUpdaterStatus(),
        api.getAppVersion()
      ])
      set({ settings, updater, appVersion })
      const dataMode = dataModeFor(settings.gameMode)
      get().applyPriceState(await api.getPrices(dataMode))
      void get().loadMapPools()
    } catch (err) {
      set({ initError: err instanceof Error ? err.message : String(err) })
    }
  },

  async updateSettings(patch) {
    const current = get().settings
    if (!current) return
    const { tarkovMarketApiKey, ...rest } = patch
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
    if (!get().mapPools[dataMode]) void get().loadMapPools()
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

  async loadMapPools(force = false) {
    const settings = get().settings
    if (!settings) return
    const dataMode = dataModeFor(settings.gameMode)
    set({ mapPoolsLoading: true })
    try {
      const result = await window.api.getMapPools(dataMode, force)
      set((s) => ({ mapPools: { ...s.mapPools, [dataMode]: result } }))
    } finally {
      set({ mapPoolsLoading: false })
    }
  },

  applyPriceState(state) {
    set((s) => {
      const current = s.prices[state.dataMode]
      // IPC replies and broadcasts can arrive out of order; keep the newest.
      if (current && current.revision > state.revision) return s
      return { prices: { ...s.prices, [state.dataMode]: state } }
    })
  },

  setSearch: (search) => set({ search }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen })
}))
