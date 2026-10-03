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
  analyzeTrends: (dataMode, days, intervalHours) =>
    ipcRenderer.invoke(IPC.trendsAnalyze, dataMode, days, intervalHours),
  getTrendSeries: (dataMode, itemId) => ipcRenderer.invoke(IPC.trendsSeries, dataMode, itemId),
  getQuestData: (dataMode, force) => ipcRenderer.invoke(IPC.questsData, dataMode, force === true),
  getQuestGuide: (wikiLink) => ipcRenderer.invoke(IPC.questsGuide, wikiLink),
  getQuestProgress: (gameMode) => ipcRenderer.invoke(IPC.questsProgress, gameMode),
  setQuestStatus: (gameMode, questId, status) =>
    ipcRenderer.invoke(IPC.questsSetStatus, gameMode, questId, status),
  markQuestsUpTo: (gameMode, questId) => ipcRenderer.invoke(IPC.questsMarkUpTo, gameMode, questId),
  getObjectiveProgress: (gameMode) => ipcRenderer.invoke(IPC.questsObjectives, gameMode),
  setObjectiveProgress: (gameMode, questId, objectiveId, value) =>
    ipcRenderer.invoke(IPC.questsSetObjective, gameMode, questId, objectiveId, value),
  getStoryPins: () => ipcRenderer.invoke(IPC.questsPins),
  setStoryPin: (questId, objectiveId, pin) => ipcRenderer.invoke(IPC.questsSetPin, questId, objectiveId, pin),
  getHideoutProgress: (gameMode) => ipcRenderer.invoke(IPC.hideoutProgress, gameMode),
  setStationLevel: (gameMode, stationId, level) =>
    ipcRenderer.invoke(IPC.hideoutSetLevel, gameMode, stationId, level),
  setHideoutHave: (gameMode, itemId, count) =>
    ipcRenderer.invoke(IPC.hideoutSetHave, gameMode, itemId, count),
  setHideoutHaveMany: (gameMode, counts) => ipcRenderer.invoke(IPC.hideoutSetHaveMany, gameMode, counts),
  setTraderLevel: (gameMode, traderId, level) =>
    ipcRenderer.invoke(IPC.hideoutSetTrader, gameMode, traderId, level),
  buildStationLevel: (gameMode, stationId, level) =>
    ipcRenderer.invoke(IPC.hideoutBuild, gameMode, stationId, level),
  readLabels: (jobs) => ipcRenderer.invoke(IPC.scanReadText, jobs),
  getGridImage: (itemId) => ipcRenderer.invoke(IPC.scanGridImage, itemId),
  getLatestScreenshot: () => ipcRenderer.invoke(IPC.scanLatestScreenshot),
  getLogHistory: (gameMode) => ipcRenderer.invoke(IPC.logsHistory, gameMode),
  getLogStatus: () => ipcRenderer.invoke(IPC.logsStatus),
  rescanLogs: () => ipcRenderer.invoke(IPC.logsRescan),
  chooseLogsFolder: () => ipcRenderer.invoke(IPC.logsChooseFolder),
  onQuestProgress: (listener) => subscribe(IPC.questsProgressChanged, listener),
  onLogHistory: (listener) => subscribe(IPC.logsHistoryChanged, listener),
  onHideoutProgress: (listener) => subscribe(IPC.hideoutProgressChanged, listener),
  onLogStatus: (listener) => subscribe(IPC.logsStatusChanged, listener),
  getUpdaterStatus: () => ipcRenderer.invoke(IPC.updaterGetStatus),
  checkForUpdates: () => ipcRenderer.invoke(IPC.updaterCheck),
  installUpdate: () => ipcRenderer.invoke(IPC.updaterInstall),
  getAppVersion: () => ipcRenderer.invoke(IPC.appVersion),
  onPriceState: (listener) => subscribe(IPC.pricesState, listener),
  onUpdaterStatus: (listener) => subscribe(IPC.updaterStatus, listener)
}

contextBridge.exposeInMainWorld('api', api)
