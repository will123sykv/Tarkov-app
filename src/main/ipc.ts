import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { dataModeFor, isDataMode, isGameMode } from '../shared/gameModes'
import { IPC } from '../shared/ipc'
import { TREND_INTERVALS } from '../shared/settings'
import { MAX_KEYS } from '../shared/keys'
import { handOverItemOf, type ProgressEntry } from '../shared/questProgress'
import { MAX_OCR_IMAGE_BYTES, MAX_OCR_JOBS, type OcrJob } from '../shared/scanTypes'
import type { StoryPin } from '../shared/storyPlaces'
import type { DataMode, GameMode, Settings, SettingsPatch } from '../shared/types'
import type { ContainerService } from './containers'
import type { LogWatcher } from './logs/watcher'
import type { PriceController } from './pricing/priceController'
import type { PlayerStore } from './quests/playerStore'
import type { ScanService } from './scan/scanService'
import type { QuestDataService } from './quests/questData'
import type { QuestGuideService } from './quests/questGuide'
import type { WikiQuestService } from './quests/wikiQuests'
import { MAX_WIKI_QUESTS } from '../shared/settings'
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

/**
 * tarkov.dev's quest ids (24 hex characters), a story chapter's own (`story-<name>`) or an event
 * quest's from the wiki (`wiki-<name>`).
 */
function requireQuestId(value: unknown): string {
  if (typeof value !== 'string' || !/^([0-9a-f]{24}|(story|wiki)-[a-z0-9-]{1,80})$/i.test(value))
    throw new Error('Invalid quest id')
  return value
}

/** tarkov.dev's objective ids, or a story chapter objective's (its text, slugged, `#n` for repeats). */
function requireObjectiveId(value: unknown): string {
  if (typeof value !== 'string' || !/^([0-9a-f]{24}|[a-z0-9-]{1,120}(#\d{1,3})?)$/i.test(value))
    throw new Error('Invalid objective id')
  return value
}

/** Station and item ids are tarkov.dev's (24 hex characters). */
function requireId(value: unknown, what: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{24}$/i.test(value)) throw new Error(`Invalid ${what} id`)
  return value
}

function requireCount(value: unknown, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max)
    throw new Error('Invalid number')
  return value
}

/** Game coordinates are within a few kilometres of a map's centre. */
const MAX_COORDINATE = 20_000

/** A pin on a story step: a map (tarkov.dev's id) and a position on it, or null to take it off. */
function requirePin(value: unknown): StoryPin | null {
  if (value === null) return null
  const { map, position } = (value ?? {}) as Partial<StoryPin>
  const coordinate = (n: unknown): number => {
    if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > MAX_COORDINATE)
      throw new Error('Invalid position')
    return n
  }
  if (!position || typeof position !== 'object') throw new Error('Invalid position')
  return {
    map: requireId(map, 'map'),
    position: { x: coordinate(position.x), y: coordinate(position.y), z: coordinate(position.z) }
  }
}

/** Labels from the renderer: a bounded list of small images. */
function requireOcrJobs(value: unknown): OcrJob[] {
  if (!Array.isArray(value) || value.length > MAX_OCR_JOBS) throw new Error('Invalid labels')
  return value.map((job) => {
    const { kind, image } = (job ?? {}) as Partial<OcrJob>
    if (
      (kind !== 'name' && kind !== 'count') ||
      !(image instanceof Uint8Array) ||
      image.length > MAX_OCR_IMAGE_BYTES
    )
      throw new Error('Invalid label')
    return { kind, image }
  })
}

/** Most counts one call may set (more items than the hideout could ever need). */
const MAX_COUNT_CHANGES = 2000

const PROGRESS_STATUSES: ProgressEntry['status'][] = ['active', 'completed', 'failed']

export function registerIpc(deps: {
  settings: SettingsStore
  prices: PriceController
  containers: ContainerService
  trends: TrendService
  questData: QuestDataService
  questGuides: QuestGuideService
  wikiQuests: WikiQuestService
  player: PlayerStore
  logs: LogWatcher
  scan: ScanService
  onSettingsChanged?: (previous: Settings, current: Settings) => void
}): void {
  const { settings, prices, containers, trends, questData, questGuides, wikiQuests, player, logs, scan } =
    deps

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
  ipcMain.handle(IPC.trendsAnalyze, (_e, dataMode: unknown, days: unknown, intervalHours: unknown) =>
    trends.analyze(
      requireDataMode(dataMode),
      lookbackDays(days),
      TREND_INTERVALS.find((n) => n === intervalHours) ?? 3
    )
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
  ipcMain.handle(IPC.questsGuide, (_e, wikiLink: unknown) =>
    questGuides.get(typeof wikiLink === 'string' ? wikiLink : null)
  )
  ipcMain.handle(IPC.wikiQuestList, (_e, force: unknown) => wikiQuests.list(force === true))
  ipcMain.handle(IPC.wikiQuestGet, async (_e, titles: unknown, dataMode: unknown) => {
    if (
      !Array.isArray(titles) ||
      titles.length > MAX_WIKI_QUESTS ||
      !titles.every((t) => typeof t === 'string')
    )
      throw new Error('Invalid wiki quest titles')
    const { dataset } = await questData.get(requireDataMode(dataMode))
    return wikiQuests.get(titles as string[], dataset?.maps ?? [])
  })
  ipcMain.handle(IPC.wikiQuestResolve, (_e, input: unknown) => {
    if (typeof input !== 'string' || input.length > 500) throw new Error('Invalid wiki link or name')
    return wikiQuests.resolve(input)
  })
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
  ipcMain.handle(IPC.questsObjectives, (_e, gameMode: unknown) =>
    player.objectives(requireGameMode(gameMode))
  )
  ipcMain.handle(
    IPC.questsSetObjective,
    async (_e, gameMode: unknown, questId: unknown, objectiveId: unknown, value: unknown) => {
      const mode = requireGameMode(gameMode)
      const quest = requireQuestId(questId)
      const id = requireObjectiveId(objectiveId)
      const count = requireCount(value, 1_000_000_000)
      // Items handed over come off what the player has put aside.
      const { dataset } = await questData.get(dataModeFor(mode))
      const objective = dataset?.quests.find((q) => q.id === quest)?.objectives.find((o) => o.id === id)
      return player.setObjective(mode, quest, id, count, objective ? handOverItemOf(objective) : null)
    }
  )
  ipcMain.handle(IPC.questsPins, () => player.pins())
  ipcMain.handle(IPC.questsSetPin, (_e, questId: unknown, objectiveId: unknown, pin: unknown) =>
    player.setPin(requireQuestId(questId), requireObjectiveId(objectiveId), requirePin(pin))
  )
  ipcMain.handle(IPC.questsMarkUpTo, async (_e, gameMode: unknown, questId: unknown) => {
    const mode = requireGameMode(gameMode)
    const { dataset } = await questData.get(dataModeFor(mode))
    return player.markUpTo(mode, requireQuestId(questId), dataset?.quests ?? [])
  })
  ipcMain.handle(IPC.hideoutProgress, (_e, gameMode: unknown) => player.hideout(requireGameMode(gameMode)))
  ipcMain.handle(IPC.hideoutSetLevel, (_e, gameMode: unknown, stationId: unknown, level: unknown) =>
    player.setStationLevel(
      requireGameMode(gameMode),
      requireId(stationId, 'station'),
      requireCount(level, 20)
    )
  )
  ipcMain.handle(IPC.hideoutSetHave, (_e, gameMode: unknown, itemId: unknown, count: unknown) =>
    player.setHave(requireGameMode(gameMode), requireId(itemId, 'item'), requireCount(count, 100_000))
  )
  ipcMain.handle(IPC.hideoutSetHaveMany, (_e, gameMode: unknown, counts: unknown) => {
    if (!counts || typeof counts !== 'object' || Array.isArray(counts)) throw new Error('Invalid counts')
    const entries = Object.entries(counts)
    if (entries.length > MAX_COUNT_CHANGES) throw new Error('Too many counts')
    const valid = Object.fromEntries(
      entries.map(([id, n]) => [requireId(id, 'item'), requireCount(n, 100_000)])
    )
    return player.setHaveMany(requireGameMode(gameMode), valid)
  })
  ipcMain.handle(IPC.hideoutSetTrader, (_e, gameMode: unknown, traderId: unknown, level: unknown) => {
    const n = requireCount(level, 4)
    if (n < 1) throw new Error('Invalid loyalty level')
    return player.setTraderLevel(requireGameMode(gameMode), requireId(traderId, 'trader'), n)
  })
  ipcMain.handle(IPC.keysGet, (_e, gameMode: unknown) => player.keys(requireGameMode(gameMode)))
  ipcMain.handle(IPC.keysSet, (_e, gameMode: unknown, keyId: unknown, list: unknown, on: unknown) => {
    if (list !== 'owned' && list !== 'toDo') throw new Error('Invalid key list')
    if (typeof on !== 'boolean') throw new Error('Invalid key state')
    return player.setKey(requireGameMode(gameMode), requireId(keyId, 'item'), list, on)
  })
  ipcMain.handle(IPC.favouritesGet, (_e, gameMode: unknown) => player.favourites(requireGameMode(gameMode)))
  ipcMain.handle(IPC.favouritesSet, (_e, gameMode: unknown, kind: unknown, id: unknown, on: unknown) => {
    if (kind !== 'items' && kind !== 'upgrades' && kind !== 'quests') throw new Error('Invalid favourite')
    if (typeof id !== 'string' || !/^[\w:-]{1,80}$/.test(id)) throw new Error('Invalid favourite id')
    if (typeof on !== 'boolean') throw new Error('Invalid favourite state')
    return player.setFavourite(requireGameMode(gameMode), kind, id, on)
  })
  ipcMain.handle(IPC.keysSetOwned, (_e, gameMode: unknown, keyIds: unknown) => {
    if (!Array.isArray(keyIds) || keyIds.length > MAX_KEYS) throw new Error('Invalid keys')
    return player.setOwnedKeys(
      requireGameMode(gameMode),
      keyIds.map((id) => requireId(id, 'item'))
    )
  })
  ipcMain.handle(IPC.hideoutBuild, async (_e, gameMode: unknown, stationId: unknown, level: unknown) => {
    const mode = requireGameMode(gameMode)
    const id = requireId(stationId, 'station')
    const target = requireCount(level, 20)
    const { dataset } = await questData.get(dataModeFor(mode))
    const items =
      dataset?.stations.find((s) => s.id === id)?.levels.find((l) => l.level === target)?.items ?? []
    return player.build(mode, id, target, items)
  })
  ipcMain.handle(IPC.scanReadText, (_e, jobs: unknown) => scan.readText(requireOcrJobs(jobs)))
  ipcMain.handle(IPC.scanGridImage, (_e, itemId: unknown) => scan.gridImage(requireId(itemId, 'item')))
  ipcMain.handle(IPC.scanLatestScreenshot, () => scan.latestScreenshot())
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
