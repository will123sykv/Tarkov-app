import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdaterStatus } from '../shared/types'

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

let status: UpdaterStatus = { state: 'idle' }
let notify: (status: UpdaterStatus) => void = () => {}

function setStatus(next: UpdaterStatus): UpdaterStatus {
  status = next
  notify(status)
  return status
}

export function getUpdaterStatus(): UpdaterStatus {
  return status
}

export async function checkForUpdates(): Promise<UpdaterStatus> {
  if (status.state === 'disabled') return status
  try {
    // Resolves to null without emitting any events when this build can't self-update
    // (e.g. a portable or unpacked build without app-update.yml).
    const result = await autoUpdater.checkForUpdatesAndNotify()
    if (result === null && status.state === 'idle') {
      setStatus({ state: 'disabled', message: "Automatic updates aren't available for this build." })
    }
  } catch (err) {
    setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) })
  }
  return status
}

export function installUpdate(): void {
  if (status.state === 'downloaded') autoUpdater.quitAndInstall()
}

/** Checks GitHub Releases for a newer installer (packaged builds only). */
export function initUpdater(onStatus: (status: UpdaterStatus) => void): void {
  notify = onStatus
  if (!app.isPackaged) {
    setStatus({ state: 'disabled', message: 'Updates are only checked in the installed app.' })
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => setStatus({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', (info) =>
    setStatus({ state: 'not-available', version: info.version })
  )
  autoUpdater.on('download-progress', (p) =>
    setStatus({ state: 'downloading', version: status.version, percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => setStatus({ state: 'downloaded', version: info.version }))
  autoUpdater.on('error', (err) => setStatus({ state: 'error', message: err.message }))

  void checkForUpdates()
  setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS)
}
