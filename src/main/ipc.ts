import { app, ipcMain } from 'electron'
import { isDataMode } from '../shared/gameModes'
import { IPC } from '../shared/ipc'
import type { DataMode, SettingsPatch } from '../shared/types'
import type { ContainerService } from './containers'
import type { PriceController } from './pricing/priceController'
import type { SettingsStore } from './settings'
import { checkForUpdates, getUpdaterStatus, installUpdate } from './updater'

function requireDataMode(value: unknown): DataMode {
  if (!isDataMode(value)) throw new Error(`Unknown data mode: ${String(value)}`)
  return value
}

export function registerIpc(deps: {
  settings: SettingsStore
  prices: PriceController
  containers: ContainerService
}): void {
  const { settings, prices, containers } = deps

  ipcMain.handle(IPC.settingsGet, () => settings.getPublic())
  ipcMain.handle(IPC.settingsUpdate, async (_e, patch: SettingsPatch) => {
    const { previous, current } = await settings.update(patch ?? {})
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
  ipcMain.handle(IPC.containersLoot, (_e, mapId: unknown) =>
    containers.loot(typeof mapId === 'string' && mapId ? mapId : null)
  )

  ipcMain.handle(IPC.updaterGetStatus, () => getUpdaterStatus())
  ipcMain.handle(IPC.updaterCheck, () => checkForUpdates())
  ipcMain.handle(IPC.updaterInstall, () => installUpdate())
  ipcMain.handle(IPC.appVersion, () => app.getVersion())
}
