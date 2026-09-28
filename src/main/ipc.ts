import { app, ipcMain } from 'electron'
import { isDataMode } from '../shared/gameModes'
import { IPC } from '../shared/ipc'
import type { DataMode, Settings, SettingsPatch } from '../shared/types'
import type { ContainerService } from './containers'
import type { PriceController } from './pricing/priceController'
import type { SettingsStore } from './settings'
import type { TrendService } from './trends/trendService'
import { checkForUpdates, getUpdaterStatus, installUpdate } from './updater'

function lookbackDays(value: unknown): number {
  const days = Number(value)
  return Number.isFinite(days) ? Math.min(30, Math.max(1, Math.round(days))) : 7
}

function requireDataMode(value: unknown): DataMode {
  if (!isDataMode(value)) throw new Error(`Unknown data mode: ${String(value)}`)
  return value
}

export function registerIpc(deps: {
  settings: SettingsStore
  prices: PriceController
  containers: ContainerService
  trends: TrendService
  onSettingsChanged?: (previous: Settings, current: Settings) => void
}): void {
  const { settings, prices, containers, trends } = deps

  ipcMain.handle(IPC.settingsGet, () => settings.getPublic())
  ipcMain.handle(IPC.settingsUpdate, async (_e, patch: SettingsPatch) => {
    const { previous, current } = await settings.update(patch ?? {})
    deps.onSettingsChanged?.(previous, current)
    if (
      previous.gameMode !== current.gameMode ||
      previous.refreshIntervalMin !== current.refreshIntervalMin
    ) {
      prices.reschedule()
    }
    return current
  })

  ipcMain.handle(IPC.pricesGet, (_e, dataMode: unknown) => prices.getState(requireDataMode(dataMode)))
  ipcMain.handle(IPC.pricesRefresh, (_e, dataMode: unknown) => prices.refresh(requireDataMode(dataMode)))
  ipcMain.handle(IPC.containersCatalog, () => containers.catalog())
  ipcMain.handle(IPC.trendsAnalyze, (_e, dataMode: unknown, days: unknown) =>
    trends.analyze(requireDataMode(dataMode), lookbackDays(days))
  )
  ipcMain.handle(IPC.trendsSeries, (_e, dataMode: unknown, itemId: unknown) => {
    if (typeof itemId !== 'string' || !/^[0-9a-z-]{1,64}$/i.test(itemId)) throw new Error('Invalid item id')
    return trends.series(requireDataMode(dataMode), itemId)
  })
  ipcMain.handle(IPC.containersLoot, (_e, mapId: unknown) =>
    containers.loot(typeof mapId === 'string' && mapId ? mapId : null)
  )

  ipcMain.handle(IPC.updaterGetStatus, () => getUpdaterStatus())
  ipcMain.handle(IPC.updaterCheck, () => checkForUpdates())
  ipcMain.handle(IPC.updaterInstall, () => installUpdate())
  ipcMain.handle(IPC.appVersion, () => app.getVersion())
}
