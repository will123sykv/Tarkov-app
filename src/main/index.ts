import { app, BrowserWindow, net, safeStorage, shell } from 'electron'
import { join } from 'node:path'
import { dataModeFor } from '../shared/gameModes'
import { IPC } from '../shared/ipc'
import type { PriceState, UpdaterStatus } from '../shared/types'
import { registerIpc } from './ipc'
import { createMapPoolService } from './pricing/mapPools'
import { createPriceController } from './pricing/priceController'
import { createPriceService } from './pricing/priceService'
import { createSettingsStore } from './settings'
import { initUpdater } from './updater'

const APP_ID = 'com.will123sykv.tarkovlootoptimiser'

let mainWindow: BrowserWindow | null = null

function send(channel: string, payload: PriceState | UpdaterStatus): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function isSafeExternalUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1100,
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

  win.once('ready-to-show', () => win.show())

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
  const prices = createPriceController({
    service: priceService,
    getActiveDataMode: () => dataModeFor(settings.get().gameMode),
    getIntervalMs: () => settings.get().refreshIntervalMin * 60_000,
    broadcast: (state) => send(IPC.pricesState, state)
  })
  const mapPools = createMapPoolService({ fetchFn, cacheDir })

  registerIpc({ settings, prices, mapPools })
  mainWindow = createWindow()
  initUpdater((status) => send(IPC.updaterStatus, status))

  app.on('before-quit', () => prices.dispose())
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

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
