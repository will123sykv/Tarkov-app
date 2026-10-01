import { app, BrowserWindow, net, protocol, safeStorage, shell } from 'electron'
import { join } from 'node:path'
import { dataModeFor } from '../shared/gameModes'
import { IPC } from '../shared/ipc'
import type { ContainerLootData } from '../shared/containerData'
import { createContainerService } from './containers'
import containerLootData from './data/containerLoot.json'
import { createBackgroundMode, launchedHidden } from './background'
import { registerIpc } from './ipc'
import { locateLogsDir } from './logs/locate'
import { createLogWatcher } from './logs/watcher'
import { createMapAssetHandler, MAP_SCHEME } from './maps/mapAssets'
import { createPriceController } from './pricing/priceController'
import { createPriceService } from './pricing/priceService'
import { createPlayerStore } from './quests/playerStore'
import { createQuestDataService } from './quests/questData'
import { createQuestGuideService } from './quests/questGuide'
import { createSettingsStore } from './settings'
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
      sandbox: true
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
    fetchFn,
    getDataset: (dataMode) => prices.peek(dataMode)?.dataset ?? null
  })

  protocol.handle(MAP_SCHEME, createMapAssetHandler({ cacheDir: join(userData, 'map-cache'), fetchFn }))
  const questData = createQuestDataService({ fetchFn, cacheDir })
  const questGuides = createQuestGuideService({ fetchFn, cacheDir })
  const player = createPlayerStore({ file: join(userData, 'player.json') })
  const logs = createLogWatcher({
    stateFile: join(userData, 'logs', 'state.json'),
    locate: () => locateLogsDir(settings.get().gameLogsDir),
    onEvents: async (events, reset) => {
      for (const gameMode of await player.applyEvents(events, reset)) {
        send(IPC.questsProgressChanged, { gameMode, progress: await player.progress(gameMode) })
        send(IPC.logsHistoryChanged, { gameMode, history: await player.history(gameMode) })
      }
    },
    onStatus: (status) => send(IPC.logsStatusChanged, status)
  })

  const background = createBackgroundMode({
    isEnabled: () => settings.get().backgroundRecording,
    getWindow: () => mainWindow
  })
  registerIpc({
    settings,
    prices,
    containers,
    trends,
    questData,
    questGuides,
    player,
    logs,
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
