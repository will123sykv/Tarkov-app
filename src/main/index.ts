import { app, BrowserWindow, net, Notification, protocol, safeStorage, shell } from 'electron'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { dataModeFor } from '../shared/gameModes'
import { handOversLeft, haveTotals } from '../shared/hideout'
import { IPC } from '../shared/ipc'
import type { ContainerLootData } from '../shared/containerData'
import type { RaidRecord } from '../shared/logTypes'
import type { GameMode } from '../shared/types'
import { createContainerService } from './containers'
import containerLootData from './data/containerLoot.json'
import { createBackgroundMode, launchedHidden } from './background'
import { registerIpc } from './ipc'
import { raidsToAsk } from './logs/afterRaid'
import { createLogsLocator } from './logs/locate'
import { createLogWatcher } from './logs/watcher'
import { createBackups } from './backups'
import { createCraftNotifier } from './craftTimers'
import { createMapAssetHandler, MAP_SCHEME } from './maps/mapAssets'
import { createPriceController } from './pricing/priceController'
import { createPriceService } from './pricing/priceService'
import { createPlayerStore } from './quests/playerStore'
import { createScanService } from './scan/scanService'
import { createQuestDataService } from './quests/questData'
import { createQuestGuideService } from './quests/questGuide'
import { allowQuestWiki } from './questWiki'
import { createWikiQuestService } from './quests/wikiQuests'
import { createSettingsStore } from './settings'
import { createTarkovDevHistory } from './trends/history'
import { createPriceRecorder } from './trends/recorder'
import { createTrendService } from './trends/trendService'
import { initUpdater } from './updater'

const APP_ID = 'com.will123sykv.tarkovlootoptimiser'

let mainWindow: BrowserWindow | null = null
let showMainWindow = (): void => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

// Map images are served from a disk cache through this scheme (see maps/mapAssets.ts).
protocol.registerSchemesAsPrivileged([
  {
    scheme: MAP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
])

/** Raids already asked about after they ended (since 1.66.0), so none is asked about twice. */
const askedRaids = new Set<string>()

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function isSafeExternalUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

function createWindow(showWhenReady = true): BrowserWindow {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1200,
    minHeight: 600,
    show: false,
    backgroundColor: '#101214',
    autoHideMenuBar: true,
    title: 'Tarkov Loot Optimiser',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Only for a quest's wiki page in the quest panel (see questWiki.ts).
      webviewTag: true
    }
  })

  if (showWhenReady) win.once('ready-to-show', () => win.show())

  // Links (wiki pages, release notes) open in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })
  allowQuestWiki(win.webContents, (url) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

async function bootstrap(): Promise<void> {
  const userData = app.getPath('userData')
  const cacheDir = join(userData, 'cache')
  const log = (message: string): void => console.warn(`[tarkov-loot] ${message}`)
  const fetchFn = (url: string, init?: RequestInit): Promise<Response> => net.fetch(url, init)
  // 1.45.0 could show Map Genie's Lab map in its own session; that's gone, so is what it kept (a
  // Map Genie sign-in, cookies).
  void rm(join(userData, 'Partitions', 'mapgenie'), { recursive: true, force: true }).catch(() => {})

  // A damaged progress or settings file is put back from its backup before anything reads it.
  const backups = createBackups({ dir: userData })
  const recoveries = await backups.recover().catch((err) => {
    log(`Checking saved files failed: ${err}`)
    return []
  })

  const settings = createSettingsStore({
    dir: userData,
    log,
    codec: {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (plain) => safeStorage.encryptString(plain),
      decrypt: (data) => safeStorage.decryptString(data)
    }
  })
  await settings.load()

  const priceService = createPriceService({
    fetchFn,
    cacheDir,
    getTarkovMarketKey: settings.getTarkovMarketKey,
    log
  })
  const recorder = createPriceRecorder({ dir: join(userData, 'trends') })
  const prices = createPriceController({
    service: priceService,
    getActiveDataMode: () => dataModeFor(settings.get().gameMode),
    getIntervalMs: () => settings.get().refreshIntervalMin * 60_000,
    broadcast: (state) => send(IPC.pricesState, state),
    onFresh: (dataset) => void recorder.record(dataset).catch((err) => log(`Recording prices failed: ${err}`))
  })
  const containers = createContainerService(containerLootData as ContainerLootData)

  const trends = createTrendService({
    recorder,
    history: createTarkovDevHistory({ dir: join(userData, 'trends'), fetchFn }),
    fetchFn,
    getDataset: (dataMode) => prices.peek(dataMode)?.dataset ?? null
  })

  const mapAssets = createMapAssetHandler({ cacheDir: join(userData, 'map-cache'), fetchFn })
  protocol.handle(MAP_SCHEME, mapAssets)
  const scan = createScanService({
    assets: mapAssets,
    screenshotsDir: () => join(app.getPath('documents'), 'Escape from Tarkov', 'Screenshots'),
    log
  })
  app.on('will-quit', () => void scan.dispose())
  const questData = createQuestDataService({ fetchFn, cacheDir })
  const questGuides = createQuestGuideService({ fetchFn, cacheDir })
  const wikiQuests = createWikiQuestService({ fetchFn, cacheDir })
  const player = createPlayerStore({ file: join(userData, 'player.json') })
  // Today's backup, once the files are known to be good (and again each day the app stays open).
  const backUp = (): void => void backups.daily().catch((err) => log(`Backing up failed: ${err}`))
  backUp()
  setInterval(backUp, 60 * 60_000).unref()
  const locateLogs = createLogsLocator()
  const logs = createLogWatcher({
    stateFile: join(userData, 'logs', 'state.json'),
    locate: () => locateLogs(settings.get().gameLogsDir),
    onEvents: async (events, reset) => {
      // Reading everything again starts from scratch: what's there now is backed up first (since 1.66.0).
      if (reset) await backups.before('rescan').catch((err) => log(`Backing up failed: ${err}`))
      const { changed, completed } = await player.applyEvents(events, reset)
      for (const gameMode of changed) {
        send(IPC.questsProgressChanged, { gameMode, progress: await player.progress(gameMode) })
        send(IPC.logsHistoryChanged, { gameMode, history: await player.history(gameMode) })
      }
      // Quests just handed in: what was still to hand over comes off the items put aside.
      const handedIn = new Set<GameMode>()
      for (const { mode, questId, at } of completed) {
        if (!Object.keys(haveTotals(await player.hideout(mode))).length) continue
        const { dataset } = await questData.get(dataModeFor(mode))
        const quest = dataset?.quests.find((q) => q.id === questId)
        if (quest && (await player.handOver(mode, handOversLeft(quest, await player.objectives(mode)), at)))
          handedIn.add(mode)
      }
      for (const gameMode of handedIn)
        send(IPC.hideoutProgressChanged, { gameMode, hideout: await player.hideout(gameMode) })
      // A PMC raid just ended: offer to tick off what got done on its maps (since 1.66.0; every map a
      // run went to by transits since 1.70.0, from the raids just saved).
      if (settings.get().quests.askAfterRaid) {
        const modes = [...new Set(events.flatMap((e) => (e.kind === 'raid' ? [e.mode] : [])))]
        const saved = new Map(
          await Promise.all(modes.map(async (m) => [m, (await player.history(m)).raids] as const))
        )
        const run = (mode: GameMode, raid: RaidRecord): { maps: string[]; startedAt: number | null } => {
          const legs = [
            ...(raid.runId === undefined
              ? []
              : (saved.get(mode) ?? []).filter((r) => r.runId === raid.runId)),
            raid
          ].sort((a, b) => a.foundAt - b.foundAt)
          return {
            maps: [...new Set(legs.map((r) => r.map))],
            startedAt: legs.find((r) => r.startedAt !== null)?.startedAt ?? null
          }
        }
        for (const ended of raidsToAsk(events, Date.now(), reset, askedRaids, run))
          send(IPC.logsRaidEnded, ended)
      }
    },
    onStatus: (status) => send(IPC.logsStatusChanged, status)
  })

  const background = createBackgroundMode({
    isEnabled: () => settings.get().backgroundRecording,
    getWindow: () => mainWindow
  })
  // Craft timers (since 1.66.0): a Windows notification when one's done, that opens the app.
  const MODES: GameMode[] = ['pvp', 'pve', 'season']
  const craftNotifier = createCraftNotifier({
    timers: async () => Promise.all(MODES.map(async (mode) => ({ mode, timers: await player.crafts(mode) }))),
    markNotified: async (mode, stationIds) => {
      send(IPC.craftsChanged, { gameMode: mode, crafts: await player.markCraftsNotified(mode, stationIds) })
    },
    isEnabled: () => settings.get().crafting.notifyDone,
    notify: (done) => {
      if (!Notification.isSupported()) return
      const note = new Notification({
        title: done.length === 1 ? 'Craft done' : `${done.length} crafts done`,
        body: done.map((t) => t.label).join('\n')
      })
      note.on('click', () => background.showWindow())
      note.show()
    }
  })
  void craftNotifier.reschedule().catch((err) => log(`Craft timers failed: ${err}`))

  registerIpc({
    onCraftsChanged: () => void craftNotifier.reschedule().catch((err) => log(`Craft timers failed: ${err}`)),
    settings,
    prices,
    containers,
    trends,
    questData,
    questGuides,
    wikiQuests,
    player,
    logs,
    scan,
    backups,
    recoveries,
    onSettingsChanged: (previous, current) => {
      if (previous.gameLogsDir !== current.gameLogsDir) void logs.poll()
      if (
        previous.backgroundRecording !== current.backgroundRecording ||
        previous.startWithWindows !== current.startWithWindows
      ) {
        background.apply(current)
      }
    }
  })
  // Launched at Windows login with background recording on: stay in the tray.
  mainWindow = createWindow(!(launchedHidden() && settings.get().backgroundRecording))
  background.attach(mainWindow)
  background.apply(settings.get())
  showMainWindow = background.showWindow
  initUpdater((status) => send(IPC.updaterStatus, status))
  logs.start()

  app.on('before-quit', () => {
    prices.dispose()
    logs.stop()
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID)
    void bootstrap()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
