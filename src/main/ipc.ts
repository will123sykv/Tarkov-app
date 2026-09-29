import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { dataModeFor, isDataMode, isGameMode } from '../shared/gameModes'
import { IPC } from '../shared/ipc'
import type { ProgressEntry } from '../shared/questProgress'
import type { DataMode, GameMode, Settings, SettingsPatch } from '../shared/types'
import type { ContainerService } from './containers'
import type { LogWatcher } from './logs/watcher'
import type { PriceController } from './pricing/priceController'
import type { PlayerStore } from './quests/playerStore'
import type { QuestDataService } from './quests/questData'
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

function requireGameMode(value: unknown): GameMode {
  if (!isGameMode(value)) throw new Error(`Unknown game mode: ${String(value)}`)
  return value
}

function requireQuestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{24}$/i.test(value)) throw new Error('Invalid quest id')
  return value
}

const PROGRESS_STATUSES: ProgressEntry['status'][] = ['active', 'completed', 'failed']

export function registerIpc(deps: {
  settings: SettingsStore
  prices: PriceController
  containers: ContainerService
  trends: TrendService
  questData: QuestDataService
  player: PlayerStore
  logs: LogWatcher
  onSettingsChanged?: (previous: Settings, current: Settings) => void
}): void {
  const { settings, prices, containers, trends, questData, player, logs } = deps

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

  ipcMain.handle(IPC.questsData, (_e, dataMode: unknown, force: unknown) =>
    questData.get(requireDataMode(dataMode), force === true)
  )
  ipcMain.handle(IPC.questsProgress, (_e, gameMode: unknown) => player.progress(requireGameMode(gameMode)))
  ipcMain.handle(IPC.questsSetStatus, (_e, gameMode: unknown, questId: unknown, status: unknown) => {
    if (status !== null && !PROGRESS_STATUSES.includes(status as ProgressEntry['status']))
      throw new Error('Invalid quest status')
    return player.setStatus(
      requireGameMode(gameMode),
      requireQuestId(questId),
      status as ProgressEntry['status'] | null
    )
  })
  ipcMain.handle(IPC.questsMarkUpTo, async (_e, gameMode: unknown, questId: unknown) => {
    const mode = requireGameMode(gameMode)
    const { dataset } = await questData.get(dataModeFor(mode))
    return player.markUpTo(mode, requireQuestId(questId), dataset?.quests ?? [])
  })
  ipcMain.handle(IPC.logsHistory, (_e, gameMode: unknown) => player.history(requireGameMode(gameMode)))
  ipcMain.handle(IPC.logsStatus, () => logs.status())
  ipcMain.handle(IPC.logsRescan, async () => {
    await logs.rescan()
    return logs.status()
  })
  ipcMain.handle(IPC.logsChooseFolder, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Choose the Escape from Tarkov Logs folder',
      properties: ['openDirectory']
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    const { previous, current } = await settings.update({ gameLogsDir: result.filePaths[0] })
    deps.onSettingsChanged?.(previous, current)
    return current
  })

  ipcMain.handle(IPC.updaterGetStatus, () => getUpdaterStatus())
  ipcMain.handle(IPC.updaterCheck, () => checkForUpdates())
  ipcMain.handle(IPC.updaterInstall, () => installUpdate())
  ipcMain.handle(IPC.appVersion, () => app.getVersion())
}
