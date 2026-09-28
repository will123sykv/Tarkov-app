import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type TarkovApi } from '../shared/ipc'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: TarkovApi = {
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  getPrices: (dataMode) => ipcRenderer.invoke(IPC.pricesGet, dataMode),
  refreshPrices: (dataMode) => ipcRenderer.invoke(IPC.pricesRefresh, dataMode),
  getContainerCatalog: () => ipcRenderer.invoke(IPC.containersCatalog),
  getContainerLoot: (mapId) => ipcRenderer.invoke(IPC.containersLoot, mapId),
  getUpdaterStatus: () => ipcRenderer.invoke(IPC.updaterGetStatus),
  checkForUpdates: () => ipcRenderer.invoke(IPC.updaterCheck),
  installUpdate: () => ipcRenderer.invoke(IPC.updaterInstall),
  getAppVersion: () => ipcRenderer.invoke(IPC.appVersion),
  onPriceState: (listener) => subscribe(IPC.pricesState, listener),
  onUpdaterStatus: (listener) => subscribe(IPC.updaterStatus, listener)
}

contextBridge.exposeInMainWorld('api', api)
